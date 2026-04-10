import { useState } from "react";

interface CopyButtonProps {
  selectedUrls: string[];
}

export default function CopyButton({ selectedUrls }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (selectedUrls.length === 0) return;
    const text = selectedUrls.join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      className="copy-button"
      onClick={handleCopy}
      disabled={selectedUrls.length === 0}
      title={`Copy ${selectedUrls.length} selected link${selectedUrls.length !== 1 ? "s" : ""}`}
    >
      {copied
        ? "✓ Copied!"
        : `Copy ${selectedUrls.length} link${selectedUrls.length !== 1 ? "s" : ""}`}
    </button>
  );
}
