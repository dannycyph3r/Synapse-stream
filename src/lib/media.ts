"use client";

/**
 * Speech and sound. Both are optional channels: every function is a safe
 * no-op where the browser lacks support, and nothing here is required to
 * play in the visual division.
 */

export function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

export function cancelSpeech(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/**
 * Speak a token name. The rate rises as presentation time falls, so a word
 * finishes inside its window at the spoken division's 1 s floor.
 */
export function speak(text: string, windowMs = 1500): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-CA";
  u.rate = Math.min(1.6, Math.max(1, 1300 / windowMs));
  synth.speak(u);
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  ctx ??= new window.AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Cue = "token" | "correct" | "end";

const CUES: Record<Cue, { freq: number; at: number; dur: number }[]> = {
  // One quiet, identical tick per token: a rhythm cue that carries no answer.
  token: [{ freq: 520, at: 0, dur: 0.05 }],
  correct: [
    { freq: 660, at: 0, dur: 0.09 },
    { freq: 880, at: 0.09, dur: 0.12 },
  ],
  end: [{ freq: 330, at: 0, dur: 0.22 }],
};

export function playCue(cue: Cue): void {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  for (const note of CUES[cue]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.exponentialRampToValueAtTime(0.06, now + note.at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.02);
  }
}
