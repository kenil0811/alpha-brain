# Engine reach: section A's acceptance (20 Oct 2026, afternoon)

Kenil, after S5 was committed (`15eee6d`): "Yes, run section A's acceptance, including
gmail_last_week and sync_from_words in my accounts, and tell me the four sentences to type."
Then, with two of his four sentences tried: "Write up section A's acceptance as it is, with the
CSV and JSON sentences and LinkedIn left open."

What Q98 set as the acceptance:
- the five first-day sentences, `sync_from_words` and `watch_from_words` green, with subagents
  allowed;
- the three new journeys green (a listed fetch, a card for an unlisted host, a page button);
- his four sentences in the app;
- input tokens per turn and time to first words, measured before S1 and after S5 on the same
  journeys.

## The journeys, at `9ae749c`

Each ran alone on a fresh world, or on a SQLite-backup copy of his world (`gmail_last_week`),
in a scratch folder of its own. Subagents were allowed throughout: they have been a turn's own
tools since S2.

- **`gmail_last_week`** passed (`docs/journeys/2026-10-20-1256.md`). It read his signed-in Gmail
  and named Vikas's one email of last week: the "Legal Platform" Drive share of 14 Oct.
- **`sync_from_words`** failed (`-1258.md`), and not on section A.
  - Alpha's browser holds a sign-in for Google only. LinkedIn's went with the 18 Oct reset.
  - Alpha said it couldn't read the connections yet, and asked on a card to open a sign-in
    window. So no table and no rows were made, and its checks failed.
  - It stays open until he signs in to LinkedIn in Alpha's own browser.
- **`track_then_log`** (`-1259.md`), **`watch_from_words`** (`-1301.md`) and **`reminder_fires`**
  (`-1303.md`) passed. They had also passed at S5 (`-1242.md`, `-1244.md`, `-1247.md`).
- **The three new journeys:**
  - `script_reads_a_listed_host` passed (`-1305.md`): 10 users with the URL as their source,
    read by a Python script in the shell;
  - `script_asks_for_a_host` passed (`-1306.md`): the card "Let scripts in Lists reach
    jsonplaceholder.typicode.com?", the suite's yes listing it in Lists' module.yaml, and the
    todo's title from the same turn;
  - `page_button_changes_a_row` passed (`-1307.md`): the press "mark Harbour Car Wash as
    passed" changed the row as a turn ("Its status was Looking before").
- **In all:** seven of the eight passed. The one failure was a missing sign-in, not a
  regression.

## His four sentences in the app

From his journal (read-only):

1. **"what did Vikas email me about last week"** (Home, 13:00 BST) passed. The answer:
   - Vikas Badami's one email of last week, the "Legal Platform" Drive share on Wed 14 Oct;
   - a GitHub invite on 8 Oct;
   - that everything else mentioning Vikas came from Kenil;
   - that his contact "Vikas 114" has no email, so it couldn't say they're the same person.

   He answered "yes they are" in Home. **Home's router asked "Which is this about?"** instead
   of taking it as the answer: Alpha's question was in its prose, not on a card, so the
   structure rule ("a short answer when one item asked") did not see it. That's routing
   (section C), not section A. After he picked, the contact became Vikas Badami with that
   email.
2. **The two-site watch** ("watch We Work Remotely and Remote OK for back-end roles, and tell me
   when new ones appear", 13:01) passed:
   - a reader per site (6 roles and 50);
   - a Job Search module with a Remote back-end jobs table holding 56 roles;
   - an agent, Job Watcher, every 6 hours.

   Its answer said what it made.
3. **The CSV in his granted folder:** not tried. Left open.
4. **A JSON fetch by a script, with the host's card answered once:** not tried. Left open.
   `script_asks_for_a_host` is its proof on a fresh world.

## Measured: input tokens per turn and first words

- **Input** is everything the model read: the fresh input plus what was read from and written
  to the cache.
- **The columns:**
  - "Before S1" is S1's spike with tool search off (19 Oct). It's the nearest measure to
    before S1: no turn recorded its tokens until S1, and S1's other changes were already in.
    Only `track_then_log` was measured then.
  - "After S1" is B8's before run (after S1, before section B).
  - "After S5" is two runs at S5's code, with their report names in brackets: `-1242`,
    `-1244` and `-1247` at S5's build, then the acceptance runs.

| Journey, turn | Before S1 | After S1 | After S5 |
|---|---|---|---|
| `track_then_log` 1 | 111,744 · 8.6 s | 76,996 · 11.9 s | 99,783 · 15.6 s (`-1242`); 99,831 · 4.9 s (`-1259`) |
| `track_then_log` 2 | 111,796 · 11.9 s | 75,915 · 10.1 s | 130,604 · 11.7 s (`-1242`); 130,737 · 11.9 s (`-1259`) |
| `reminder_fires` 1 | — | 79,358 · 6.8 s | 98,807 · 4.3 s (`-1247`); 96,320 · 5.4 s (`-1303`) |
| `watch_from_words` 1 | — | 321,875 · 35.5 s | 456,562 · 35.4 s (`-1244`); 344,281 · 71.3 s (`-1301`) |
| `gmail_last_week` 1 | — | — | 141,989 · 25.9 s (`-1256`) |

- **Against before S1**, `track_then_log`'s first turn reads 11% less and its second 17% more.
- **Against after S1**, every turn reads more:
  - `track_then_log` +30% and +72%;
  - `reminder_fires` +21% to +24%;
  - `watch_from_words` +7% to +42%.

  B8 found the cause of most of it: the model looks up what the pre-pack used to hand it.
  How much S2–S4's new hands and words add is not measured.
- **Within a session**, a later turn writes less to the cache: `track_then_log`'s second turn
  made 8,372, against 14,450 after S1.
- **First words** vary as much between two runs of the same turn as between before and after:
  4.9 s against 15.6 s, and 71.3 s against 35.4 s.

**So:** section A gave the model its reach (subagents, writes and network by the grants, skills
loaded by the SDK, page buttons, agents that remember), not fewer tokens or faster first words.
B8's proposals for speed stand: the session's module's fields in the start layer, and contact
numbers per named person.

## Open after section A

- His CSV and JSON sentences in the app.
- LinkedIn signed in in Alpha's own browser, then `sync_from_words` again.
- Routing (section C): a plain answer in Home to a question Alpha asked in prose is asked
  "Which is this about?". Section C is still to come from him.
- The stale journeys to rework or retire (the proposal card of 20 Oct).
