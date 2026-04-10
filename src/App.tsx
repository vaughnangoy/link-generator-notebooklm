import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "./App.css";
import { LinkItem, HistoryGroup, HistorySnapshot } from "./types";
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
  const [history, setHistory] = useState<HistoryGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedSnapshots, setSelectedSnapshots] = useState<Set<number>>(
    new Set(),
  );
  const [selectedChildren, setSelectedChildren] = useState<
    Map<number, Set<number>>
  >(new Map());

  const refreshHistory = useCallback(async () => {
    try {
      const groups = await invoke<HistoryGroup[]>("get_history");
      setHistory(groups);
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

  async function handleSnapshotClick(snapshot: HistorySnapshot, url: string) {
    // Clean up any in-progress validation listeners
    for (const unlisten of unlistenRefs.current) unlisten();
    unlistenRefs.current = [];

    setUrlInput(url);
    setLoading(true);
    setError(null);
    setActiveTab("links");
    setSelected(new Set());
    setPreviewIndex(null);
    setValidating(false);
    setCheckedUrls(new Map());
    setStatus(null);

    try {
      // Load from DB — bypass content validation
      const result = await invoke<LinkItem[]>("load_history_links", {
        masterId: snapshot.id,
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

  function handleToggleGroup(url: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
        // Also clear snapshot/child selections for this group's snapshots
        const group = history.find((g) => g.url === url);
        if (group) {
          setSelectedSnapshots((ps) => {
            const ns = new Set(ps);
            for (const snap of group.snapshots) ns.delete(snap.id);
            return ns;
          });
          setSelectedChildren((pc) => {
            const nc = new Map(pc);
            for (const snap of group.snapshots) nc.delete(snap.id);
            return nc;
          });
        }
      } else {
        next.add(url);
      }
      return next;
    });
  }

  function handleToggleSnapshot(snapshotId: number) {
    setSelectedSnapshots((prev) => {
      const next = new Set(prev);
      if (next.has(snapshotId)) {
        next.delete(snapshotId);
        setSelectedChildren((pc) => {
          const nc = new Map(pc);
          nc.delete(snapshotId);
          return nc;
        });
      } else {
        next.add(snapshotId);
      }
      return next;
    });
  }

  function handleToggleChild(snapshotId: number, childIndex: number) {
    setSelectedChildren((prev) => {
      const next = new Map(prev);
      const childSet = new Set(next.get(snapshotId) ?? []);
      if (childSet.has(childIndex)) {
        childSet.delete(childIndex);
      } else {
        childSet.add(childIndex);
      }
      if (childSet.size === 0) {
        next.delete(snapshotId);
      } else {
        next.set(snapshotId, childSet);
      }
      return next;
    });
  }

  function handleHistoryToggleAll() {
    const allUrls = history.map((g) => g.url);
    const allSelected = allUrls.every((url) => selectedGroups.has(url));
    if (allSelected) {
      setSelectedGroups(new Set());
      setSelectedSnapshots(new Set());
      setSelectedChildren(new Map());
    } else {
      setSelectedGroups(new Set(allUrls));
      setSelectedSnapshots(new Set());
      setSelectedChildren(new Map());
    }
  }

  async function handleHistoryDelete() {
    // Collect all snapshot IDs from selected groups + individually selected snapshots
    const idsToDelete: number[] = [];
    for (const group of history) {
      if (selectedGroups.has(group.url)) {
        for (const snap of group.snapshots) idsToDelete.push(snap.id);
      } else {
        for (const snap of group.snapshots) {
          if (selectedSnapshots.has(snap.id)) idsToDelete.push(snap.id);
        }
      }
    }
    if (idsToDelete.length === 0) return;

    try {
      await invoke("delete_history_entries", { masterIds: idsToDelete });
      setSelectedGroups(new Set());
      setSelectedSnapshots(new Set());
      setSelectedChildren(new Map());
      await refreshHistory();
    } catch (e) {
      setError(String(e));
    }
  }

  // During validation: show all candidates (skeleton for unchecked, real for valid, hidden for invalid)
  // After validation: show final links
  const displayLinks = validating
    ? links.filter((l) => {
        const result = checkedUrls.get(l.url);
        return result === undefined || result === true; // unchecked or valid
      })
    : links;

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
    for (const group of history) {
      if (selectedGroups.has(group.url)) {
        for (const snap of group.snapshots)
          for (const child of snap.children) urls.push(child.url);
      } else {
        for (const snap of group.snapshots) {
          if (selectedSnapshots.has(snap.id)) {
            for (const child of snap.children) urls.push(child.url);
          } else {
            const childSet = selectedChildren.get(snap.id);
            if (childSet) {
              for (const ci of childSet) {
                if (snap.children[ci]) urls.push(snap.children[ci].url);
              }
            }
          }
        }
      }
    }
    return urls;
  }

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
              groups={history}
              selectedGroups={selectedGroups}
              selectedSnapshots={selectedSnapshots}
              selectedChildren={selectedChildren}
              onToggleGroup={handleToggleGroup}
              onToggleSnapshot={handleToggleSnapshot}
              onToggleChild={handleToggleChild}
              onToggleAll={handleHistoryToggleAll}
              onDelete={handleHistoryDelete}
              onClickSnapshot={handleSnapshotClick}
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
                : `${history.length} URL${history.length !== 1 ? "s" : ""} in history`}
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
