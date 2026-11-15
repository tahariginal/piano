/**
 * LessonData — guided lessons and practice melodies. Pure data.
 * Everything sits in octave 4 (keys 1–8 = C4–C5) unless a step says otherwise.
 */

/** A step asks for notes one after another, or for a chord held together. */
export type Step =
  | { kind: "sequence"; prompt: string; notes: number[] }
  | { kind: "chord"; prompt: string; notes: number[] };

export type Lesson = { id: string; n: string; title: string; summary: string; steps: Step[] };

/** MIDI includes pitch and octave (60 = C4). Timing is measured in beats.
 * `at` can leave a rest before an event; otherwise events follow each other.
 * `duration` controls sounding length; `beats` controls time until the next event.
 * `chord` adds notes struck at the same time as `midi`.
 */
export type MelodyNote = { midi: number; beats: number; at?: number; duration?: number; chord?: number[] };
export type Melody = { id: string; title: string; credit: string; difficulty: "Beginner" | "Easy"; bpm: number; notes: MelodyNote[] };
export const melodyPitches = (n: MelodyNote): number[] => [...new Set([n.midi, ...(n.chord ?? [])])];

const C4 = 60, Cs4 = 61, D4 = 62, Ds4 = 63, E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, Gs4 = 68, A4 = 69, As4 = 70, B4 = 71, C5 = 72;

const seq = (prompt: string, ...notes: number[]): Step => ({ kind: "sequence", prompt, notes });
const chord = (prompt: string, ...notes: number[]): Step => ({ kind: "chord", prompt, notes });

export const lessons: Lesson[] = [
  {
    id: "first-notes",
    n: "01",
    title: "Learn your first notes",
    summary: "Do, Re and Mi live on keys 1, 2 and 3.",
    steps: [
      seq("Press 1 — Do", C4),
      seq("Press 2 — Re", D4),
      seq("Press 3 — Mi", E4),
      seq("Play 1 → 2 → 3 → 2 → 1", C4, D4, E4, D4, C4),
    ],
  },
  {
    id: "five-fingers",
    n: "02",
    title: "Five fingers",
    summary: "Fa and Sol complete the first hand position.",
    steps: [
      seq("Press 4 — Fa", F4),
      seq("Press 5 — Sol", G4),
      seq("Climb 1 → 2 → 3 → 4 → 5", C4, D4, E4, F4, G4),
      seq("Come back 5 → 4 → 3 → 2 → 1", G4, F4, E4, D4, C4),
    ],
  },
  {
    id: "full-scale",
    n: "03",
    title: "The full scale",
    summary: "La, Si and high Do finish the C major scale.",
    steps: [
      seq("Press 6 — La", A4),
      seq("Press 7 — Si", B4),
      seq("Press 8 — high Do", C5),
      seq("Scale up: 1 → 8", C4, D4, E4, F4, G4, A4, B4, C5),
      seq("Scale down: 8 → 1", C5, B4, A4, G4, F4, E4, D4, C4),
    ],
  },
  {
    id: "black-keys",
    n: "04",
    title: "The black keys",
    summary: "The bottom-row letters X C V B N play the black keys, in the same order as on the piano.",
    steps: [
      seq("X — Do♯", Cs4),
      seq("C — Re♯", Ds4),
      seq("V — Fa♯", Fs4),
      seq("B and N — Sol♯, La♯", Gs4, As4),
      seq("Walk up: 1, X, 2, C, 3", C4, Cs4, D4, Ds4, E4),
    ],
  },
  {
    id: "first-chords",
    n: "05",
    title: "Your first chords",
    summary: "Three notes held together make a chord.",
    steps: [
      chord("Hold 1 + 3 + 5 together — C major", C4, E4, G4),
      chord("Hold 4 + 6 + 8 together — F major", F4, A4, C5),
      chord("Hold 3 + 6 + 8 together — A minor", E4, A4, C5),
      chord("Back home: 1 + 3 + 5", C4, E4, G4),
    ],
  },
  {
    id: "octaves",
    n: "06",
    title: "Octaves",
    summary: "] moves the number keys one octave up, [ moves them down.",
    steps: [
      seq("Press 1 — Do in octave 4", C4),
      seq("Press ] then 1 — Do one octave up", C5),
      seq("Press [ then 1 — back to octave 4", C4),
      seq("Press [ then 5 — Sol one octave down", 55),
    ],
  },
];

const n = (midi: number, beats = 1): MelodyNote => ({ midi, beats });

export const melodies: Melody[] = [
  {
    id: "despacito-excerpt",
    title: "Despacito · short excerpt",
    credit: "Luis Fonsi & Daddy Yankee · simplified in A minor",
    difficulty: "Beginner",
    bpm: 80,
    // Brief practice excerpt, transposed down two semitones to use only white
    // keys in one keyboard window. Rhythm simplified for beginner practice.
    // Pitch reference: https://www.piano-keyboard-guide.com/despacito-piano-notes-justin-bieber-luis-fonsi-daddy-yankee-easy-piano-tutorial-how-to-play/
    notes: [
      n(C5, 1.5), n(B4, 0.5), n(A4, 0.75), n(E4, 0.25),
      n(E4, 0.5), n(E4, 0.5), n(E4, 0.5), n(E4, 0.5),
      n(A4, 0.5), n(A4, 0.5), n(A4, 0.5), n(A4, 0.5),
      n(A4, 0.5), n(G4, 0.5), n(A4, 0.5), n(F4, 1.5),
    ],
  },
  {
    id: "twinkle",
    difficulty: "Beginner",
    title: "Twinkle Twinkle Little Star",
    credit: "Traditional · public domain",
    bpm: 96,
    notes: [
      n(C4), n(C4), n(G4), n(G4), n(A4), n(A4), n(G4, 2),
      n(F4), n(F4), n(E4), n(E4), n(D4), n(D4), n(C4, 2),
      n(G4), n(G4), n(F4), n(F4), n(E4), n(E4), n(D4, 2),
      n(G4), n(G4), n(F4), n(F4), n(E4), n(E4), n(D4, 2),
      n(C4), n(C4), n(G4), n(G4), n(A4), n(A4), n(G4, 2),
      n(F4), n(F4), n(E4), n(E4), n(D4), n(D4), n(C4, 2),
    ],
  },
  {
    id: "ode",
    difficulty: "Easy",
    title: "Ode to Joy",
    credit: "Beethoven, Symphony No. 9 · public domain",
    bpm: 104,
    notes: [
      n(E4), n(E4), n(F4), n(G4), n(G4), n(F4), n(E4), n(D4),
      n(C4), n(C4), n(D4), n(E4), n(E4, 1.5), n(D4, 0.5), n(D4, 2),
      n(E4), n(E4), n(F4), n(G4), n(G4), n(F4), n(E4), n(D4),
      n(C4), n(C4), n(D4), n(E4), n(D4, 1.5), n(C4, 0.5), n(C4, 2),
    ],
  },
  {
    id: "warm-up",
    difficulty: "Beginner",
    title: "Five-finger warm-up",
    credit: "Original exercise",
    bpm: 112,
    notes: [n(C4), n(D4), n(E4), n(F4), n(G4), n(F4), n(E4), n(D4), n(C4, 2)],
  },
  {
    id: "skips",
    difficulty: "Easy",
    title: "Steps and skips",
    credit: "Original exercise",
    bpm: 108,
    notes: [n(C4), n(E4), n(D4), n(F4), n(E4), n(G4), n(F4), n(A4), n(G4), n(B4), n(C5, 2)],
  },
  {
    id: "chromatic",
    difficulty: "Easy",
    title: "Chromatic climb",
    credit: "Original exercise · uses the black keys",
    bpm: 96,
    notes: [n(C4), n(Cs4), n(D4), n(Ds4), n(E4), n(F4), n(Fs4), n(G4, 2), n(Fs4), n(F4), n(E4), n(Ds4), n(D4), n(Cs4), n(C4, 2)],
  },
  {
    id: "little-chords",
    title: "A little harmony",
    credit: "Original exercise · hold notes together",
    difficulty: "Easy",
    bpm: 72,
    notes: [
      { ...n(C4, 2), chord: [E4, G4] }, n(D4), n(E4),
      { ...n(F4, 2), chord: [A4, C5] }, n(E4), n(D4),
      { ...n(C4, 3), chord: [E4, G4] },
    ],
  },
  {
    id: "octave-echo",
    title: "Octave echo",
    credit: "Original exercise · change octave with [ and ]",
    difficulty: "Easy",
    bpm: 72,
    notes: [n(C4), n(E4), n(G4, 2), n(C5), n(76), n(79, 2), n(G4), n(E4), n(C4, 2)],
  },
];
