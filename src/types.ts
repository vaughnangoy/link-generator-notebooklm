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

export interface HistoryEntry {
  id: number;
  url: string;
  timestamp: number;
  children: HistoryChild[];
}
