# Replies rendered the same everywhere (3 October 2026, night)

Kenil, from the companion: "needs to do better with text formatting". Its panel showed a reply
as raw text: `**Sania Hussain**` with the stars, "- " items run together on one line, no
paragraphs. The main panel had its own light-Markdown renderer; the companion printed the text.

**One renderer** (`ui/Rich.tsx`), used by the panel and the companion: paragraphs; "- " and
"1." lists, also when they follow a line of text the way a model writes them ("…named Sania:"
then the items), which the old renderer only took as a whole block; headings as bold lines;
**bold** and `code`. Nothing else: the rest of a reply is text. Styles for lists and code in
both places.

**Checked.** A test renders a reply with a list after a colon, bold, code, numbered steps and a
heading, and no stars or hashes survive. The companion window served to the browser pane from a
copy of Kenil's world seeded with the Sania reply: the two names as a bulleted list in bold,
the paragraphs apart. 77 desktop tests; the app rebuilt and restarted.
