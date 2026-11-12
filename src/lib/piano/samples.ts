/**
 * Salamander Grand Piano V3 — Alexander Holm, Yamaha C5, CC BY 3.0.
 * https://sfzinstruments.github.io/pianos/salamander/
 *
 * The library is sampled every minor third. We ship one velocity layer of the
 * notes that cover C2–C7, so any key is at most one semitone from a recording.
 * Files are self-hosted under /public/audio/salamander (see LICENSE.txt there).
 */

import { noteName } from "./notes";

export const SAMPLE_DIR = "/audio/salamander";

/** MIDI numbers of the shipped recordings: C, D#, F#, A from C2 up to C7. */
export const SAMPLE_NOTES: readonly number[] = (() => {
  const out: number[] = [];
  for (let m = 36; m <= 96; m += 3) out.push(m);
  return out;
})();

/** "D#4" → "Ds4.mp3" — no "#" in URLs. */
export const sampleFile = (midi: number) => `${noteName(midi).replace("#", "s")}.mp3`;

/** The recording a note is played from, and the semitone shift that makes it that note. */
export function nearestSample(midi: number, available: readonly number[] = SAMPLE_NOTES): { sample: number; shift: number } | null {
  let best: number | null = null;
  for (const s of available) {
    if (best === null || Math.abs(s - midi) < Math.abs(best - midi) || (Math.abs(s - midi) === Math.abs(best - midi) && s > best)) best = s;
  }
  return best === null ? null : { sample: best, shift: midi - best };
}

export const ATTRIBUTION = {
  title: "Salamander Grand Piano V3",
  author: "Alexander Holm",
  instrument: "Yamaha C5 grand piano",
  license: "CC BY 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
  source: "https://sfzinstruments.github.io/pianos/salamander/",
} as const;
