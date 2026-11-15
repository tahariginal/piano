# Piano

An interactive 3D grand piano in the browser, with real Yamaha C5 recordings.
Play it with the number keys, the mouse or touch. Follow guided lessons,
practise melodies, and record and replay a take.

## Playing

| Input | Plays |
| --- | --- |
| `1` – `8` | Do to high Do (C4 – C5 in octave 4) |
| `X` `C` `V` `B` `N` | The black keys: Do♯ Re♯ Fa♯ Sol♯ La♯ |
| `[` / `]` | Octave down / up (2 – 6) |
| Hold `Space` | Sustain pedal |
| Mouse or touch | Press a key; slide to glide across keys |
| Scroll, `-` / `=`, or **− / +** | Zoom out / in (scroll zooms toward the pointer) |

## Learning a melody

Open **Melodies** and choose **Learn**. The camera moves to the keyboard.
Blue keys show what to play, with the note name and current computer shortcut.
Correct presses briefly turn green; wrong presses turn red and keep your place.

**Despacito · short excerpt** is a 16-note beginner exercise at 80 BPM, with
simplified rhythm and the melody transposed to A minor. It uses white keys in
octave 4 (starting on **8**, high C). It is a brief excerpt, not the full song.
The pitch reference is [Piano Keyboard Guide's tutorial](https://www.piano-keyboard-guide.com/despacito-piano-notes-justin-bieber-luis-fonsi-daddy-yankee-easy-piano-tutorial-how-to-play/).

- **Step by Step** waits for each note, or all chord notes held together.
- **Practice** gives a two-beat count-in and plays the melody through the same
  sampler. Follow the timing bar; each note/chord is scored once within its time
  slot. Unplayed steps count as missed. This is a learning aid, not a strict
  rhythm or note-duration exam.
- **Free Play** removes guidance and scoring so you can try from memory.

Choose the whole melody or a four-step section. Listen/replay starts that section
over; after listening, Resume lets you play it yourself. Pause preserves your
position; timed playback resumes at the start of the current note with a count-in.
Tempo changes also resume the current note. Switching tabs, hiding the guide, or
leaving the browser window pauses the session. Restart resets the selected section.

Octave changes remain manual: follow the `[` / `]` hint or use the suggested
octave button. Chords can be played with several computer keys or multiple fingers
on the touch keyboard. Drag beside the keys to rotate. Scroll to zoom toward the
pointer, or use **− / +** or the `-` / `=` keys; the header shows the zoom level.
Use **Reset view** to return to the full instrument.

### Adding melodies

Add data to `src/lib/piano/lessons.ts`; the interface reads it automatically.
Each melody has an ID, title, credit, difficulty, BPM, and ordered note events:

```ts
{
  midi: 60,       // pitch AND octave: 60 = C4, 61 = C#4, 72 = C5
  beats: 2,      // time to the next event, in beats
  duration: 1.8, // optional sounding duration; defaults to 88% of beats
  at: 4,         // optional start beat; omit to follow the previous event
  chord: [64, 67] // optional extra pitches sounding together with midi
}
```

Keep MIDI pitches within 36–96, beats/durations positive, and explicit start
beats ordered without overlapping steps. Gaps between steps create rests.
Use chord events for simultaneous notes. The collection includes original
exercises, public-domain melodies, and the clearly labeled short Despacito excerpt.

## Development

```bash
pnpm install
pnpm dev         # http://localhost:3000
pnpm build       # static site in out/
pnpm start       # serve out/
pnpm test        # unit tests (notes, lessons, timeline, player)
pnpm typecheck
```

Stack: Next.js 16 (static export), React 19, three.js, Tailwind CSS 4, and the
Web Audio API with a small custom sampler (no audio library).

## Sound

[Salamander Grand Piano V3](https://sfzinstruments.github.io/pianos/salamander/)
by Alexander Holm, recorded on a Yamaha C5, licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The samples and their
licence are in `public/audio/salamander/`.
