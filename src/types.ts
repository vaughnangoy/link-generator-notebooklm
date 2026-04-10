export interface LinkItem {
  title: string;
  url: string;
  link_type: "webpage" | "youtube";
}

export interface HistoryChild {
  id: number;
  title: string;
  url: string;
  link_type: string;
}

export interface HistorySnapshot {
  id: number;
  timestamp: number;
  children: HistoryChild[];
}

export interface HistoryGroup {
  url: string;
  snapshots: HistorySnapshot[];
}
