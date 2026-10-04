# The companion's characters (3 October 2026, evening; idea 14 of the port, Q27)

**What was built.** The companion is drawn from Bridge's painted character art (Manish's
Zazoo Lab, with his permission), in a look the person chooses: one of ten animals, its fur, the
suit, the shirt, a tie or a bow or nothing, glasses. It is Alpha whichever animal it is.

- **The artwork** came in as assets (`desktop/src/avatar/art/panda/`, 17 webp parts, 248 KB,
  `art/CREDIT.md` says whose they are): the body shell, suit, shirt, tie, arm, ear, eye, pupil,
  brow, snout, patch and six mouths. Nothing of Bridge's code came with them; the places the
  parts sit on the artist's 3840-unit canvas were taken as measured data.
- **The rig** (`avatar/Rig.tsx`, 300 lines against Bridge's 1,300 plus a 630-line director) is
  Alpha's own: the parts composed in SVG; the fur, suit, shirt and tie tinted by a duotone
  filter that keeps the painting's shading; the chosen animal's ears (pointed, tall, round,
  floppy), eyes (the painted dark gloss for the panda, a white eye with the painted pupil for
  the rest), nose (painted, triangular, oval), whiskers and muzzle drawn over the same body;
  the face set by the mood the companion window already had (here, listening, thinking,
  talking, sorry): a painted mouth per mood, the brows raised, furrowed or sorry, the gaze up
  while thinking, the mouth cycling through three paintings while talking. Breath and blinks
  are CSS; the rig is still when the window is hidden, after ninety seconds with nothing
  happening, and when the Mac asks for reduced motion.
- **The animals** (`avatar/looks.ts`): panda, cat, rabbit, fox, bear, otter, red panda,
  koala, hamster, squirrel: the ones the painted body carries well at the companion's size.
  Bridge's cast has thirty-two, with horns, quills, beaks and tails; those need parts this
  rig does not draw and would look poor at 80px, so they wait. Each animal is a small delta
  (Bridge's idea): ears, eyes, nose, whiskers, muzzle, its own felt colour.
- **The choice** lives in Settings ("The companion's look", `avatar/LookPicker.tsx`): a
  preview, the animals as small rigs, swatches for fur (or the animal's own; the panda as
  painted), suit, shirt and tie, the neckwear, glasses. Every change is kept at once.
- **In the core**, a `preferences` table (one JSON value per key; `world/preferences.py`;
  `GET`/`PUT /api/preferences/{key}`), the first key `companion_look`. The core keeps a value as
  given and the window fills in defaults for anything missing (`normaliseLook`), so an older or
  newer window still draws something. `/api/companion` carries the look, so the companion
  window, which already polls it, follows a change without a call of its own. A choice of
  look is not a setting of behaviour (Q18) and is not journaled: it changes nothing Alpha does.

**What ran.** In the browser pane against a check core on a copy of Kenil's world: Settings
showed the panda as painted; picking the fox redrew the preview and the ten thumbnails; the bow,
the glasses and teal for the bow followed; the core held `{"animal": "fox", "fur": null,
"suit": "#2b3a55", "shirt": "#f4f1ea", "tie": "#2f6b73", "neckwear": "bow", "glasses": true}`;
the companion window's own route (`#avatar`) drew "Alpha, a fox, is here" with the glasses and
the bow on its next poll. Tests: three in the core (kept as given and overwritten; key and
value checked; the window's routes and the companion's look), eight in the desktop (the look's
defaults and validation; the rig's label, animal and parts; the picker's loading and saving);
45 desktop tests, typecheck clean; `just check-desktop settings home` clean at every size.

**Not done.** The remaining twenty-two of Bridge's animals; the arms do not gesture (they rest
at the belly as the reference art has them); the panel's "A" mark and the rail's brand do not
show the character (a thought for later: the panel head could carry the face); no look of
Alpha's choosing (it never changes its own look).
