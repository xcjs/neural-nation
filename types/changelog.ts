export interface ChangelogEntry {
  version: string;
  date: string;
  summary: string;
  changes: {
    added?: string[];
    changed?: string[];
    fixed?: string[];
  };
}
