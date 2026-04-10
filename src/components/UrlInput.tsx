interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onExtract: (url: string) => void;
  loading: boolean;
}

export default function UrlInput({
  value,
  onChange,
  onExtract,
  loading,
}: UrlInputProps) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onExtract(trimmed);
    }
  }

  return (
    <form className="url-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste a URL or YouTube playlist link…"
        disabled={loading}
      />
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? "Extracting…" : "Extract Links"}
      </button>
    </form>
  );
}
