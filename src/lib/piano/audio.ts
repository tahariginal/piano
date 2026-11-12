/**
 * PianoAudioEngine — a sample player on the Web Audio API.
 *
 * Graph: voice (buffer → lowpass → gain) → bus → dry ┐
 *                                            → reverb ┴→ limiter → master → analyser → out
 *
 * Notes are triggered straight from input handlers. Nothing here waits on
 * React or the render loop.
 */

import { nearestSample, SAMPLE_DIR, SAMPLE_NOTES, sampleFile } from "./samples";

export type EngineStatus =
  | { phase: "idle" }
  | { phase: "downloading"; done: number; total: number }
  | { phase: "decoding"; done: number; total: number }
  | { phase: "ready" }
  /** Ready, but the browser paused the context (tab switch on iOS, call). The next gesture resumes it. */
  | { phase: "suspended" }
  | { phase: "error"; message: string };

type Sample = { buffer: AudioBuffer; onset: number };
type Voice = { midi: number; src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; ended: boolean };

const FETCH_CONCURRENCY = 6;

/** First sample above the noise floor, so playback starts on the hammer, not on encoder padding. */
function findOnset(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, buffer.sampleRate * 0.5);
  for (let i = 0; i < limit; i++) {
    if (Math.abs(data[i]) > 0.003) return Math.max(0, i / buffer.sampleRate - 0.002);
  }
  return 0;
}

/** A soft room: stereo noise with an exponential tail, slightly darker as it decays. */
function makeImpulse(ctx: BaseAudioContext, seconds = 2.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.35 + 0.6 * t; // smoothing grows with time: high frequencies die first
      lp += ((Math.random() * 2 - 1) - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - t, 3.2);
    }
  }
  return ir;
}

export class PianoAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private wet: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuf: Float32Array<ArrayBuffer> | null = null;

  private raw = new Map<number, ArrayBuffer>();
  private samples = new Map<number, Sample>();
  private voices = new Map<number, Voice[]>();
  private down = new Set<number>();
  private pedalHeld = new Set<number>();
  private abort = new AbortController();
  private downloading: Promise<void> | null = null;
  private starting: Promise<void> | null = null;
  private disposed = false;

  private sustainOn = false;
  private volume = 0.8;
  private reverbOn = true;

  status: EngineStatus = { phase: "idle" };
  private listeners = new Set<(s: EngineStatus) => void>();

  onStatus(fn: (s: EngineStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private set(s: EngineStatus) {
    if (this.disposed) return;
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  get ready() {
    return this.status.phase === "ready" && this.ctx?.state === "running";
  }

  /** Current audio clock, for scheduling replays. */
  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  /** Fetch the recordings ahead of the first gesture. Safe to call more than once. */
  prefetch(): Promise<void> {
    if (this.downloading) return this.downloading;
    const todo = SAMPLE_NOTES.filter((m) => !this.raw.has(m) && !this.samples.has(m));
    let done = SAMPLE_NOTES.length - todo.length;
    const total = SAMPLE_NOTES.length;
    if (this.status.phase !== "decoding") this.set({ phase: "downloading", done, total });
    const queue = [...todo];
    const signal = this.abort.signal;
    // A dropped connection is retried twice; a missing file (4xx) or a cancel is not.
    const get = async (m: number): Promise<ArrayBuffer> => {
      for (let attempt = 0; ; attempt++) {
        let status = 0;
        try {
          const res = await fetch(`${SAMPLE_DIR}/${sampleFile(m)}`, { signal });
          status = res.status;
          if (!res.ok) throw new Error(`Sample ${sampleFile(m)} failed to load (HTTP ${res.status}).`);
          return await res.arrayBuffer();
        } catch (err) {
          if (signal.aborted || attempt >= 2 || (status >= 400 && status < 500)) throw err;
          await new Promise((r) => window.setTimeout(r, 400 * 3 ** attempt));
        }
      }
    };
    const worker = async () => {
      for (let m = queue.shift(); m !== undefined; m = queue.shift()) {
        this.raw.set(m, await get(m));
        done++;
        if (this.status.phase === "downloading") this.set({ phase: "downloading", done, total });
      }
    };
    this.downloading = Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker)).then(
      () => undefined,
      (err: unknown) => {
        this.downloading = null; // allow a retry
        this.fail(err);
        throw err;
      },
    );
    return this.downloading;
  }

  /**
   * Must be called from a user gesture (click, tap, key). Creates and resumes
   * the context synchronously inside the gesture, then finishes loading.
   */
  start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Audio engine disposed."));
    this.ensureContext();
    // resume() is called synchronously here so the gesture counts.
    const resumed = this.ctx!.state === "running" ? Promise.resolve() : this.ctx!.resume();
    if (this.status.phase === "ready" || this.status.phase === "suspended") return resumed;
    if (this.starting) return this.starting;
    // A touch press is not yet a gesture (the lift is), so this resume may be refused
    // or left pending; unlock() retries on the lift and the check below waits for it.
    resumed.catch(() => {});
    this.starting = (async () => {
      try {
        await this.prefetch();
        await this.decodeAll();
        await this.whenRunning(3000);
        if (this.ctx!.state !== "running") throw new Error("The browser kept audio suspended. Tap Enable sound again.");
        this.set({ phase: "ready" });
      } catch (err) {
        this.fail(err);
        throw err;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  /**
   * Call on every release gesture (pointerup, touchend, click). Browsers count a
   * touch or pen as a gesture only when it lifts, so audio started from a touch
   * press, or paused by the system, resumes here. Does nothing before start().
   */
  unlock() {
    const ctx = this.ctx;
    if (!ctx || this.disposed || ctx.state === "running" || ctx.state === "closed") return;
    ctx.resume().catch(() => {});
  }

  private whenRunning(ms: number) {
    const ctx = this.ctx!;
    if (ctx.state === "running") return Promise.resolve();
    return new Promise<void>((done) => {
      const finish = () => {
        window.clearTimeout(timer);
        ctx.removeEventListener("statechange", check);
        done();
      };
      const check = () => {
        if (ctx.state === "running") finish();
      };
      const timer = window.setTimeout(finish, ms);
      ctx.addEventListener("statechange", check);
    });
  }

  private fail(err: unknown) {
    if (this.disposed || (err instanceof DOMException && err.name === "AbortError")) return;
    const message = err instanceof Error ? err.message : "Audio failed to start.";
    this.set({ phase: "error", message: /fetch|network|load failed/i.test(message) ? "Network error while loading the piano samples." : message });
  }

  private ensureContext() {
    if (this.ctx) return;
    // iOS: play through the silent switch, like any instrument app.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = this.volume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const bus = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = this.reverbOn ? 0.16 : 0;

    bus.connect(limiter);
    bus.connect(reverb).connect(wet).connect(limiter);
    limiter.connect(master).connect(analyser).connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.bus = bus;
    this.wet = wet;
    this.analyser = analyser;
    this.levelBuf = new Float32Array(analyser.fftSize);
    ctx.onstatechange = () => {
      if (this.status.phase === "ready" && ctx.state !== "running") this.set({ phase: "suspended" });
      else if (this.status.phase === "suspended" && ctx.state === "running") this.set({ phase: "ready" });
    };
  }

  private async decodeAll() {
    const ctx = this.ctx!;
    const total = SAMPLE_NOTES.length;
    let done = this.samples.size;
    this.set({ phase: "decoding", done, total });
    for (const m of SAMPLE_NOTES) {
      if (this.samples.has(m)) continue;
      const bytes = this.raw.get(m);
      if (!bytes) throw new Error(`Sample ${sampleFile(m)} is missing.`);
      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(bytes);
      } catch {
        this.raw.delete(m); // refetch on retry
        this.downloading = null;
        throw new Error(`Sample ${sampleFile(m)} could not be decoded.`);
      }
      this.samples.set(m, { buffer, onset: findOnset(buffer) });
      this.raw.delete(m);
      this.set({ phase: "decoding", done: ++done, total });
    }
  }

  /** Strike a note. `at` is an audio-clock time for scheduled playback. */
  noteOn(midi: number, velocity = 0.8, at?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.bus || this.status.phase !== "ready") return;
    const pick = nearestSample(midi, [...this.samples.keys()]);
    if (!pick) return;
    const sample = this.samples.get(pick.sample)!;
    const t = Math.max(ctx.currentTime, at ?? 0);
    const v = Math.min(1, Math.max(0.05, velocity));

    // Re-striking a sounding string damps the old vibration quickly.
    for (const old of this.voices.get(midi) ?? []) this.release(old, t, 0.04);

    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.value = 2 ** (pick.shift / 12);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800 + v * v * 16000; // soft strikes sound darker
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18 + 0.5 * v ** 1.4, t);
    src.connect(filter).connect(gain).connect(this.bus);

    const voice: Voice = { midi, src, gain, filter, ended: false };
    src.onended = () => {
      voice.ended = true;
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
      const list = this.voices.get(midi);
      if (list) {
        const i = list.indexOf(voice);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) this.voices.delete(midi);
      }
    };
    src.start(t, sample.onset);
    this.voices.set(midi, [...(this.voices.get(midi) ?? []).filter((x) => !x.ended), voice]);
    this.down.add(midi);
    this.pedalHeld.delete(midi);
  }

  /** Lift a key. With the pedal down the note keeps ringing until the pedal lifts. */
  noteOff(midi: number, at?: number) {
    const ctx = this.ctx;
    this.down.delete(midi);
    if (!ctx) return;
    if (this.sustainOn) {
      this.pedalHeld.add(midi);
      return;
    }
    const t = Math.max(ctx.currentTime, at ?? 0);
    for (const v of this.voices.get(midi) ?? []) this.release(v, t);
  }

  private release(v: Voice, t: number, tau?: number) {
    if (v.ended) return;
    const p = v.gain.gain;
    // Low strings are heavier and take longer to damp: 180 ms time constant at C2, 60 ms from C5 up.
    const k = tau ?? 0.06 + 0.12 * Math.min(1, Math.max(0, (72 - v.midi) / 36));
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(0, t, k);
    try {
      v.src.stop(t + k * 8); // e^-8 ≈ −70 dB
    } catch {
      /* already stopped */
    }
  }

  setSustain(on: boolean, at?: number) {
    this.sustainOn = on;
    if (on || !this.ctx) return;
    const t = Math.max(this.ctx.currentTime, at ?? 0);
    for (const m of this.pedalHeld) if (!this.down.has(m)) for (const v of this.voices.get(m) ?? []) this.release(v, t);
    this.pedalHeld.clear();
  }

  get sustain() {
    return this.sustainOn;
  }

  /** 0–1, applied with a short ramp so moving the slider never clicks. */
  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.015);
  }

  setReverb(on: boolean) {
    this.reverbOn = on;
    if (this.ctx && this.wet) this.wet.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.05);
  }

  /** Output level in dBFS (RMS), for the readout. */
  level(): number {
    if (!this.analyser || !this.levelBuf) return -Infinity;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i] * this.levelBuf[i];
    const rms = Math.sqrt(sum / this.levelBuf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  /** Silence everything now: route changes, resets, lost focus. */
  allNotesOff() {
    this.down.clear();
    this.pedalHeld.clear();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const list of this.voices.values()) for (const v of list) this.release(v, t, 0.05);
  }

  dispose() {
    if (this.disposed) return;
    this.allNotesOff();
    this.disposed = true;
    this.abort.abort();
    this.listeners.clear();
    this.voices.clear();
    this.samples.clear();
    this.raw.clear();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }
}
