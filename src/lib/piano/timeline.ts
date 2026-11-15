/**
 * Timelines — what the player plays. Recordings, melody demos and lesson demos
 * all become the same list of timed events. Times are seconds from the start.
 */

import { melodyPitches, type Melody } from "./lessons";
import { octaveOf } from "./notes";

export type TimedEvent =
  | { t: number; type: "on"; midi: number; velocity: number; octave: number }
  | { t: number; type: "off"; midi: number }
  | { t: number; type: "pedal"; on: boolean };

export type Recording = { events: TimedEvent[]; duration: number; notes: number };

const DEMO_VELOCITY = 0.72;

/** Melody → events at its tempo. Notes are slightly detached so repeats re-strike clearly. */
export function melodyTiming(m: Melody, bpm = m.bpm) {
  let beat = 0;
  return m.notes.map((n) => {
    const start = n.at ?? beat;
    beat = start + n.beats;
    return { start: start * 60 / bpm, end: beat * 60 / bpm, release: (start + (n.duration ?? n.beats * 0.88)) * 60 / bpm };
  });
}

export function melodyTimeline(m: Melody, octave?: number): TimedEvent[] {
  const out: TimedEvent[] = [];
  const timing = melodyTiming(m);
  m.notes.forEach((n, i) => {
    for (const midi of melodyPitches(n)) {
      out.push({ t: timing[i].start, type: "on", midi, velocity: DEMO_VELOCITY, octave: octave ?? octaveOf(midi) });
      out.push({ t: timing[i].release, type: "off", midi });
    }
  });
  return sortEvents(out);
}

/** Lesson demo: a sequence one note per beat, or a chord held together. */
export function stepTimeline(notes: number[], chord: boolean, bpm = 100, octave = 4): TimedEvent[] {
  const spb = 60 / bpm;
  if (chord) {
    return sortEvents([
      ...notes.map((midi): TimedEvent => ({ t: 0, type: "on", midi, velocity: DEMO_VELOCITY, octave })),
      ...notes.map((midi): TimedEvent => ({ t: spb * 2.5, type: "off", midi })),
    ]);
  }
  return sortEvents(
    notes.flatMap((midi, i): TimedEvent[] => [
      { t: i * spb, type: "on", midi, velocity: DEMO_VELOCITY, octave },
      { t: i * spb + spb * 0.85, type: "off", midi },
    ]),
  );
}

/** Stable sort by time; at equal times offs come before ons so a repeated note re-strikes. */
export function sortEvents(events: TimedEvent[]): TimedEvent[] {
  const rank = (e: TimedEvent) => (e.type === "off" ? 0 : e.type === "pedal" ? 1 : 2);
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || rank(a.e) - rank(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

export const timelineEnd = (events: readonly TimedEvent[]) => events.reduce((m, e) => Math.max(m, e.t), 0);

/**
 * RecordingEngine — captures live note-ons/offs and sustain changes with
 * timestamps (milliseconds from performance.now()). Chords are just several
 * note-ons at nearly the same time, so they replay as chords.
 */
export class Recorder {
  private t0 = 0;
  private events: TimedEvent[] = [];
  private open = new Set<number>();
  private pedal = false;
  recording = false;

  /** Notes already down when recording starts are not part of the take (their off is ignored). */
  begin(nowMs: number, sustainOn: boolean) {
    this.t0 = nowMs;
    this.events = [];
    this.open.clear();
    this.recording = true;
    this.pedal = sustainOn;
    if (sustainOn) this.events.push({ t: 0, type: "pedal", on: true });
  }

  note(type: "on" | "off", midi: number, velocity: number, octave: number, nowMs: number) {
    if (!this.recording) return;
    const t = Math.max(0, (nowMs - this.t0) / 1000);
    if (type === "on") {
      this.open.add(midi);
      this.events.push({ t, type: "on", midi, velocity, octave });
    } else if (this.open.has(midi)) {
      this.open.delete(midi);
      this.events.push({ t, type: "off", midi });
    }
  }

  sustain(on: boolean, nowMs: number) {
    if (!this.recording || on === this.pedal) return;
    this.pedal = on;
    this.events.push({ t: Math.max(0, (nowMs - this.t0) / 1000), type: "pedal", on });
  }

  /** Close anything still held so a replay can never leave a note stuck. */
  end(nowMs: number): Recording {
    const t = Math.max(0, (nowMs - this.t0) / 1000);
    for (const midi of this.open) this.events.push({ t, type: "off", midi });
    this.open.clear();
    if (this.pedal) this.events.push({ t, type: "pedal", on: false });
    this.recording = false;
    const events = sortEvents(this.events);
    return { events, duration: timelineEnd(events), notes: events.filter((e) => e.type === "on").length };
  }
}
