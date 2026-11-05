export interface Profile { username: string; displayName?: string }
export interface ImportDraft {
  account: string | null;
  followers: Profile[] | null;
  following: Profile[] | null;
  warnings: string[];
  source: 'official-json' | 'official-txt' | 'elo-json';
  capturedAt?: number;
  inputFingerprint?: string;
  completionBlocked?: boolean;
}
export interface Snapshot {
  id: string;
  account: string;
  capturedAt: number;
  importedAt: number;
  source: ImportDraft['source'] | 'browser';
  complete: boolean;
  followers: Profile[];
  following: Profile[];
  fingerprint: string;
  followingCollection?: { complete: boolean; expected: number | null };
}
export interface ChangeSet {
  snapshotId: string;
  previousId: string;
  detectedAt: number;
  followersGained: string[];
  followersLost: string[];
  followingAdded: string[];
  followingRemoved: string[];
}
export interface ActionRecord {
  id: string;
  account: string;
  target: string;
  at: number;
  status: 'attempting' | 'verified' | 'uncertain' | 'blocked' | 'cancelled';
  message: string;
}
export interface AccountData {
  account: string;
  snapshots: Snapshot[];
  protected: string[];
  actions: ActionRecord[];
  changes: ChangeSet[];
}
