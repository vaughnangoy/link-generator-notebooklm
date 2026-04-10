import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "./App.css";
import { LinkItem, HistoryEntry } from "./types";
import UrlInput from "./components/UrlInput";
import LinkList from "./components/LinkList";
import Preview from "./components/Preview";
import CopyButton from "./components/CopyButton";
import HistoryList from "./components/HistoryList";

type Tab = "links" | "history";

interface ProgressStatus {
  stage: string;
  checked: number;
  total: number;
  found: number;
}

function App() {
  const [urlInput, setUrlInput] = useState("");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [checkedUrls, setCheckedUrls] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("links");
  const [status, setStatus] = useState<ProgressStatus | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedMasters, setSelectedMasters] = useState<Set<number>>(
    new Set(),
  );
  const [selectedChildren, setSelectedChildren] = useState<
    Map<number, Set<number>>
  >(new Map());

  const refreshHistory = useCallback(async () => {
    try {
      const entries = await invoke<HistoryEntry[]>("get_history");
      setHistory(entries);
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  async function handleExtract(url: string) {
    setLoading(true);
    setError(null);
    setLinks([]);
    setSelected(new Set());
    setPreviewIndex(null);
    setActiveTab("links");
    setCheckedUrls(new Map());
    setValidating(false);
    setStatus({ stage: "Fetching page…", checked: 0, total: 0, found: 0 });

    // Clean up any previous listeners
    for (const unlisten of unlistenRefs.current) unlisten();
    unlistenRefs.current = [];

    // Listen for progress events
    const unlistenProgress = await listen<ProgressStatus>(
      "extract-progress",
      (event) => {
        setStatus(event.payload);
      },
    );
    unlistenRefs.current.push(unlistenProgress);

    // Listen for per-link validation results
    const unlistenValidated = await listen<{ url: string; valid: boolean }>(
      "link-validated",
      (event) => {
        setCheckedUrls((prev) =>
          new Map(prev).set(event.payload.url, event.payload.valid),
        );
      },
    );
    unlistenRefs.current.push(unlistenValidated);

    // Listen for validation-done: finalize and save to history
    const unlistenDone = await listen<{ valid_links: LinkItem[] }>(
      "validation-done",
      (event) => {
        setLinks(event.payload.valid_links);
        setCheckedUrls(new Map());
        setValidating(false);
        setSelected(new Set());
        refreshHistory();
        // Clean up listeners
        for (const unlisten of unlistenRefs.current) unlisten();
        unlistenRefs.current = [];
        // Clear active status so idle info shows
        setStatus(null);
      },
    );
    unlistenRefs.current.push(unlistenDone);

    try {
      // Step 1: Get candidates INSTANTLY (no validation)
      const candidates = await invoke<LinkItem[]>("extract_links", { url });
      setLinks(candidates);
      setLoading(false);
      setValidating(true);

      // Step 2: Kick off background validation
      invoke("validate_links", { url, candidates }).catch((e) => {
        setError(String(e));
        setValidating(false);
      });
    } catch (e) {
      setError(String(e));
      setLoading(false);
      for (const unlisten of unlistenRefs.current) unlisten();
      unlistenRefs.current = [];
    }
  }

  async function handleHistoryClick(entry: HistoryEntry) {
    setUrlInput(entry.url);
    setLoading(true);
    setError(null);
    setActiveTab("links");
    setSelected(new Set());
    setPreviewIndex(null);

    try {
      // Load from DB — bypass content validation
      const result = await invoke<LinkItem[]>("load_history_links", {
        masterId: entry.id,
      });
      setLinks(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleToggleAll() {
    setSelected((prev) => {
      if (prev.size === displayLinks.length) {
        return new Set();
      }
      return new Set(displayLinks.map((_, i) => i));
    });
  }

  function handlePreview(index: number) {
    setPreviewIndex(index);
  }

  // ── History selection ──

  function handleToggleMaster(masterId: number) {
    setSelectedMasters((prev) => {
      const next = new Set(prev);
      if (next.has(masterId)) {
        next.delete(masterId);
        // Also clear child selections for this master
        setSelectedChildren((pc) => {
          const nc = new Map(pc);
          nc.delete(masterId);
          return nc;
        });
      } else {
        next.add(masterId);
      }
      return next;
    });
  }

  function handleToggleChild(masterId: number, childIndex: number) {
    setSelectedChildren((prev) => {
      const next = new Map(prev);
      const childSet = new Set(next.get(masterId) ?? []);
      if (childSet.has(childIndex)) {
        childSet.delete(childIndex);
      } else {
        childSet.add(childIndex);
      }
      if (childSet.size === 0) {
        next.delete(masterId);
      } else {
        next.set(masterId, childSet);
      }
      return next;
    });
  }

  function handleHistoryToggleAll() {
    const allIds = history.map((e) => e.id);
    const allSelected = allIds.every((id) => selectedMasters.has(id));
    if (allSelected) {
      setSelectedMasters(new Set());
      setSelectedChildren(new Map());
    } else {
      setSelectedMasters(new Set(allIds));
      setSelectedChildren(new Map());
    }
  }

  async function handleHistoryDelete() {
    const idsToDelete = Array.from(selectedMasters);
    if (idsToDelete.length === 0) return;

    try {
      await invoke("delete_history_entries", { masterIds: idsToDelete });
      setSelectedMasters(new Set());
      setSelectedChildren(new Map());
      await refreshHistory();
    } catch (e) {
      setError(String(e));
    }
  }

  // Collect URLs based on active tab
  const selectedUrls =
    activeTab === "links"
      ? Array.from(selected)
          .sort((a, b) => a - b)
          .map((i) => displayLinks[i]?.url)
          .filter(Boolean)
      : getHistorySelectedUrls();

  function getHistorySelectedUrls(): string[] {
    const urls: string[] = [];
    for (const entry of history) {
      if (selectedMasters.has(entry.id)) {
        // Master selected → include all child URLs
        for (const child of entry.children) urls.push(child.url);
      } else {
        // Check individual child selections
        const childSet = selectedChildren.get(entry.id);
        if (childSet) {
          for (const ci of childSet) {
            if (entry.children[ci]) urls.push(entry.children[ci].url);
          }
        }
      }
    }
    return urls;
  }

  // During validation: show all candidates (skeleton for unchecked, real for valid, hidden for invalid)
  // After validation: show final links
  const displayLinks = validating
    ? links.filter((l) => {
        const result = checkedUrls.get(l.url);
        return result === undefined || result === true; // unchecked or valid
      })
    : links;

  const previewLink =
    previewIndex !== null ? (displayLinks[previewIndex] ?? null) : null;

  return (
    <div className="app">
      <header className="top-bar">
        <UrlInput
          value={urlInput}
          onChange={setUrlInput}
          onExtract={handleExtract}
          loading={loading || validating}
        />
        <CopyButton selectedUrls={selectedUrls} />
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="tab-bar">
        <button
          className={`tab ${activeTab === "links" ? "active" : ""}`}
          onClick={() => setActiveTab("links")}
        >
          Links {displayLinks.length > 0 && `(${displayLinks.length})`}
        </button>
        <button
          className={`tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History {history.length > 0 && `(${history.length})`}
        </button>
      </div>

      {activeTab === "links" && (
        <div className="main-content">
          <aside className="sidebar">
            <LinkList
              links={displayLinks}
              selected={selected}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
              onPreview={handlePreview}
              activePreview={previewIndex}
              validating={validating}
              checkedUrls={checkedUrls}
            />
          </aside>
          <section className="preview-panel">
            <Preview link={previewLink} />
          </section>
        </div>
      )}

      {activeTab === "history" && (
        <div className="main-content">
          <div className="history-panel">
            <HistoryList
              entries={history}
              selectedMasters={selectedMasters}
              selectedChildren={selectedChildren}
              onToggleMaster={handleToggleMaster}
              onToggleChild={handleToggleChild}
              onToggleAll={handleHistoryToggleAll}
              onDelete={handleHistoryDelete}
              onClickMaster={handleHistoryClick}
            />
          </div>
        </div>
      )}

      <footer className="status-bar">
        {status ? (
          <>
            <span className="status-stage">{status.stage}</span>
            {status.total > 0 && (
              <>
                <span className="status-progress">
                  {status.checked}/{status.total}
                </span>
                <span className="status-found">{status.found} found</span>
                <div className="status-bar-track">
                  <div
                    className="status-bar-fill"
                    style={{
                      width: `${Math.round((status.checked / status.total) * 100)}%`,
                    }}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <span className="status-stage">
              {activeTab === "links"
                ? displayLinks.length > 0
                  ? `${displayLinks.length} link${displayLinks.length !== 1 ? "s" : ""}`
                  : "Ready"
                : `${history.length} history entr${history.length !== 1 ? "ies" : "y"}`}
            </span>
            {activeTab === "links" && selected.size > 0 && (
              <span className="status-found">{selected.size} selected</span>
            )}
          </>
        )}
      </footer>
    </div>
  );
}

export default App;
