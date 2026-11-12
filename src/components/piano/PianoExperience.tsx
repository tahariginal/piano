"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PianoAudioEngine, type EngineStatus } from "@/lib/piano/audio";
import { PianoController, type ControlState } from "@/lib/piano/controller";
import { attachKeyboard } from "@/lib/piano/keyboard";
import { DEFAULT_OCTAVE } from "@/lib/piano/notes";
import type { PianoSceneHandle, PianoView } from "@/lib/piano/scene";
import { isLowPower, prefersReducedMotion } from "@/lib/device";
import { palette } from "@/lib/theme";
import { PianoContext, type LastNote, type PianoState } from "./context";
import Readouts from "./Readouts";
import RecorderStrip from "./RecorderStrip";
import SoundGate from "./SoundGate";
import TouchKeys from "./TouchKeys";
import TutorialPanel from "./TutorialPanel";

type GlState = "loading" | "ready" | "failed";

export default function PianoExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PianoSceneHandle | null>(null);
  const targetsRef = useRef<readonly number[]>([]);
  const coreRef = useRef<PianoController | null>(null);
  const [ctrl, setCtrl] = useState<PianoController | null>(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<EngineStatus>({ phase: "idle" });
  const [controls, setControls] = useState<ControlState>({ octave: DEFAULT_OCTAVE, sustain: false, pedal: false });
  const [active, setActive] = useState<readonly number[]>([]);
  const [last, setLast] = useState<LastNote>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gl, setGl] = useState<GlState>("loading");
  const [moved, setMoved] = useState(false);
  const [view, setView] = useState<PianoView>("piano");
  const [panelOpen, setPanelOpen] = useState(true);
  const [volume, setVolume] = useState(80);
  const [reverb, setReverb] = useState(true);
  const [targets, setTargetsState] = useState<readonly number[]>([]);

  /** Start or resume audio. Must run inside a user gesture. Stable, so handlers can hold it. */
  const enable = useCallback(() => {
    const c = coreRef.current;
    if (!c) return;
    setStarted(true);
    c.engine.start().catch(() => {
      /* the engine reports the error through its status */
    });
  }, []);

  const noticeTimer = useRef(0);
  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200);
  }, []);

  // Audio engine, controller and physical keyboard. Created on the client only.
  useEffect(() => {
    const engine = new PianoAudioEngine();
    const c = new PianoController(engine);
    const offStatus = engine.onStatus(setStatus);
    const offState = c.onState((s) => {
      setControls(s);
      sceneRef.current?.setSustain(s.sustain || s.pedal);
      sceneRef.current?.setOctave(s.octave);
    });
    const offNote = c.onNote((e) => {
      sceneRef.current?.setKey(e.midi, e.type === "on");
      setActive(c.active);
      if (e.type === "on") setLast({ midi: e.midi, source: e.source, at: e.time });
    });
    const detach = attachKeyboard(c, {
      onGesture: enable,
      onNoBlackKey: (d) => flash(`No black key after ${d === 8 ? "high Do" : d === 3 ? "Mi" : "Si"} (${d})`),
    });
    // Download the recordings now; decoding waits for the first gesture.
    engine.prefetch().catch(() => {});
    // Touch and pen become a gesture when they lift: let audio started on a press resume there.
    const unlock = () => engine.unlock();
    const lifts = ["pointerup", "touchend", "click"] as const;
    for (const t of lifts) document.addEventListener(t, unlock, { capture: true, passive: true });
    coreRef.current = c;
    setCtrl(c);
    return () => {
      for (const t of lifts) document.removeEventListener(t, unlock, { capture: true });
      detach();
      offNote();
      offState();
      offStatus();
      c.dispose();
      engine.dispose();
      coreRef.current = null;
      window.clearTimeout(noticeTimer.current);
    };
  }, [enable, flash]);

  // The 3D scene, loaded only on this route and only in the browser.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ctrl || !canvas) return;
    let handle: PianoSceneHandle | null = null;
    let cancelled = false;
    const holder = (id: number) => `pointer:${id}`;
    (async () => {
      try {
        const family = getComputedStyle(document.documentElement).getPropertyValue("--font-plex").trim() || "monospace";
        await Promise.race([document.fonts?.load(`500 64px ${family}`), new Promise((r) => setTimeout(r, 900))]).catch(() => {});
        const { createPianoScene } = await import("@/lib/piano/scene");
        if (cancelled) return;
        handle = createPianoScene({
          canvas,
          reducedMotion: prefersReducedMotion(),
          lowPower: isLowPower(),
          font: family,
          padding: () => {
            const wide = window.innerWidth >= 1024;
            return wide ? { top: 72, right: 32, bottom: 76, left: 32 } : { top: 16, right: 12, bottom: 16, left: 12 };
          },
          colors: { fg: palette.fg, accent: palette.accent, accentLight: palette.accentLight },
          onPress: (id, midi, v) => {
            enable();
            if (ctrl.engine.ready) ctrl.press(holder(id), midi, v, "pointer");
          },
          onGlide: (id, midi) => {
            if (midi === null) ctrl.release(holder(id));
            else if (ctrl.engine.ready) ctrl.press(holder(id), midi, 0.7, "pointer");
          },
          onLift: (id) => ctrl.release(holder(id)),
          onViewChange: setMoved,
          onContextLost: (lost) => setGl(lost ? "failed" : "ready"),
        });
        sceneRef.current = handle;
        handle.setOctave(ctrl.controls.octave);
        handle.setSustain(ctrl.controls.sustain || ctrl.controls.pedal);
        handle.setTargets(targetsRef.current);
        for (const m of ctrl.active) handle.setKey(m, true);
        setGl("ready");
      } catch (err) {
        console.warn("[piano] 3D view unavailable:", err);
        if (!cancelled) setGl("failed");
      }
    })();
    return () => {
      cancelled = true;
      ctrl.releaseAll("pointer:");
      sceneRef.current = null;
      handle?.dispose();
    };
  }, [ctrl, enable]);

  useEffect(() => ctrl?.engine.setVolume(volume / 100), [ctrl, volume]);
  useEffect(() => ctrl?.engine.setReverb(reverb), [ctrl, reverb]);

  const setTargets = useCallback((midis: readonly number[]) => {
    targetsRef.current = midis;
    setTargetsState(midis);
    sceneRef.current?.setTargets(midis);
  }, []);

  const ready = status.phase === "ready";
  const value = useMemo<PianoState>(
    () => ({ ctrl, status, ready, controls, active, last, targets, enable, setTargets }),
    [ctrl, status, ready, controls, active, last, targets, enable, setTargets],
  );

  return (
    <PianoContext.Provider value={value}>
      <div className="relative min-h-svh bg-bg lg:grid lg:h-svh lg:grid-cols-[minmax(0,1fr)_auto] lg:overflow-hidden">
        <section aria-labelledby="piano-title" className="relative flex min-w-0 flex-col lg:h-svh">
          <header className="z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-[var(--gutter)] py-3 lg:absolute lg:inset-x-0 lg:top-0 lg:border-transparent lg:bg-[linear-gradient(to_bottom,var(--color-bg)_55%,transparent)] lg:pb-6">
            <div className="flex items-center gap-3">
              <a href="https://tkoulal.tech" className="label link-line flex items-center gap-2 text-fg-2 hover:text-fg">
                <span aria-hidden="true">←</span> Taha Koulal
              </a>
              <span className="label text-fg-3" aria-hidden="true">/</span>
              <h1 id="piano-title" className="label flex items-center gap-2 text-fg">
                <span className="inline-block size-1.5 bg-accent" aria-hidden="true" />
                Piano
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="label flex h-9 items-center gap-2 border border-line px-3 text-fg-2">
                Vol
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-20 accent-[var(--color-accent)] sm:w-24"
                  aria-label="Master volume"
                />
                <span className="tabular w-7 text-right text-fg">{volume}</span>
              </label>
              <Toggle on={controls.sustain || controls.pedal} onClick={() => ctrl?.setSustain(!controls.sustain)} title="Sustain pedal. Hold Space for a momentary pedal.">
                Sustain{controls.pedal && !controls.sustain ? " · space" : ""}
              </Toggle>
              <Toggle on={reverb} onClick={() => setReverb((r) => !r)} title="A subtle room reverb">
                Reverb
              </Toggle>
              <div className="flex h-9 items-center border border-line" role="group" aria-label="Camera view">
                {(["piano", "keys"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    disabled={gl !== "ready"}
                    onClick={() => {
                      setView(v);
                      sceneRef.current?.setView(v);
                    }}
                    title={v === "keys" ? "Close-up on the keyboard: bigger keys, key numbers" : "The whole instrument"}
                    className={`label h-full px-3 transition-colors disabled:opacity-40 ${view === v ? "bg-accent-glow text-fg" : "text-fg-3 hover:text-fg"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setView("piano");
                  sceneRef.current?.resetView();
                }}
                disabled={gl !== "ready" || !moved}
                className="label h-9 border border-line px-3 text-fg-2 transition-colors hover:text-fg disabled:opacity-40"
              >
                Reset view
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen((p) => !p)}
                aria-expanded={panelOpen}
                aria-controls="piano-guide"
                className="label hidden h-9 border border-line px-3 text-fg-2 transition-colors hover:text-fg lg:inline-flex lg:items-center"
              >
                {panelOpen ? "Hide guide" : "Show guide"}
              </button>
            </div>
          </header>

          <div className="relative h-[54svh] min-h-[18rem] w-full lg:h-auto lg:min-h-0 lg:flex-1">
            <canvas
              ref={canvasRef}
              aria-label="3D grand piano. Play with the number keys 1 to 8, Shift for black keys, [ and ] to change octave, or click and tap the keys. Drag the background to turn the view."
              role="img"
              className={`absolute inset-0 size-full touch-none select-none transition-opacity duration-700 ${gl === "ready" ? "opacity-100" : "opacity-0"}`}
            />
            {gl === "failed" && (
              <p className="label absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-fg-2">
                The 3D view could not start on this device. The keys below still play.
              </p>
            )}
            <SoundGate started={started} />
          </div>

          {/* One recorder and one readout block: in the flow on a phone, over the stage's base on a desktop. */}
          <div className={`border-t border-line px-[var(--gutter)] py-4 ${gl === "failed" ? "" : "lg:border-0 lg:p-0"}`}>
            <div className={gl === "failed" ? "" : "lg:hidden"}>
              <TouchKeys />
            </div>
            <div
              className={`mt-4 flex flex-col gap-3 ${
                gl === "failed"
                  ? "lg:flex-row lg:items-end lg:justify-between"
                  : "lg:pointer-events-none lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0 lg:flex-row lg:items-end lg:justify-between lg:bg-[linear-gradient(to_top,var(--color-bg)_45%,transparent)] lg:px-[var(--gutter)] lg:pb-4 lg:pt-8"
              }`}
            >
              <div className="lg:pointer-events-auto">
                <RecorderStrip />
              </div>
              <Readouts notice={notice} />
            </div>
          </div>
        </section>

        <aside
          id="piano-guide"
          aria-label="Piano guide"
          className={`border-t border-line lg:h-svh lg:overflow-hidden lg:border-l lg:border-t-0 lg:transition-[width] lg:duration-500 lg:ease-[var(--ease-out-expo)] motion-reduce:transition-none ${
            panelOpen ? "lg:w-[24rem]" : "lg:w-0 lg:border-l-0"
          }`}
        >
          <div className={`h-full lg:w-[24rem] ${panelOpen ? "" : "lg:invisible"}`}>
            <TutorialPanel />
          </div>
        </aside>
      </div>
    </PianoContext.Provider>
  );
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`label flex h-9 items-center gap-2 border px-3 transition-colors ${on ? "border-accent-deep text-fg" : "border-line text-fg-2 hover:text-fg"}`}
    >
      <span className={`inline-block size-1.5 rounded-full ${on ? "bg-accent" : "bg-fg-3/40"}`} aria-hidden="true" />
      {children}
    </button>
  );
}
