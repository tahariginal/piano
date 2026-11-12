/**
 * Timelines — what the player plays. Recordings, melody demos and lesson demos
 * all become the same list of timed events. Times are seconds from the start.
 */

import type { Melody } from "./lessons";

export type TimedEvent =
  | { t: number; type: "on"; midi: number; velocity: number; octave: number }
  | { t: number; type: "off"; midi: number }
  | { t: number; type: "pedal"; on: boolean };

export type Recording = { events: TimedEvent[]; duration: number; notes: number };

const DEMO_VELOCITY = 0.72;

/** Melody → events at its tempo. Notes are slightly detached so repeats re-strike clearly. */
export function melodyTimeline(m: Melody, octave = 4): TimedEvent[] {
  const spb = 60 / m.bpm;
  const out: TimedEvent[] = [];
  let t = 0;
  for (const n of m.notes) {
    out.push({ t, type: "on", midi: n.midi, velocity: DEMO_VELOCITY, octave });
    out.push({ t: t + n.beats * spb * 0.88, type: "off", midi: n.midi });
    t += n.beats * spb;
  }
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
