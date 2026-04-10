interface UrlInputProps {
  onExtract: (url: string) => void;
  loading: boolean;
}

import { useState } from "react";

export default function UrlInput({ onExtract, loading }: UrlInputProps) {
  const [url, setUrl] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) {
      onExtract(trimmed);
    }
  }

  return (
    <form className="url-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a URL or YouTube playlist link…"
        disabled={loading}
      />
      <button type="submit" disabled={loading || !url.trim()}>
        {loading ? "Extracting…" : "Extract Links"}
      </button>
    </form>
  );
}
