"use client";

import { useState } from "react";
import { ATTRIBUTION } from "@/lib/piano/samples";
import Explore from "./Explore";
import Lessons from "./Lessons";
import Melodies from "./Melodies";

const MODES = [
  { id: "explore", n: "01", label: "Explore" },
  { id: "lessons", n: "02", label: "Lessons" },
  { id: "melodies", n: "03", label: "Melodies" },
] as const;
type Mode = (typeof MODES)[number]["id"];

/** Right-hand guide: explore notes, guided lessons, melody practice. */
export default function TutorialPanel() {
  const [mode, setMode] = useState<Mode>("explore");

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-[var(--gutter)] pb-4 pt-5 lg:px-6 lg:pt-[4.5rem]">
        <p className="label flex items-center gap-2 text-fg-3">
          <span className="inline-block size-1.5 bg-accent" aria-hidden="true" />
          Guide
        </p>
        <div className="mt-4 grid grid-cols-3 gap-1" role="group" aria-label="Guide mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`label flex h-10 items-center justify-center gap-2 border transition-colors ${
                mode === m.id ? "border-accent-deep text-fg" : "border-line text-fg-3 hover:text-fg"
              }`}
            >
              <span className={`tabular ${mode === m.id ? "text-accent" : ""}`}>{m.n}</span>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] py-5 lg:px-6">
        {/* All three stay mounted so progress survives switching; only the visible one listens. */}
        <div hidden={mode !== "explore"}>
          <Explore active={mode === "explore"} />
        </div>
        <div hidden={mode !== "lessons"}>
          <Lessons active={mode === "lessons"} />
        </div>
        <div hidden={mode !== "melodies"}>
          <Melodies active={mode === "melodies"} />
        </div>
      </div>

      <p className="label border-t border-line px-[var(--gutter)] py-3 leading-relaxed text-fg-3 lg:px-6">
        Sound:{" "}
        <a href={ATTRIBUTION.source} target="_blank" rel="noreferrer" className="link-line text-fg-2">
          {ATTRIBUTION.title}
        </a>{" "}
        by {ATTRIBUTION.author}, {ATTRIBUTION.instrument.replace(" grand piano", "")} ·{" "}
        <a href={ATTRIBUTION.licenseUrl} target="_blank" rel="noreferrer" className="link-line text-fg-2">
          {ATTRIBUTION.license}
        </a>
      </p>
    </div>
  );
}
