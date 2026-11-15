"use client";

import { useRef } from "react";
import { isBlack, noteName, OCTAVE_MAX, OCTAVE_MIN, shortcutFor, solfege, windowNotes } from "@/lib/piano/notes";
import { usePiano } from "./context";

/** Black keys sit on the boundary after these white keys (C D _ F G A), nudged like a real keyboard. */
const BLACK_AT: Record<number, { after: number; nudge: number }> = {
  1: { after: 1, nudge: -0.12 },
  3: { after: 2, nudge: 0.12 },
  6: { after: 4, nudge: -0.14 },
  8: { after: 5, nudge: 0 },
  10: { after: 6, nudge: 0.14 },
};

/**
 * A flat, touch-sized keyboard for the thirteen notes the number keys reach.
 * The main way to play on a phone, and the fallback when WebGL is missing.
 * Multi-touch plays chords; sliding a finger glides across keys.
 */
export default function TouchKeys() {
  const { ctrl, ready, controls, active, targets, enable, keyFeedback } = usePiano();
  const box = useRef<HTMLDivElement>(null);
  const lastPress = useRef(-Infinity);
  const clicks = useRef(0);
  const notes = windowNotes(controls.octave);
  const whites = notes.filter((m) => !isBlack(m));
  const holder = (id: number) => `pointer:k${id}`;

  const midiAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-midi]");
    return el && box.current?.contains(el) ? Number(el.dataset.midi) : null;
  };

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const midi = midiAt(e.clientX, e.clientY);
    if (midi === null || !ctrl) return;
    lastPress.current = e.timeStamp;
    e.preventDefault();
    box.current?.setPointerCapture(e.pointerId);
    enable();
    if (ready) ctrl.press(holder(e.pointerId), midi, 0.76, "pointer");
  };
  const move = (e: React.PointerEvent) => {
    if (!ctrl || !box.current?.hasPointerCapture(e.pointerId)) return;
    const midi = midiAt(e.clientX, e.clientY);
    if (midi === null) ctrl.release(holder(e.pointerId));
    else if (ready) ctrl.press(holder(e.pointerId), midi, 0.7, "pointer");
  };
  const up = (e: React.PointerEvent) => ctrl?.release(holder(e.pointerId));
  // A click with no press just before it: a screen reader's double-tap, or a tap the
  // browser sent as a plain click. Start sound, or play the key briefly.
  const click = (e: React.MouseEvent) => {
    if (e.timeStamp - lastPress.current < 1000 || !ctrl) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-midi]");
    if (!el || !box.current?.contains(el)) return;
    enable();
    if (!ctrl.engine.ready) return;
    const h = `pointer:click${++clicks.current}`;
    ctrl.press(h, Number(el.dataset.midi), 0.7, "pointer");
    window.setTimeout(() => ctrl.release(h), 400);
  };
  const label = (m: number) => `${solfege(m)}, ${noteName(m)}`;

  const keyClass = (midi: number) => {
    if (keyFeedback[midi] === "correct") return "bg-[#22c55e]";
    if (keyFeedback[midi] === "wrong") return "bg-[#b95b5b]";
    const on = active.includes(midi);
    const target = targets.includes(midi);
    if (isBlack(midi)) return on ? "bg-accent-deep" : target ? "bg-[#10151f] outline outline-1 -outline-offset-2 outline-accent" : "bg-[#0b0b0b]";
    return on ? "bg-[#cfe0fb]" : target ? "bg-fg outline outline-2 -outline-offset-3 outline-accent" : "bg-fg";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="label text-fg-3">
          Keys <span className="text-fg">1–8</span> · <span className="text-fg">X C V B N</span> for black keys
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="Octave">
          <button
            type="button"
            onClick={() => ctrl?.shiftOctave(-1)}
            disabled={controls.octave <= OCTAVE_MIN}
            className="label flex size-11 items-center justify-center border border-line text-fg transition-colors hover:border-line-2 disabled:opacity-35"
            aria-label="Octave down"
          >
            −
          </button>
          <span className="label tabular w-16 text-center text-fg" aria-live="polite">
            Oct {controls.octave}
          </span>
          <button
            type="button"
            onClick={() => ctrl?.shiftOctave(1)}
            disabled={controls.octave >= OCTAVE_MAX}
            className="label flex size-11 items-center justify-center border border-line text-fg transition-colors hover:border-line-2 disabled:opacity-35"
            aria-label="Octave up"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={box}
        role="group"
        aria-label={`Piano keys, octave ${controls.octave}`}
        className="relative flex h-40 w-full touch-none select-none sm:h-44"
        onClick={click}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        {whites.map((m) => (
          <div
            key={m}
            data-midi={m}
            role="button"
            tabIndex={-1}
            aria-label={label(m)}
            aria-pressed={active.includes(m)}
            className={`relative mr-px flex flex-1 flex-col items-center justify-end gap-1 pb-3 text-bg transition-colors duration-75 last:mr-0 ${keyClass(m)}`}
          >
            <span className="label text-[0.8rem]" aria-hidden="true">{shortcutFor(m, controls.octave)}</span>
            <span className="text-[0.7rem] text-bg/60" aria-hidden="true">{solfege(m)}</span>
          </div>
        ))}
        {notes
          .filter(isBlack)
          .map((m) => {
            const pos = BLACK_AT[m % 12];
            const left = ((pos.after + pos.nudge) / whites.length) * 100;
            return (
              <div
                key={m}
                data-midi={m}
                role="button"
                tabIndex={-1}
                aria-label={label(m)}
                aria-pressed={active.includes(m)}
                style={{ left: `${left}%`, width: `${(0.62 / whites.length) * 100}%` }}
                className={`absolute top-0 z-10 flex h-[58%] -translate-x-1/2 flex-col items-center justify-end pb-2 text-fg transition-colors duration-75 ${keyClass(m)}`}
              >
                <span className="label text-[0.7rem]" aria-hidden="true">{shortcutFor(m, controls.octave)}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
