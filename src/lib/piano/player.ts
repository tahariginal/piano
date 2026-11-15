/**
 * Player — plays a timeline through the controller, so replays and demos use
 * the real audio engine and move the real keys.
 *
 * Note-ons are scheduled ahead on the audio clock (sample-accurate, immune to
 * a slow frame). Releases and pedal changes fire on timers at their time.
 */

import type { PianoController, Source } from "./controller";
import { timelineEnd, type TimedEvent } from "./timeline";

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead
const TICK = 25; // ms between scheduling passes
const LEAD_IN = 0.06; // first note starts this long after play()

let serial = 0;

export class Player {
  private ctrl: PianoController;
  private source: Source;
  private prefix: string;
  private interval = 0;
  private timers = new Set<number>();
  private usedPedal = false;
  private onEndFn: (() => void) | null = null;
  playing = false;
  private audio0 = 0;

  /** The same audio clock that schedules the samples also drives practice cues. */
  get elapsed() { return this.ctrl.engine.now - this.audio0; }

  constructor(ctrl: PianoController, source: "replay" | "demo") {
    this.ctrl = ctrl;
    this.source = source;
    this.prefix = `${source}:${++serial}:`;
  }

  play(events: readonly TimedEvent[], onEnd?: () => void, duration = timelineEnd(events)) {
    this.stop();
    if (!events.length || !this.ctrl.engine.ready) {
      onEnd?.();
      return;
    }
    this.playing = true;
    this.onEndFn = onEnd ?? null;
    const audio0 = this.ctrl.engine.now + LEAD_IN;
    this.audio0 = audio0;
    const perf0 = performance.now() + LEAD_IN * 1000;
    const holders = new Map<number, string[]>(); // midi → holders still down, oldest first
    const releasing = new Map<number, { holder: string; id: number; t: number }>(); // midi → release timed, not yet fired
    let next = 0;
    let n = 0;

    const at = (fn: () => void, t: number) => {
      const id = window.setTimeout(() => {
        this.timers.delete(id);
        fn();
      }, Math.max(0, perf0 + t * 1000 - performance.now()));
      this.timers.add(id);
      return id;
    };

    const pass = () => {
      const horizon = this.ctrl.engine.now + LOOKAHEAD - audio0;
      while (next < events.length && events[next].t <= horizon) {
        const e = events[next++];
        if (e.type === "on") {
          const holder = `${this.prefix}${n++}`;
          const { midi, velocity, t } = e;
          holders.set(midi, [...(holders.get(midi) ?? []), holder]);
          const strike = () => this.ctrl.press(holder, midi, velocity, this.source, audio0 + t);
          const prev = releasing.get(midi);
          if (prev) {
            // The same key again, scheduled before its last release has fired (the
            // lookahead is longer than the gap). Lift it at its time, then strike.
            releasing.delete(midi);
            window.clearTimeout(prev.id);
            this.timers.delete(prev.id);
            at(() => {
              this.ctrl.release(prev.holder);
              strike();
            }, prev.t);
          } else strike();
        } else if (e.type === "off") {
          const holder = holders.get(e.midi)?.shift();
          if (holder) {
            const { midi, t } = e;
            const id = at(() => {
              if (releasing.get(midi)?.holder === holder) releasing.delete(midi);
              this.ctrl.release(holder);
            }, t);
            releasing.set(midi, { holder, id, t });
          }
        } else {
          this.usedPedal = true;
          const on = e.on;
          at(() => this.ctrl.setPedal(on), e.t);
        }
      }
      if (next >= events.length) {
        window.clearInterval(this.interval);
        this.interval = 0;
        at(() => this.finish(), Math.max(duration, timelineEnd(events)) + 0.05);
      }
    };
    pass();
    if (this.playing && next < events.length) this.interval = window.setInterval(pass, TICK);
  }

  private finish() {
    const done = this.onEndFn;
    this.cleanup();
    done?.();
  }

  /** Stop now: cancel everything scheduled and lift every note this player holds. */
  stop() {
    if (!this.playing) return;
    this.cleanup();
  }

  private cleanup() {
    window.clearInterval(this.interval);
    this.interval = 0;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    this.ctrl.releaseAll(this.prefix);
    if (this.usedPedal) this.ctrl.setPedal(false);
    this.usedPedal = false;
    this.playing = false;
    this.onEndFn = null;
  }
}
