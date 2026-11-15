"use client";

import { useEffect, useState } from "react";
import { melodies, melodyPitches, type Melody } from "@/lib/piano/lessons";
import { keyInstruction, startingOctave, type LearningMode } from "@/lib/piano/learning";
import { clampOctave, noteName, octaveOf, shortcutFor, solfege } from "@/lib/piano/notes";
import { usePiano } from "./context";
import { feedbackText } from "./tutorial-ui";
import { useLearning } from "./useLearning";

const btn = "label inline-flex min-h-10 items-center justify-center gap-2 border border-line px-3 py-2 text-fg-2 transition-colors hover:border-accent hover:text-fg disabled:pointer-events-none disabled:opacity-35";
const modes: { id: LearningMode; label: string; description: string }[] = [
  { id: "step", label: "Step by Step", description: "Take your time. Play the blue key to move on. Green means correct; red means try again." },
  { id: "practice", label: "Practice", description: "After two beats, play along with the piano. Follow the blue keys and timing bar. Missed notes are counted." },
  { id: "free", label: "Free Play", description: "Try the melody from memory. Guidance and scoring are off. Switch modes whenever you need a hint." },
];

export default function Melodies({ active }: { active: boolean }) {
  const [selected, setSelected] = useState<Melody | null>(null);
  const { ctrl, enable, focusKeyboard, setTargets } = usePiano();
  useEffect(() => { if (active && !selected) setTargets([]); }, [active, selected, setTargets]);
  const learn = (melody: Melody) => {
    enable();
    ctrl?.setOctave(startingOctave(melody));
    focusKeyboard();
    setSelected(melody);
  };
  if (selected) return <MelodySession key={selected.id} melody={selected} active={active} back={() => { setSelected(null); setTargets([]); }} />;
  return (
    <div>
      <h2 className="text-[1.35rem] font-medium tracking-tight">Learn a melody</h2>
      <p className="mt-2 text-[0.95rem] leading-snug text-fg-2">Choose a song. We’ll show you exactly which piano key and computer key to press.</p>
      <ul className="mt-5 grid gap-2">
        {melodies.map((m) => (
          <li key={m.id} className="border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[0.95rem] leading-snug text-fg">{m.title}</h3>
                <p className="label mt-2 text-fg-3">{m.difficulty} · {m.notes.length} steps</p>
              </div>
              <button type="button" className={`${btn} shrink-0 border-accent-deep text-accent-light`} onClick={() => learn(m)} aria-label={`Learn ${m.title}`}>Learn →</button>
            </div>
            <p className="mt-2 text-xs text-fg-3">{m.credit}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-fg-3">Use number keys 1–8 for white keys and X C V B N for black keys, or click the piano. Hold the notes of a chord together.</p>
    </div>
  );
}

function MelodySession({ melody, active, back }: { melody: Melody; active: boolean; back: () => void }) {
  const { controls, ready, ctrl, focusKeyboard } = usePiano();
  const l = useLearning(melody, active);
  const { state, range } = l;
  const pitches = melodyPitches(melody.notes[l.visualIndex]);
  const total = range.end - range.start;
  const progress = state.done ? total : state.index - range.start;
  const message = feedbackText(l.feedback, controls.octave, "Melody complete");
  const time = l.timing[l.visualIndex];
  const beatProgress = l.seconds === null ? 0 : Math.max(0, Math.min(1, (l.seconds - time.start) / (time.end - time.start)));
  const outOfOctave = pitches.some((p) => !shortcutFor(p, controls.octave));
  const sections = Array.from({ length: Math.ceil(melody.notes.length / 4) }, (_, i) => ({ start: i * 4, end: Math.min(melody.notes.length, i * 4 + 4) }));
  const all = range.start === 0 && range.end === melody.notes.length;
  const paused = l.transport === "paused";

  return (
    <div>
      <button type="button" className="label text-fg-3 hover:text-fg" onClick={back}>← Choose melody</button>
      <h2 className="mt-3 text-[1.35rem] font-medium leading-tight tracking-tight">{melody.title}</h2>
      <p className="label mt-2 text-fg-3">{melody.difficulty} · {melody.credit}</p>
      <div role="group" aria-label="Learning mode" className="mt-5 grid grid-cols-3 gap-1">
        {modes.map((m) => <button key={m.id} type="button" className={`${btn} px-1 ${l.mode === m.id ? "border-accent-deep bg-accent-glow text-fg" : ""}`} aria-pressed={l.mode === m.id} onClick={() => l.setMode(m.id)}>{m.label}</button>)}
      </div>
      <p className="mt-3 text-sm leading-snug text-fg-2">{modes.find((m) => m.id === l.mode)?.description}</p>

      {l.mode !== "free" && <>
        <div className="mt-4 flex items-end justify-between gap-3">
          <label className="label flex-1 text-fg-3" htmlFor="melody-section">Section
            <select id="melody-section" value={all ? "all" : range.start} onChange={(e) => { const s = sections.find((s) => s.start === Number(e.target.value)); e.target.value === "all" ? l.section(0, melody.notes.length) : s && l.section(s.start, s.end); e.currentTarget.blur(); }} className="mt-2 h-10 w-full border border-line bg-bg px-2 text-fg">
              <option value="all">Whole melody</option>
              {sections.map((s, i) => <option key={s.start} value={s.start}>Section {i + 1} · steps {s.start + 1}–{s.end}</option>)}
            </select>
          </label>
          <button type="button" className={btn} onClick={l.replay} disabled={!ready}>{all ? "Listen" : "Replay section"}</button>
        </div>
        <label className="label mt-4 flex items-center gap-3 text-fg-3" htmlFor="melody-tempo">
          Tempo
          <input id="melody-tempo" type="range" min="40" max="160" step="4" value={l.bpm} onChange={(e) => l.setBpm(Number(e.target.value))} onPointerUp={(e) => e.currentTarget.blur()} onKeyUp={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }} className="min-w-0 flex-1 accent-[var(--color-accent)]" />
          <span className="tabular text-fg">{l.bpm} BPM</span>
        </label>
        <p className="mt-1 text-xs text-fg-3">{l.mode === "step" ? "Tempo changes listening speed. Steps always wait for you." : "A slower tempo gives you more time. Changes resume at the current note."}</p>

        <div className="mt-5 border border-accent/50 bg-accent-glow p-4" data-learning-current={pitches.join(",")}>
          <p className="label text-accent-light">{state.done ? "Complete" : paused ? "Paused" : l.transport === "listen" ? "Listen to the piano" : l.countingIn ? "Get ready" : pitches.length > 1 ? "Hold together" : "Play this key"}</p>
          {!state.done && <>
            <div className="mt-3 flex flex-wrap gap-3">
              {pitches.map((midi) => <div key={midi}>
                <p className="text-2xl font-medium">{noteName(midi)} <span className="text-sm text-fg-2">{solfege(midi)}</span></p>
                <kbd className="mt-1 inline-block border border-accent/40 bg-bg px-2 py-1 text-sm text-accent-light">{keyInstruction(midi, controls.octave)}</kbd>
              </div>)}
            </div>
            {outOfOctave && <p className="mt-3 text-sm text-fg-2">Your keyboard is in octave {controls.octave}. Use the bracket keys above, click the highlighted piano key, or <button type="button" className="text-accent-light underline" onClick={() => ctrl?.setOctave(clampOctave(octaveOf(pitches[0])))}>set octave {clampOctave(octaveOf(pitches[0]))}</button>.</p>}
            {l.seconds !== null && <div className="mt-3" aria-label="Timing cue">
              <p className="label text-accent-light">{l.countingIn ? `Start in ${Math.ceil((time.start - l.seconds) * l.bpm / 60)}…` : "Play now"}</p>
              <div className="mt-2 h-1 bg-line-2"><div className="h-full bg-accent" style={{ width: `${beatProgress * 100}%` }} /></div>
            </div>}
          </>}
          {state.done && <p className="mt-2 text-sm text-fg">{l.mode === "step" ? "You played every step!" : `${state.correct} of ${total} steps played correctly · ${state.missed} missed.`} Try it again, or switch to Free Play.</p>}
        </div>

        {!state.done && <div className="mt-3">
          <p className="label text-fg-3">Coming next</p>
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {melody.notes.slice(l.visualIndex + 1, Math.min(range.end, l.visualIndex + 5)).map((n, i) => <li key={i} className="border border-line px-2 py-1 text-xs text-fg-2">{melodyPitches(n).map(noteName).join(" + ")}<span className="ml-1 text-fg-3">({melodyPitches(n).map((m) => keyInstruction(m, controls.octave)).join(" / ")})</span></li>)}
            {l.visualIndex + 1 >= range.end && <li className="text-sm text-fg-3">Last step — you’re almost there.</li>}
          </ol>
        </div>}
        <div className="mt-4 flex justify-between text-xs text-fg-3"><span className="tabular" data-learning-progress>{progress} / {total} steps</span><span>{state.wrong} slips{l.mode === "practice" ? ` · ${state.missed} missed` : ""}</span></div>
        <progress aria-label="Melody progress" max={total} value={progress} className="mt-2 block h-1 w-full accent-[var(--color-accent)]" />
        <p className={`mt-3 min-h-10 text-sm leading-snug ${message?.tone === "bad" ? "text-red-300" : message?.tone === "good" ? "text-green-400" : "text-fg-3"}`} role="status">
          {!ready ? "Sound is loading. Your first note will wait for you." : state.done ? "✓ Melody complete." : paused ? "Paused. Resume starts from the current note." : l.transport === "listen" ? "Watch the keys and listen. Then press Resume to play this section yourself." : message?.text ?? "Press the shown computer key or click the blue piano key."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {!state.done && <button type="button" className={btn} onClick={paused ? l.resume : l.pause}>{paused ? "Resume" : "Pause"}</button>}
          <button type="button" className={btn} onClick={l.restart}>Restart</button>
          <button type="button" className={btn} onClick={focusKeyboard}>Focus keys</button>
        </div>
      </>}
      {l.mode === "free" && <div className="mt-5 border border-line p-4"><p className="text-sm text-fg-2">The piano is yours. Play with the number keys or tap the piano. Sustain, reverb, octave controls, and recording all work as usual.</p><button type="button" onClick={focusKeyboard} className={`${btn} mt-4`}>Focus keys</button></div>}
      <p className="mt-4 text-xs leading-relaxed text-fg-3">X C V B N play the black keys. [ / ] changes octave. Drag beside the piano to rotate. Scroll to zoom where the pointer is, or use − / + (or the - / = keys). Reset view restores the full piano.</p>
    </div>
  );
}
