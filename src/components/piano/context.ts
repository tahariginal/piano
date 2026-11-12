"use client";

import { createContext, useContext } from "react";
import type { EngineStatus } from "@/lib/piano/audio";
import type { ControlState, PianoController, Source } from "@/lib/piano/controller";

export type LastNote = { midi: number; source: Source; at: number } | null;

export type PianoState = {
  ctrl: PianoController | null;
  status: EngineStatus;
  ready: boolean;
  controls: ControlState;
  /** Notes down right now, low to high. */
  active: readonly number[];
  last: LastNote;
  /** Notes the active lesson or melody expects next. */
  targets: readonly number[];
  /** Start or resume audio. Call from a user gesture. */
  enable: () => void;
  setTargets: (midis: readonly number[]) => void;
};

export const PianoContext = createContext<PianoState | null>(null);

export function usePiano(): PianoState {
  const v = useContext(PianoContext);
  if (!v) throw new Error("usePiano must be used inside <PianoExperience>.");
  return v;
}
