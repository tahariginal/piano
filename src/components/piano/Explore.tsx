"use client";

import { useEffect } from "react";
import { letterName, noteName, octaveOf, shortcutFor, solfege, windowNotes } from "@/lib/piano/notes";
import { usePiano } from "./context";

/** Explore: every note the number keys reach, lit as it is played. */
export default function Explore({ active: shown }: { active: boolean }) {
  const { active, last, controls, setTargets } = usePiano();

  useEffect(() => {
    if (shown) setTargets([]);
  }, [shown, setTargets]);

  const current = active.length ? active[active.length - 1] : (last?.midi ?? null);
  const notes = windowNotes(controls.octave);

  return (
    <div>
      <h2 className="text-[1.35rem] font-medium leading-tight tracking-[-0.02em]">Explore the notes</h2>
      <p className="mt-2 text-[0.95rem] leading-snug text-fg-2">Play any key. Its name, solfège, shortcut and octave light up here and on the piano.</p>

      <div className="mt-5 border border-line p-4" aria-live="polite">
        <p className="label text-fg-3">Now playing</p>
        {current === null ? (
          <p className="mt-2 text-fg-3">Press 1 to start: that is Do.</p>
        ) : (
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="display text-[3.2rem] text-fg">
              {solfege(current)}
              <span className="ml-2 align-top text-[1.1rem] tracking-normal text-fg-3">{noteName(current)}</span>
            </p>
            <dl className="label grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-right text-fg-3">
              <dt>Key</dt>
              <dd className="text-accent-light">{shortcutFor(current, controls.octave) ?? `${noteName(current)}`}</dd>
              <dt>Octave</dt>
              <dd className="text-fg">{octaveOf(current)}</dd>
              {active.length > 1 && (
                <>
                  <dt>Chord</dt>
                  <dd className="text-fg">{active.map(letterName).join(" ")}</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <p className="label text-fg-3">Octave {controls.octave} · number keys</p>
        <p className="label text-fg-3">
          <kbd className="text-fg">[</kbd> <kbd className="text-fg">]</kbd> octave
        </p>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1">
        {notes.map((m) => {
          const on = active.includes(m);
          const was = !on && last?.midi === m;
          return (
            <li
              key={m}
              className={`flex items-center justify-between border px-3 py-2 transition-colors duration-150 ${
                on ? "border-accent bg-accent-glow" : was ? "border-line-2" : "border-line"
              }`}
            >
              <span className="flex items-baseline gap-2">
                <kbd className={`label tabular w-6 ${on ? "text-accent-light" : "text-fg"}`}>{shortcutFor(m, controls.octave)}</kbd>
                <span className={on ? "text-fg" : "text-fg-2"}>{solfege(m)}</span>
              </span>
              <span className="label text-fg-3">{noteName(m)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[0.9rem] leading-snug text-fg-3">
        Hold <kbd className="label text-fg">Shift</kbd> with 1, 2, 4, 5 or 6 for the black keys. Hold <kbd className="label text-fg">Space</kbd> for the sustain pedal.
      </p>
    </div>
  );
}
