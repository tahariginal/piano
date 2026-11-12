# Piano

An interactive 3D grand piano in the browser, with real Yamaha C5 recordings.
Play it with the number keys, the mouse or touch. Follow guided lessons,
practise melodies, and record and replay a take.

## Playing

| Input | Plays |
| --- | --- |
| `1` – `8` | Do to high Do (C4 – C5 in octave 4) |
| `Shift` + `1` `2` `4` `5` `6` | The black keys: Do♯ Re♯ Fa♯ Sol♯ La♯ |
| `[` / `]` | Octave down / up (2 – 6) |
| Hold `Space` | Sustain pedal |
| Mouse or touch | Press a key; slide to glide across keys |

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
