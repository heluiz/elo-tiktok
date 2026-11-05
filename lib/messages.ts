import type { Profile } from './types';

export type ListKind = 'followers' | 'following';
export interface TikTokStatus {
  tabId?: number;
  account: string | null;
  blocked: string | null;
  profile: string | null;
  canUnfollow: boolean;
  renderedProfile?: boolean;
  profileProblem?: string;
}
export interface Review {
  token: string;
  account: string;
  targets: string[];
  expiresAt: number;
  tabId: number;
  snapshotId: string;
}
export interface ActionJob {
  id: string;
  account: string;
  tabId: number;
  total: number;
  completed: number;
  state: 'running' | 'completed' | 'stopped' | 'cancelled';
  current?: string;
  message: string;
}
export interface CollectionResult {
  account: string;
  profiles: Profile[];
  complete: boolean;
  expected: number | null;
  notice: string;
  capturedAt: number;
}
export interface CollectionJob {
  id: string;
  account: string;
  tabId: number;
  state: 'running' | 'completed' | 'stopped' | 'cancelled';
  collected: number;
  expected: number | null;
  complete: boolean;
  message: string;
  result?: CollectionResult;
}
export type ManagerMessage =
  | { type: 'status'; tabId?: number }
  | { type: 'capture'; tabId: number; kind: ListKind }
  | { type: 'collect-following'; tabId?: number; account?: string }
  | { type: 'status-collection' }
  | { type: 'review'; tabId: number; account: string; targets: string[] }
  | { type: 'execute'; token: string; confirmedAccount: string }
  | { type: 'status-job' }
  | { type: 'cancel' };
export type ContentMessage =
  | { type: 'tt-status' }
  | { type: 'tt-capture'; kind: ListKind }
  | { type: 'tt-review'; account: string; targets: string[] }
  | { type: 'tt-unfollow'; account: string; target: string; operationId: string }
  | { type: 'tt-collect-following'; account: string; operationId: string }
  | { type: 'tt-cancel' };
export type CaptureResult = {
  account: string;
  profiles: Profile[];
  complete: false;
  notice: string;
};
export type UnfollowResult = {
  status: 'verified' | 'uncertain' | 'blocked' | 'cancelled';
  message: string;
};
export type Reply<T extends object> = ({ ok: true } & T) | { ok: false; error: string };

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'A operação não pôde ser concluída.';
}
