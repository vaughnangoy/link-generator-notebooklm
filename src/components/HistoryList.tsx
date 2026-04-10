import { useState } from "react";
import { HistoryGroup, HistorySnapshot } from "../types";

interface HistoryListProps {
  groups: HistoryGroup[];
  selectedGroups: Set<string>;
  selectedSnapshots: Set<number>;
  selectedChildren: Map<number, Set<number>>;
  onToggleGroup: (url: string) => void;
  onToggleSnapshot: (snapshotId: number) => void;
  onToggleChild: (snapshotId: number, childIndex: number) => void;
  onToggleAll: () => void;
  onDelete: () => void;
  onClickSnapshot: (snapshot: HistorySnapshot, url: string) => void;
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
  const d = new Date(timestamp);
  const now_date = new Date();
  const sameYear = d.getFullYear() === now_date.getFullYear();
  return (
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    }) +
    ", " +
    d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  );
}

function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export default function HistoryList({
  groups,
  selectedGroups,
  selectedSnapshots,
  selectedChildren,
  onToggleGroup,
  onToggleSnapshot,
  onToggleChild,
  onToggleAll,
  onDelete,
  onClickSnapshot,
}: HistoryListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedSnapshots, setCollapsedSnapshots] = useState<Set<number>>(
    new Set(),
  );

  if (groups.length === 0) {
    return (
      <div className="history-empty">
        <p>No history yet. Extract links from a URL to build your history.</p>
      </div>
    );
  }

  const allGroupUrls = groups.map((g) => g.url);
  const allSelected = allGroupUrls.every((url) => selectedGroups.has(url));

  // Count total selected URLs across all levels
  const totalSelectedUrls = (() => {
    let count = 0;
    for (const group of groups) {
      if (selectedGroups.has(group.url)) {
        for (const snap of group.snapshots) count += snap.children.length;
      } else {
        for (const snap of group.snapshots) {
          if (selectedSnapshots.has(snap.id)) {
            count += snap.children.length;
          } else {
            const childSet = selectedChildren.get(snap.id);
            if (childSet) count += childSet.size;
          }
        }
      }
    }
    return count;
  })();

  // Count deletable snapshot IDs (from selected groups + individually selected snapshots)
  const deletableSnapshotIds = (() => {
    const ids = new Set<number>();
    for (const group of groups) {
      if (selectedGroups.has(group.url)) {
        for (const snap of group.snapshots) ids.add(snap.id);
      } else {
        for (const snap of group.snapshots) {
          if (selectedSnapshots.has(snap.id)) ids.add(snap.id);
        }
      }
    }
    return ids;
  })();

  function toggleGroupCollapse(url: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleSnapshotCollapse(id: number) {
    setCollapsedSnapshots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isGroupChecked(url: string): boolean {
    return selectedGroups.has(url);
  }

  function isSnapshotChecked(
    group: HistoryGroup,
    snap: HistorySnapshot,
  ): boolean {
    if (selectedGroups.has(group.url)) return true;
    return selectedSnapshots.has(snap.id);
  }

  function isChildChecked(
    group: HistoryGroup,
    snap: HistorySnapshot,
    childIndex: number,
  ): boolean {
    if (selectedGroups.has(group.url)) return true;
    if (selectedSnapshots.has(snap.id)) return true;
    return selectedChildren.get(snap.id)?.has(childIndex) ?? false;
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
          {deletableSnapshotIds.size > 0 && (
            <button className="history-delete-btn" onClick={onDelete}>
              Delete {deletableSnapshotIds.size} snapshot
              {deletableSnapshotIds.size !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
      <ul className="history-tree">
        {groups.map((group) => {
          const isGroupCollapsed = collapsedGroups.has(group.url);
          const groupChecked = isGroupChecked(group.url);
          const totalLinks = group.snapshots.reduce(
            (s, sn) => s + sn.children.length,
            0,
          );
          return (
            <li key={group.url} className="history-master">
              <div className="history-master-row">
                <button
                  className="history-collapse-btn"
                  onClick={() => toggleGroupCollapse(group.url)}
                  title={isGroupCollapsed ? "Expand" : "Collapse"}
                >
                  {isGroupCollapsed ? "▶" : "▼"}
                </button>
                <label className="history-checkbox">
                  <input
                    type="checkbox"
                    checked={groupChecked}
                    onChange={() => onToggleGroup(group.url)}
                  />
                </label>
                <span className="history-master-title" title={group.url}>
                  <span className="history-item-url">{group.url}</span>
                  <span className="history-item-meta">
                    <span className="history-item-count">
                      {group.snapshots.length} run
                      {group.snapshots.length !== 1 ? "s" : ""} · {totalLinks}{" "}
                      link{totalLinks !== 1 ? "s" : ""}
                    </span>
                  </span>
                </span>
              </div>
              {!isGroupCollapsed && (
                <ul className="history-snapshots">
                  {group.snapshots.map((snap) => {
                    const isSnapCollapsed = collapsedSnapshots.has(snap.id);
                    const snapChecked = isSnapshotChecked(group, snap);
                    return (
                      <li key={snap.id} className="history-snapshot">
                        <div className="history-snapshot-row">
                          <button
                            className="history-collapse-btn"
                            onClick={() => toggleSnapshotCollapse(snap.id)}
                            title={isSnapCollapsed ? "Expand" : "Collapse"}
                          >
                            {isSnapCollapsed ? "▶" : "▼"}
                          </button>
                          <label className="history-checkbox">
                            <input
                              type="checkbox"
                              checked={snapChecked}
                              onChange={() => onToggleSnapshot(snap.id)}
                            />
                          </label>
                          <button
                            className="history-snapshot-title"
                            onClick={() => onClickSnapshot(snap, group.url)}
                            title={formatFullDate(snap.timestamp)}
                          >
                            <span className="history-snapshot-date">
                              {formatRelativeTime(snap.timestamp)}
                            </span>
                            <span className="history-item-count">
                              {snap.children.length} link
                              {snap.children.length !== 1 ? "s" : ""}
                            </span>
                          </button>
                        </div>
                        {!isSnapCollapsed && snap.children.length > 0 && (
                          <ul className="history-children">
                            {snap.children.map((child, ci) => (
                              <li key={child.id} className="history-child-row">
                                <label className="history-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={isChildChecked(group, snap, ci)}
                                    onChange={() => onToggleChild(snap.id, ci)}
                                  />
                                </label>
                                <span
                                  className="history-child-title"
                                  title={child.url}
                                >
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
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
