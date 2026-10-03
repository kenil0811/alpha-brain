# The companion: three sizes, drag from anywhere, and Bridge's moods (3 October 2026, night)

Kenil, after seeing the characters: make it a little smaller (three sizes, the current one
medium), let it be dragged from anywhere rather than its top, and bring in Bridge's emotes for
listening, thinking and the rest.

**Three sizes.** `size` is part of the look (`companion_look`: small, medium, large; 60, 80
and 108 px tall at rest, 0.7 of that with the panel open), chosen in Settings beside the
wardrobe. The window follows: the page now tells the host the width and height it needs for
what it shows (the character with room for its shadow, the character under a bubble, the open
panel) and the host keeps the bottom-right corner in place (`avatar_layout(mode, width,
height)`; the three fixed sizes in `lib.rs` are gone).

**Drag from the character.** The grip above the character is gone. A press on the character
that moves more than five pixels becomes a drag of the window (the host's `startDragging`);
one that does not is the click that opens the panel (`avatar/drag.ts`, pure, with a test).
The panel's header still drags. Keyboard: Enter or Space on the character opens the panel.

**The moods.** The rig's five moods became Bridge's eleven emotions plus talking, as a table
of poses (`POSES` in `avatar/Rig.tsx`): each mood sets a painted mouth and its scale, how open
the eyes are, the brows (raised, furrowed, sorry), the head's tilt and drop, the ears' perk and
size, the cheeks' blush, the gaze, the body's squash or stretch, the whiskers' droop, and how
often it blinks and breathes; listening and comforting nod; happy and celebrating hop once on
arrival; the pupils drift between looks (saccades) as far as the mood allows. Bridge springs
these every frame under a director; here a mood change eases by CSS transitions and the rest
are CSS animations timed by the pose, so the window does nothing between changes. Still when
hidden, rested, or when the Mac asks for reduced motion (then also no drift and no hop).

What drives them in the companion window: typing in the panel → curious; the microphone →
listening; a turn running → thinking; a reply → talking for two seconds, then happy (an
answer), concerned (a failure) or celebrating (an action done: "Sending it.", "Doing it.")
while the bubble shows; a routing question → unsure; ten minutes with nothing happening →
sleepy; otherwise calm. Proud and comforting are in the vocabulary with no trigger yet.

**What ran.** In the browser pane against a check core on a fresh backup copy of Kenil's world,
the companion's own route: typing "what did I eat today" showed "Alpha, a panda, is curious";
sending it, "is thinking"; a second turn ("log one apple as a snack") read thinking at 8 and
13 s, talking at 18 s, happy at 22 s, here after the bubble; Settings' Size row set large and
the companion drew at 108 px on its next poll, the core holding `size: "large"`. The drag
itself needs the host, so it is proven by the pure decision's tests and will be felt in the
app. Tests: 53 desktop (every mood names itself and sets its pose; happy blushes and squints,
thinking looks up and aside, sleepy droops, listening nods; the size in the look; drag or
click), typecheck clean; `just check-desktop settings` clean at every size.
