import { useState } from "react";
import { HistoryEntry } from "../types";

interface HistoryListProps {
  entries: HistoryEntry[];
  selectedMasters: Set<number>;
  selectedChildren: Map<number, Set<number>>;
  onToggleMaster: (masterId: number) => void;
  onToggleChild: (masterId: number, childIndex: number) => void;
  onToggleAll: () => void;
  onDelete: () => void;
  onClickMaster: (entry: HistoryEntry) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: days > 365 ? "numeric" : undefined,
  });
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export default function HistoryList({
  entries,
  selectedMasters,
  selectedChildren,
  onToggleMaster,
  onToggleChild,
  onToggleAll,
  onDelete,
  onClickMaster,
}: HistoryListProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  if (entries.length === 0) {
    return (
      <div className="history-empty">
        <p>No history yet. Extract links from a URL to build your history.</p>
      </div>
    );
  }

  const allMasterIds = entries.map((e) => e.id);
  const allSelected = allMasterIds.every((id) => selectedMasters.has(id));

  const totalSelectedUrls = (() => {
    let count = 0;
    for (const entry of entries) {
      if (selectedMasters.has(entry.id)) {
        count += entry.children.length;
      } else {
        const childSet = selectedChildren.get(entry.id);
        if (childSet) count += childSet.size;
      }
    }
    return count;
  })();

  function toggleCollapse(masterId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(masterId)) {
        next.delete(masterId);
      } else {
        next.add(masterId);
      }
      return next;
    });
  }

  function isMasterChecked(entry: HistoryEntry): boolean {
    return selectedMasters.has(entry.id);
  }

  function isChildChecked(masterId: number, childIndex: number): boolean {
    if (selectedMasters.has(masterId)) return true;
    return selectedChildren.get(masterId)?.has(childIndex) ?? false;
  }

  return (
    <div className="history-list">
      <div className="history-list-header">
        <label className="select-all">
          <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
          Select all
        </label>
        <div className="history-header-right">
          {totalSelectedUrls > 0 && (
            <span>
              {totalSelectedUrls} URL{totalSelectedUrls !== 1 ? "s" : ""}{" "}
              selected
            </span>
          )}
          {selectedMasters.size > 0 && (
            <button className="history-delete-btn" onClick={onDelete}>
              Delete {selectedMasters.size} entr
              {selectedMasters.size !== 1 ? "ies" : "y"}
            </button>
          )}
        </div>
      </div>
      <ul className="history-tree">
        {entries.map((entry) => {
          const isCollapsed = collapsed.has(entry.id);
          const masterChecked = isMasterChecked(entry);
          return (
            <li key={entry.id} className="history-master">
              <div className="history-master-row">
                <button
                  className="history-collapse-btn"
                  onClick={() => toggleCollapse(entry.id)}
                  title={isCollapsed ? "Expand" : "Collapse"}
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>
                <label className="history-checkbox">
                  <input
                    type="checkbox"
                    checked={masterChecked}
                    onChange={() => onToggleMaster(entry.id)}
                  />
                </label>
                <button
                  className="history-master-title"
                  onClick={() => onClickMaster(entry)}
                  title={entry.url}
                >
                  <span className="history-item-url">{entry.url}</span>
                  <span className="history-item-meta">
                    <span className="history-item-count">
                      {entry.children.length} link
                      {entry.children.length !== 1 ? "s" : ""}
                    </span>
                    <span
                      className="history-item-date"
                      title={formatFullDate(entry.timestamp)}
                    >
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </span>
                </button>
              </div>
              {!isCollapsed && entry.children.length > 0 && (
                <ul className="history-children">
                  {entry.children.map((child, ci) => (
                    <li key={child.id} className="history-child-row">
                      <label className="history-checkbox">
                        <input
                          type="checkbox"
                          checked={isChildChecked(entry.id, ci)}
                          onChange={() => onToggleChild(entry.id, ci)}
                        />
                      </label>
                      <span className="history-child-title" title={child.url}>
                        <span className="link-type-badge">
                          {child.link_type === "youtube" ? "▶" : "🔗"}
                        </span>
                        {child.title}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
