import type { Division } from "@/lib/game/rules";

/** Shared by the browser and the server. Contains no server code. */

export type BackendKind = "preview-file" | "preview-memory" | "supabase";

export interface BackendInfo {
  kind: BackendKind;
  /** True for anything that is not a shared, persistent, global ranking. */
  isPreview: boolean;
  label: string;
}

export type LeaderboardPeriod = "daily" | "all-time";

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  feiMs: number;
  completed: number;
  maxLength: number;
  dateKey: string;
  isPlayer: boolean;
}

export interface LeaderboardSnapshot {
  backend: BackendInfo;
  period: LeaderboardPeriod;
  /** The daily challenge date, or null for all-time. */
  dateKey: string | null;
  division: Division;
  entries: LeaderboardEntry[];
  /** The requesting player's best row, included even when outside the top. */
  player: LeaderboardEntry | null;
  total: number;
}

export interface SubmitRequest {
  dateKey: string;
  division: Division;
  playerId: string;
  displayName: string;
  /** The answers entered, in order. The score is never sent; the server computes it. */
  answers: string[][];
}

export type SubmitResponse =
  | { status: "accepted"; entry: LeaderboardEntry; backend: BackendInfo }
  | { status: "duplicate"; entry: LeaderboardEntry | null; backend: BackendInfo }
  | { status: "rejected"; reason: string };

export const LEADERBOARD_PAGE_SIZE = 25;
