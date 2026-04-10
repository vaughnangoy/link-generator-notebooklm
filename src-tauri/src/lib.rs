use regex::Regex;
use scraper::{Html, Selector};
use serde::Serialize;
use std::collections::HashSet;
use url::Url;

#[derive(Debug, Clone, Serialize)]
pub struct LinkItem {
    pub title: String,
    pub url: String,
    pub link_type: String,
}

fn is_youtube_playlist(url_str: &str) -> bool {
    if let Ok(parsed) = Url::parse(url_str) {
        let host = parsed.host_str().unwrap_or("");
        let is_yt = host == "youtube.com"
            || host == "www.youtube.com"
            || host == "m.youtube.com";
        let has_list = parsed
            .query_pairs()
            .any(|(key, _)| key == "list");
        is_yt && has_list
    } else {
        false
    }
}

fn extract_youtube_playlist(html: &str) -> Vec<LinkItem> {
    let mut links = Vec::new();
    let mut seen = HashSet::new();

    // YouTube embeds playlist data in a script tag as ytInitialData
    let re = Regex::new(r"var\s+ytInitialData\s*=\s*(\{.*?\});\s*</script>").unwrap();
    let json_str = if let Some(caps) = re.captures(html) {
        caps.get(1).map(|m| m.as_str().to_string())
    } else {
        // Alternate pattern: ytInitialData without var
        let re2 = Regex::new(r"ytInitialData\s*=\s*(\{.*?\});\s*</script>").unwrap();
        re2.captures(html).and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
    };

    if let Some(json_str) = json_str {
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&json_str) {
            // Navigate the nested JSON to find playlist video items
            if let Some(items) = find_playlist_items(&data) {
                for item in items {
                    if let (Some(title), Some(video_id)) = (
                        extract_video_title(item),
                        extract_video_id(item),
                    ) {
                        let video_url = format!("https://www.youtube.com/watch?v={}", video_id);
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
    // Path: contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content
    //   .sectionListRenderer.contents[0].itemSectionRenderer.contents[0]
    //   .playlistVideoListRenderer.contents
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

fn extract_webpage_links(html: &str, base_url: &str) -> Vec<LinkItem> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("a[href]").unwrap();
    let base = Url::parse(base_url).ok();
    let mut links = Vec::new();
    let mut seen = HashSet::new();

    for element in document.select(&selector) {
        let href = match element.value().attr("href") {
            Some(h) => h,
            None => continue,
        };

        // Resolve relative URLs
        let resolved = if let Some(ref base) = base {
            base.join(href).map(|u| u.to_string()).unwrap_or_default()
        } else {
            href.to_string()
        };

        // Skip empty, anchors-only, javascript:, mailto:, tel:
        if resolved.is_empty()
            || resolved.starts_with("javascript:")
            || resolved.starts_with("mailto:")
            || resolved.starts_with("tel:")
            || resolved.starts_with('#')
        {
            continue;
        }

        // Get the link text, fall back to the URL itself
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

#[tauri::command]
fn extract_links(url: String) -> Result<Vec<LinkItem>, String> {
    // Validate URL
    Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    // Fetch the page
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

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

    if is_youtube_playlist(&url) {
        let links = extract_youtube_playlist(&html);
        if links.is_empty() {
            // Fallback: if ytInitialData parsing failed, try as a regular webpage
            Ok(extract_webpage_links(&html, &url))
        } else {
            Ok(links)
        }
    } else {
        Ok(extract_webpage_links(&html, &url))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![extract_links])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
