# The conversation, slice 3: the composer (16 October 2026)

Kenil: "go", after slice 2. The last slice of `../design/conversation-proposal.md`: visual 11.

**The composer** (`assistant/Composer.tsx`, out of `AssistantPanel.tsx`). One rounded box that
lights its border on focus; the text area grows with the words from one line to six and then
scrolls, never a jump in the page; under it one row with a plus for files, the mic as before,
and a round send button with an arrow at the right; "@" offers the agents as before. Enter
sends, Shift+Enter adds a line; the hint under the box says so, beside "Uses your Claude
subscription" (§8). The plus opens the Mac's picker; the files take the route a drop on a
module's page takes (`/api/files`, in the page's module), and the turn that reads them is
followed in the conversation like any other, its reply in the same element. Copy, Edit and the
automatic retry were already in (slices 1 and the core's part), so the proposal is now built.

**Checked.** Desktop: 218 tests pass (new: the round button and Enter send, Shift+Enter does
not; the plus sends the files to the core in the page's module); typecheck clean. One of
slice 1's own tests was racy (it held a streamed node that the final reply replaced) and now
waits on the right thing. `just check-desktop assistant`: `docs/checks/2026-10-16-1933.md`,
2 of 2 pages clean. **Ran for real** in the pane on a copy of Kenil's world: three lines typed
with Shift+Enter grew the box to three, the send button lit; in the 380 px panel on the
Nutrition page the box, the plus, the mic and the thread's row fit. The app is not yet rebuilt
with this slice.
