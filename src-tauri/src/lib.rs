use regex::Regex;
use rusqlite::Connection;
use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use url::Url;

// ── Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkItem {
    pub title: String,
    pub url: String,
    pub link_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryGroup {
    pub url: String,
    pub snapshots: Vec<HistorySnapshot>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistorySnapshot {
    pub id: i64,
    pub timestamp: i64,
    pub children: Vec<HistoryChild>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryChild {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub link_type: String,
}

// ── Database ──

fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS master_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sub_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            master_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            link_type TEXT NOT NULL,
            FOREIGN KEY (master_id) REFERENCES master_links(id) ON DELETE CASCADE
        );
        PRAGMA foreign_keys = ON;",
    )
    .expect("Failed to initialize database");
}

// ── YouTube helpers ──

fn is_youtube_playlist(url_str: &str) -> bool {
    if let Ok(parsed) = Url::parse(url_str) {
        let host = parsed.host_str().unwrap_or("");
        let is_yt =
            host == "youtube.com" || host == "www.youtube.com" || host == "m.youtube.com";
        let has_list = parsed.query_pairs().any(|(key, _)| key == "list");
        is_yt && has_list
    } else {
        false
    }
}

fn extract_youtube_playlist(html: &str) -> Vec<LinkItem> {
    let mut links = Vec::new();
    let mut seen = HashSet::new();

    let re = Regex::new(r"var\s+ytInitialData\s*=\s*(\{.*?\});\s*</script>").unwrap();
    let json_str = if let Some(caps) = re.captures(html) {
        caps.get(1).map(|m| m.as_str().to_string())
    } else {
        let re2 = Regex::new(r"ytInitialData\s*=\s*(\{.*?\});\s*</script>").unwrap();
        re2.captures(html)
            .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
    };

    if let Some(json_str) = json_str {
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&json_str) {
            if let Some(items) = find_playlist_items(&data) {
                for item in items {
                    if let (Some(title), Some(video_id)) =
                        (extract_video_title(item), extract_video_id(item))
                    {
                        let video_url =
                            format!("https://www.youtube.com/watch?v={}", video_id);
                        if seen.insert(video_url.clone()) {
                            links.push(LinkItem {
                                title,
                                url: video_url,
                                link_type: "youtube".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    links
}

fn find_playlist_items(data: &serde_json::Value) -> Option<&Vec<serde_json::Value>> {
    data.get("contents")?
        .get("twoColumnBrowseResultsRenderer")?
        .get("tabs")?
        .get(0)?
        .get("tabRenderer")?
        .get("content")?
        .get("sectionListRenderer")?
        .get("contents")?
        .get(0)?
        .get("itemSectionRenderer")?
        .get("contents")?
        .get(0)?
        .get("playlistVideoListRenderer")?
        .get("contents")?
        .as_array()
}

fn extract_video_title(item: &serde_json::Value) -> Option<String> {
    item.get("playlistVideoRenderer")?
        .get("title")?
        .get("runs")?
        .get(0)?
        .get("text")?
        .as_str()
        .map(|s| s.to_string())
}

fn extract_video_id(item: &serde_json::Value) -> Option<String> {
    item.get("playlistVideoRenderer")?
        .get("videoId")?
        .as_str()
        .map(|s| s.to_string())
}

// ── Webpage content extraction ──

fn find_main_content<'a>(document: &'a Html) -> Option<ElementRef<'a>> {
    let selectors = [
        "main",
        "[role=\"main\"]",
        "#main-content",
        "#main",
        "#content",
        "article",
        ".main-content",
        ".content",
        ".post-content",
        ".entry-content",
        ".page-content",
    ];

    for sel_str in &selectors {
        if let Ok(sel) = Selector::parse(sel_str) {
            if let Some(el) = document.select(&sel).next() {
                return Some(el);
            }
        }
    }
    None
}

const NAV_SELECTORS: &[&str] = &[
    "nav",
    "header",
    "footer",
    "[role=\"navigation\"]",
    "[role=\"banner\"]",
    "[role=\"contentinfo\"]",
    ".navbar",
    ".nav",
    ".navigation",
    ".menu",
    ".sidebar",
    ".footer",
    ".header",
    "#navbar",
    "#nav",
    "#footer",
    "#header",
    "#sidebar",
];

fn is_inside_nav(element: &ElementRef, document: &Html) -> bool {
    for sel_str in NAV_SELECTORS {
        if let Ok(sel) = Selector::parse(sel_str) {
            for nav_el in document.select(&sel) {
                let nav_id = nav_el.id();
                let mut current = element.parent();
                while let Some(parent) = current {
                    if parent.id() == nav_id {
                        return true;
                    }
                    current = parent.parent();
                }
            }
        }
    }
    false
}

fn extract_links_from_root<'a>(
    root: impl Iterator<Item = ElementRef<'a>>,
    base: &Option<Url>,
) -> Vec<LinkItem> {
    let mut links = Vec::new();
    let mut seen = HashSet::new();

    for element in root {
        let href = match element.value().attr("href") {
            Some(h) => h,
            None => continue,
        };

        let resolved = if let Some(ref base) = base {
            base.join(href).map(|u| u.to_string()).unwrap_or_default()
        } else {
            href.to_string()
        };

        if resolved.is_empty()
            || resolved.starts_with("javascript:")
            || resolved.starts_with("mailto:")
            || resolved.starts_with("tel:")
            || resolved.starts_with('#')
        {
            continue;
        }

        let text: String = element.text().collect::<Vec<_>>().join(" ");
        let title = text.trim().to_string();
        let title = if title.is_empty() {
            resolved.clone()
        } else {
            title
        };

        if seen.insert(resolved.clone()) {
            links.push(LinkItem {
                title,
                url: resolved,
                link_type: "webpage".to_string(),
            });
        }
    }

    links
}

fn extract_webpage_links(html: &str, base_url: &str) -> Vec<LinkItem> {
    let document = Html::parse_document(html);
    let a_selector = Selector::parse("a[href]").unwrap();
    let base = Url::parse(base_url).ok();

    if let Some(main_el) = find_main_content(&document) {
        let links = extract_links_from_root(main_el.select(&a_selector), &base);
        if !links.is_empty() {
            return links;
        }
    }

    let filtered = document
        .select(&a_selector)
        .filter(|el| !is_inside_nav(el, &document));
    let links = extract_links_from_root(filtered, &base);
    if !links.is_empty() {
        return links;
    }

    extract_links_from_root(document.select(&a_selector), &base)
}

// ── Content validation ──

fn build_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(5))
        .connect_timeout(std::time::Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

fn has_article_content(client: &reqwest::blocking::Client, url: &str) -> bool {
    if let Ok(parsed) = Url::parse(url) {
        let host = parsed.host_str().unwrap_or("");
        // YouTube/known content hosts: skip check
        if host.contains("youtube.com") || host.contains("youtu.be")
            || host.contains("github.com") || host.contains("arxiv.org")
            || host.contains("medium.com") || host.contains("substack.com")
            || host.contains("wikipedia.org") || host.contains("nytimes.com")
            || host.contains("bbc.com") || host.contains("bbc.co.uk")
        {
            return true;
        }
    }

    // Single GET request — check content-type header, then body if HTML
    let response = match client.get(url).send() {
        Ok(r) if r.status().is_success() => r,
        _ => return false,
    };

    let ct = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if ct.contains("application/pdf") || ct.contains("image/") || ct.contains("video/") {
        return true;
    }
    if !ct.is_empty() && !ct.contains("text/html") {
        return false;
    }

    let html = match response.text() {
        Ok(t) => t,
        Err(_) => return false,
    };

    let document = Html::parse_document(&html);

    // Quick check: count <p> tag words
    if let Ok(p_sel) = Selector::parse("p") {
        let total_p_words: usize = document
            .select(&p_sel)
            .take(30)
            .map(|el| {
                let text: String = el.text().collect::<Vec<_>>().join(" ");
                text.split_whitespace().count()
            })
            .sum();
        if total_p_words > 50 {
            return true;
        }
    }

    // Check semantic content areas
    let content_selectors = ["article", "main", "[role=\"main\"]", ".content", "#content"];
    for sel_str in &content_selectors {
        if let Ok(sel) = Selector::parse(sel_str) {
            for el in document.select(&sel) {
                let text: String = el.text().collect::<Vec<_>>().join(" ");
                if text.split_whitespace().count() > 50 {
                    return true;
                }
            }
        }
    }

    false
}

// ── Progress event types ──

#[derive(Clone, Serialize)]
struct ProgressEvent {
    stage: String,
    checked: usize,
    total: usize,
    found: usize,
}

#[derive(Clone, Serialize)]
struct LinkValidated {
    url: String,
    valid: bool,
}

#[derive(Clone, Serialize)]
struct ValidationDone {
    valid_links: Vec<LinkItem>,
}

// ── Tauri commands ──

struct DbState(Mutex<Connection>);

/// Step 1: Fetch page, parse links, return candidates INSTANTLY (no validation).
#[tauri::command]
fn extract_links(
    url: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<LinkItem>, String> {
    Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    let _ = app_handle.emit("extract-progress", ProgressEvent {
        stage: "Fetching page…".into(),
        checked: 0, total: 0, found: 0,
    });

    let client = build_client()?;

    let response = client
        .get(&url)
        .send()
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let html = response
        .text()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let _ = app_handle.emit("extract-progress", ProgressEvent {
        stage: "Parsing links…".into(),
        checked: 0, total: 0, found: 0,
    });

    let candidate_links = if is_youtube_playlist(&url) {
        let yt_links = extract_youtube_playlist(&html);
        if yt_links.is_empty() {
            extract_webpage_links(&html, &url)
        } else {
            yt_links
        }
    } else {
        extract_webpage_links(&html, &url)
    };

    let _ = app_handle.emit("extract-progress", ProgressEvent {
        stage: format!("{} links found — validating…", candidate_links.len()),
        checked: 0, total: candidate_links.len(), found: 0,
    });

    Ok(candidate_links)
}

/// Step 2: Validate candidate links in background, emitting events as results come in.
#[tauri::command]
fn validate_links(
    url: String,
    candidates: Vec<LinkItem>,
    app_handle: tauri::AppHandle,
    db: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let total = candidates.len();
    let client = Arc::new(build_client()?);
    let app = app_handle.clone();

    // Get a clone of the DB connection via Arc
    let db_path = {
        let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;
        conn.path().map(|p| p.to_string())
    };

    let db_path = db_path.ok_or("No DB path")?;

    std::thread::spawn(move || {
        let mut all_valid: Vec<LinkItem> = Vec::new();
        let mut total_checked: usize = 0;

        let batch_size = 10;
        for batch in candidates.chunks(batch_size) {
            let batch_results: Arc<Mutex<Vec<(LinkItem, bool)>>> = Arc::new(Mutex::new(Vec::new()));

            let handles: Vec<_> = batch.iter().map(|link| {
                let client = Arc::clone(&client);
                let link = link.clone();
                let batch_results = Arc::clone(&batch_results);

                std::thread::spawn(move || {
                    let valid = has_article_content(&client, &link.url);
                    batch_results.lock().unwrap().push((link, valid));
                })
            }).collect();

            for h in handles {
                let _ = h.join();
            }

            let results = Arc::try_unwrap(batch_results)
                .unwrap_or_else(|a| Mutex::new(a.lock().unwrap().clone()))
                .into_inner()
                .unwrap_or_default();

            total_checked += results.len();

            for (link, valid) in &results {
                let _ = app.emit("link-validated", LinkValidated {
                    url: link.url.clone(),
                    valid: *valid,
                });
                if *valid {
                    all_valid.push(link.clone());
                }
            }

            let _ = app.emit("extract-progress", ProgressEvent {
                stage: format!("Checked {}/{}…", total_checked, total),
                checked: total_checked,
                total,
                found: all_valid.len(),
            });
        }

        // Emit final results
        let _ = app.emit("extract-progress", ProgressEvent {
            stage: format!("Done — {} links with content", all_valid.len()),
            checked: total, total, found: all_valid.len(),
        });

        // Store in DB BEFORE emitting validation-done so refreshHistory() sees the data
        if let Ok(conn) = Connection::open(&db_path) {

            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64;

            let _ = conn.execute(
                "INSERT INTO master_links (url, timestamp) VALUES (?1, ?2)",
                rusqlite::params![&url, timestamp],
            );

            let master_id = conn.last_insert_rowid();
            for link in &all_valid {
                let _ = conn.execute(
                    "INSERT INTO sub_links (master_id, title, url, link_type) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![master_id, &link.title, &link.url, &link.link_type],
                );
            }
        }

        let _ = app.emit("validation-done", ValidationDone {
            valid_links: all_valid.clone(),
        });
    });

    Ok(())
}

#[tauri::command]
fn get_history(db: tauri::State<'_, DbState>) -> Result<Vec<HistoryGroup>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, url, timestamp FROM master_links ORDER BY timestamp DESC")
        .map_err(|e| format!("DB error: {}", e))?;

    let masters: Vec<(i64, String, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| format!("DB error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Group by URL, preserving order (most recent URL group first)
    let mut group_map: std::collections::HashMap<String, Vec<HistorySnapshot>> = std::collections::HashMap::new();
    let mut url_order: Vec<String> = Vec::new();

    for (id, url, timestamp) in masters {
        let mut child_stmt = conn
            .prepare("SELECT id, title, url, link_type FROM sub_links WHERE master_id = ?1 ORDER BY id")
            .map_err(|e| format!("DB error: {}", e))?;

        let children: Vec<HistoryChild> = child_stmt
            .query_map([id], |row| {
                Ok(HistoryChild {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    url: row.get(2)?,
                    link_type: row.get(3)?,
                })
            })
            .map_err(|e| format!("DB error: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        if !group_map.contains_key(&url) {
            url_order.push(url.clone());
        }

        group_map.entry(url.clone()).or_default().push(HistorySnapshot {
            id,
            timestamp,
            children,
        });
    }

    let groups = url_order.into_iter().map(|url| {
        let snapshots = group_map.remove(&url).unwrap_or_default();
        HistoryGroup { url, snapshots }
    }).collect();

    Ok(groups)
}

#[tauri::command]
fn load_history_links(
    master_id: i64,
    db: tauri::State<'_, DbState>,
) -> Result<Vec<LinkItem>, String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT title, url, link_type FROM sub_links WHERE master_id = ?1 ORDER BY id")
        .map_err(|e| format!("DB error: {}", e))?;

    let links: Vec<LinkItem> = stmt
        .query_map([master_id], |row| {
            Ok(LinkItem {
                title: row.get(0)?,
                url: row.get(1)?,
                link_type: row.get(2)?,
            })
        })
        .map_err(|e| format!("DB error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(links)
}

#[tauri::command]
fn delete_history_entries(
    master_ids: Vec<i64>,
    db: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("DB lock error: {}", e))?;

    for id in master_ids {
        conn.execute("DELETE FROM sub_links WHERE master_id = ?1", [id])
            .map_err(|e| format!("DB error: {}", e))?;
        conn.execute("DELETE FROM master_links WHERE id = ?1", [id])
            .map_err(|e| format!("DB error: {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Helper to update splash screen status text
            fn set_splash(app: &tauri::AppHandle, msg: &str, ready: bool) {
                if let Some(splash) = app.get_webview_window("splash") {
                    let escaped = msg.replace('\'', "\\'");
                    let _ = splash.eval(&format!(
                        "updateStatus('{}', {})", escaped, ready
                    ));
                }
            }

            set_splash(&app_handle, "Initializing database…", false);

            let db_path = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&db_path).ok();
            let db_file = db_path.join("history.db");
            let conn = Connection::open(db_file).expect("Failed to open database");
            init_db(&conn);
            app.manage(DbState(Mutex::new(conn)));

            // Verify networking in background, then show main window
            let app_handle2 = app_handle.clone();
            std::thread::spawn(move || {
                // Give splash a moment to render
                std::thread::sleep(std::time::Duration::from_millis(500));

                set_splash(&app_handle2, "Checking network connectivity…", false);

                // Verify TLS/HTTPS works by making a lightweight HEAD request
                let net_ok = match build_client() {
                    Ok(client) => {
                        client.head("https://www.google.com")
                            .timeout(std::time::Duration::from_secs(5))
                            .send()
                            .is_ok()
                    }
                    Err(_) => false,
                };

                if net_ok {
                    set_splash(&app_handle2, "Ready!", true);
                } else {
                    set_splash(&app_handle2, "Network unavailable — starting in offline mode", true);
                }

                // Pause so the user sees the ready status
                std::thread::sleep(std::time::Duration::from_millis(800));

                if let Some(splash) = app_handle2.get_webview_window("splash") {
                    let _ = splash.close();
                }
                if let Some(main) = app_handle2.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            extract_links,
            validate_links,
            get_history,
            load_history_links,
            delete_history_entries
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
