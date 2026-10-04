# The companion's eyes and sizes — 4 October 2026, on `feat/interviewer-avatar`

Asked by Vikas: most animals had no eyes; Small should show the whole companion, Medium a
little larger, Large what Medium looked like before.

## What was wrong

- **Eyes.** Nine of the ten animals (every one but the panda) use `eyes: "white"`: a white
  ellipse with `art/panda/pupil.webp` over it. That file is only the panda's two white
  catchlights (its dark is in `eye.webp`), so the eye was white on white, a blank disc that
  vanished on pale fur. The panda was fine.
- **Sizes.** The rig's view box was the bust (420, 180, 2700, 2250 canvas units): it cut the
  arms at both sides (they span x 338..3199), the egg and suit at the bottom (to y 3574) and the
  rabbit's ear tips (y 35), at every size. Separately the idle window was `px + 32` wide while
  the rig is `1.2 × px` wide, so Large (108) was 1.6 px wider than its window.

## What changed

- `Rig.tsx`: a white eye draws a dark iris (`#393841`, the painted eye's colour) under the glints
  (`WhiteEyePupil`), inside the same pupil, lid and blink groups, so it follows gaze, moods and
  blinks. The view box frames the whole figure with room above for the hop
  (300, −150, 2937, 3750); `rigWidth(size)` is exported.
- `looks.ts`: `SIZE_PX` is small 100, medium 115, large 133: Large draws at the old Medium's scale
  (80 px per 2250 units), Small at the old Small's (60 px per 2250).
- `AvatarWindow.tsx`: the idle window is `rigWidth(px) + 32` wide; `src-tauri/src/lib.rs`: the first
  idle size is the new Medium's (122 × 159).
- `Rig.test.tsx`: every animal has two dark eyes under the lids.

## What ran

Each animal at each size rendered in Chromium (Edge through `playwright-core`, a throwaway Vite
page, not committed) in a box of the idle window's size with the real stylesheet: all ten show
eyes, in idle, thinking, unsure and sleepy; the SVG's box lies inside the window box for all 30
(checked by `getBoundingClientRect`). `pnpm typecheck` and `pnpm test` clean (88 passed).
Not run in the Tauri app (WebKit), and not checked mid-hop for the rabbit when listening (its ears
grow 1.28× and may touch the top). Seen in passing, not fixed: the drawn ears (cat, fox, bear,
otter, red panda, koala, hamster, squirrel) sit behind the egg and barely show; only the rabbit's
tips and the panda's caps are visible.
