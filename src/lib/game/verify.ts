/**
 * Replays a run from its answers alone.
 *
 * The leaderboard never accepts a score from the client. A submission carries
 * only the answers the player entered; the server rebuilds every challenge
 * from the public seed and the difficulty schedule, checks each answer with
 * the same comparison the game uses, and computes the FEI itself. The client
 * also uses this to recover a daily run that was interrupted by a reload.
 */
import { buildChallenge, type RunConfig } from "./engine";
import { challengeContributionMs } from "./scoring";
import { sequencesMatch } from "./sequence";
import { isTokenId, type TokenId } from "./tokens";

/** Far beyond any plausible run, and a hard ceiling on replay work. */
export const MAX_REPLAY_CHALLENGES = 250;

export type ReplayResult =
  | {
      valid: true;
      completed: number;
      feiMs: number;
      maxLength: number;
      /** True when the last answer was wrong (the run ended on a mismatch). */
      endedOnMismatch: boolean;
    }
  | { valid: false; reason: string };

export function replayRun(config: RunConfig, answers: readonly (readonly unknown[])[]): ReplayResult {
  if (answers.length > MAX_REPLAY_CHALLENGES) return { valid: false, reason: "too many challenges" };

  let completed = 0;
  let feiMs = 0;
  let maxLength = 0;

  for (let i = 0; i < answers.length; i++) {
    const raw = answers[i]!;
    const challenge = buildChallenge(config, i);
    if (raw.length !== challenge.length) {
      return { valid: false, reason: `answer ${i + 1} has the wrong length` };
    }
    if (!raw.every(isTokenId)) return { valid: false, reason: `answer ${i + 1} has an unknown token` };
    const answer = raw as readonly TokenId[];

    if (sequencesMatch(challenge.sequence, answer)) {
      completed += 1;
      feiMs += challengeContributionMs(challenge.length, challenge.durationMs);
      maxLength = Math.max(maxLength, challenge.length);
      continue;
    }
    // A run ends on its first mismatch; nothing may follow it.
    if (i !== answers.length - 1) {
      return { valid: false, reason: "answers continue after a mismatch" };
    }
    return { valid: true, completed, feiMs, maxLength, endedOnMismatch: true };
  }

  return { valid: true, completed, feiMs, maxLength, endedOnMismatch: false };
}
