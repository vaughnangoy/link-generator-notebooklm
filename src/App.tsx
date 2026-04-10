import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { LinkItem } from "./types";
import UrlInput from "./components/UrlInput";
import LinkList from "./components/LinkList";
import Preview from "./components/Preview";
import CopyButton from "./components/CopyButton";

function App() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract(url: string) {
    setLoading(true);
    setError(null);
    setLinks([]);
    setSelected(new Set());
    setPreviewIndex(null);

    try {
      const result = await invoke<LinkItem[]>("extract_links", { url });
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
      if (prev.size === links.length) {
        return new Set();
      }
      return new Set(links.map((_, i) => i));
    });
  }

  function handlePreview(index: number) {
    setPreviewIndex(index);
  }

  const selectedUrls = Array.from(selected)
    .sort((a, b) => a - b)
    .map((i) => links[i]?.url)
    .filter(Boolean);

  const previewLink = previewIndex !== null ? links[previewIndex] ?? null : null;

  return (
    <div className="app">
      <header className="top-bar">
        <UrlInput onExtract={handleExtract} loading={loading} />
        <CopyButton selectedUrls={selectedUrls} />
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="main-content">
        <aside className="sidebar">
          <LinkList
            links={links}
            selected={selected}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            onPreview={handlePreview}
            activePreview={previewIndex}
          />
        </aside>
        <section className="preview-panel">
          <Preview link={previewLink} />
        </section>
      </div>
    </div>
  );
}

export default App;
