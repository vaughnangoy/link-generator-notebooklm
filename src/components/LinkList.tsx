import { LinkItem } from "../types";

interface LinkListProps {
  links: LinkItem[];
  selected: Set<number>;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  onPreview: (index: number) => void;
  activePreview: number | null;
  validating?: boolean;
  checkedUrls?: Map<string, boolean>;
}

export default function LinkList({
  links,
  selected,
  onToggle,
  onToggleAll,
  onPreview,
  activePreview,
  validating = false,
  checkedUrls,
}: LinkListProps) {
  if (links.length === 0) {
    return (
      <div className="link-list-empty">
        <p>No links yet. Paste a URL above and click Extract.</p>
      </div>
    );
  }

  const allSelected = links.length > 0 && selected.size === links.length;

  return (
    <div className="link-list">
      <div className="link-list-header">
        <label className="select-all">
          <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
          Select all
        </label>
        <span>
          {selected.size} of {links.length} selected
        </span>
      </div>
      <ul>
        {links.map((link, i) => {
          const isChecked = checkedUrls?.has(link.url);
          const isSkeleton = validating && !isChecked;

          return (
            <li
              key={link.url}
              className={`${activePreview === i ? "active" : ""} ${isSkeleton ? "skeleton-row" : ""}`}
            >
              {isSkeleton ? (
                <div className="skeleton-placeholder">
                  <div className="skeleton-checkbox" />
                  <div className="skeleton-text" />
                </div>
              ) : (
                <>
                  <label className="link-checkbox">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => onToggle(i)}
                    />
                  </label>
                  <button
                    className="link-title"
                    onClick={() => onPreview(i)}
                    title={link.url}
                  >
                    <span className="link-type-badge">
                      {link.link_type === "youtube" ? "▶" : "🔗"}
                    </span>
                    {link.title}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
