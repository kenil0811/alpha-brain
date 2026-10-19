# P8 and P9: people for real, and the Mac's contacts (19 Oct 2026, evening)

Kenil: "ok lets do p8,p9". The proposal was written first
(`design/people-and-contacts-proposal.md`), and his yes came with the recommendation on all seven
questions: "build P8a, then P9, then P8b" (Q97). Nothing here is committed.

## What was there

- Hard keys already merged people with no model call: an email, a URL, a phone kept as its
  digits.
- A table could say its rows were people, by one field, email or URL only.
- Nothing linked a person to an organisation.
- The People page offered a same-name merge by hand. The core had an unmerge with no route.
- The list stopped at 500.
- The `people` view `world_query` offered named columns that don't exist (`e.name`, `k.kind`),
  so the model could never read people in SQL. Found by trying it on a scratch world.
- His world has no person entities, no calendar events and no table of people.

## P8a: keys, phones, organisations, pairs, Unmerge

- **Phones in one form** (`world/phones.py`, `phonenumbers`):
  - every phone is kept as E.164;
  - a number without its country is read as the country most of the kept numbers with a code
    are in, else the Mac's region (no setting, Q97: his Mac says Singapore while its clock is on
    UK time);
  - a number that can't be read is kept as written and never merges.
  - A country is known from the code alone. The first try asked which region a number is
    valid in, and the UK's 07700 900xxx test numbers are valid nowhere.
  - Phones kept before are read again into E.164 once, on open.
- **A table's rows are people by any of their keys.**
  - `world_shape` / `collection_identify` take several identity fields (email, phone,
    profile), and `organisation_field`.
  - A key in a field said to identify the row may be a phone.
  - Rows already there are linked when the table is declared.
  - A row whose keys name two people already apart never merges them: it links to the first,
    and the pair is noted.
- **Organisations** (`entity_links`, kind `member_of`):
  - by email domain, a hard key, with mail services (gmail.com and the like) excluded, in
    code;
  - by the exact company name, case aside (an `orgname` key, Q97);
  - a company and the first work domain of the same person are one organisation, named by the
    company. One named only after its domain takes the name a source gives it, keeping the
    guess as an alias.
  - Organisations kept before get their name key once, on open.
  - A source's link that it no longer gives ends, kept with its dates.
- **Who may be the same is proposed, never applied** (`world/people.py`, the `maybe_same` table).
  - After every write to a people table, every reader's run, import, contacts read and staged
    landing, code looks for:
    - the same name (two words or more, for a person; a first name alone is no evidence);
    - the same name at the same organisation;
    - the same email name at another domain (not "info", "sales" and the like);
    - a row or contact naming two people at once.
  - The scheduler's tick does the same when people changed.
  - The pairs wait on one card per batch, a new card kind `pairs`: "2 pairs that may be the
    same person or company". Each pair is side by side with its keys, organisations and
    sources, with Merge and Keep apart, plus "Merge all N with the same name and organisation"
    when there are several.
  - A whole No keeps them all apart. A whole yes is refused: two people are never merged
    without a word on them.
  - A decided pair never comes back.
- **Unmerge** (`POST /api/entities/{id}/unmerge`):
  - The one merged in stands alone again, with its own keys. The one it was merged into gives
    them back and drops the alias the merge brought; before, it kept both.
  - The two are kept apart from then on.
  - The journal says it with a way to tell same-named people apart ("You said Sara Ramos
    (sara@restopros.com) is not Sara Ramos (sara.ramos@gmail.com).").
- **A name that is only a key gives way.** Someone first seen by their address (an email row)
  takes the name a contact gives them. An address, a number or a link is never kept as an alias.

## P9: the Mac's contacts and a `.vcf`

- **macOS Contacts** (`connectors/contacts.py`, `pyobjc-framework-Contacts`):
  - the Mac's own Contacts framework, read-only, on this Mac;
  - connected in Intelligence › Connections ("Your contacts", beside the calendar). macOS asks
    once; the app's Info.plist now says why (`NSContactsUsageDescription`), as it does for
    Calendars;
  - read on open and once a day (`limits.toml [contacts]`, with its why).
  - Each contact becomes a person: keyed by its emails, phones and profile addresses, with its
    company, and what the Mac said kept beside them (`entity_sources`: name, organisation,
    title, city and country).
  - A contact deleted on the Mac takes away the person only it brought, and the organisation
    made only for them. One known another way stays.
- **A `.vcf`** (iPhone, Google, Outlook exports) is read by code:
  - vCard 3 and 4, and the 2.1 old phones wrote, with quoted-printable and folded lines;
  - `item1.EMAIL`, `tel:` and `mailto:` values, a company card (`KIND:org`);
  - dropped on a module page, it is read into people with no model turn and said in one line;
  - `world_file import` of a kept `.vcf` does the same for the model.
- **Removal.** Removing the contacts connection says what goes ("what Alpha read from 412
  contacts") and takes the people only the Mac's contacts brought.

## P8b: interactions, the views, removal, the page

- **Interactions.**
  - A table can say its rows are interactions (`rows_are: "interaction"`), with the person's
    field(s), `date_field`, and optionally `direction_field` ("sent" / "received").
  - Each row links to the person it was with.
- **The views, one definition for the model and the window** (`world/queries.py`):
  - `entity_root` follows merges;
  - `interactions` holds every meeting with the person among its attendees and every row of an
    interaction table;
  - `people` (emails, phones, profiles, organisations, sources, `last_contact`,
    `in_90_days`) and `organisations` (domains, people) replace the broken view;
  - `world_query`'s words name them.
- **The window reads the same views.**
  - The People list is one query, with no cap (PR #10's fix, ported, not merged). It shows
    each person's organisations and "2 in 90 days · last 17 Oct", and an organisation's people.
  - A person's page shows:
    - Belongs to: organisations, how they were linked, ended ones faint;
    - where they came from (sources and the tables they are rows of);
    - what was merged in, with Unmerge;
    - Contact: "2 in Emails, 1 meeting in the last 90 days · last on 17 Oct · you started 1,
      they started 1", and the recent ones listed. No score.
- **In front of the model.** The card of a person a sentence names now carries their
  organisation and the same contact numbers. Found by the journey below: the model answered
  from journal lines and missed the meeting.
- **Removal.** Deleting a module takes the people only its tables brought (an entity made by a
  row, with no other source, row, meeting, fact or page). `purge.py` covers `entity_links`,
  `entity_sources` and `maybe_same`.

## What ran

- **Tests:**
  - `test_people.py` (P8a, 7);
  - `test_contacts.py` (P9, 5);
  - `test_people_contact.py` (P8b, 6);
  - desktop: the pairs card (two), a person's page (one).
  - Core 420 passed, desktop 238 (1 skipped); lint and types clean.
- **Journeys with the real model**, each alone on a fresh world:
  - `people_from_two_sources` and `when_did_we_last_talk` both failed first
    (`docs/journeys/2026-10-19-1747.md`, `-1749.md`):
    - no pairs were proposed after the model wrote the table's rows (only the tick looked);
    - the model answered "when did we last talk" from the journal lines in its context, and
      said it had no meetings.

    Both were fixed by mechanism (above): pairs looked for after every write to a people
    table, and the contact numbers on the person's card.
  - `people_from_two_sources` then passed (`-1753.md`):
    - Anna Lee, one person from the `.vcf` and the connections table;
    - Ben, one person from two ways of writing his number;
    - the two Sara Ramos waiting on one card, not merged;
    - RestoPros with Anna, Dan and Sara.
  - `when_did_we_last_talk`:
    - With the numbers on the card, the answer was right ("last 17 Oct, 3 emails and the 9 Oct
      call in 90 days", who started what, no score). The judge still failed it twice
      (`-1755.md`, `-1757.md`): first on email details that were in the search's matches given
      with the sentence, then on the call's date the model had read with `world_query`. A SQL
      read leaves no journal line, and the judge only saw the journal and the person's card.
    - The suite's judge now also sees the matches, and a journey can state what is true in the
      world it set up (`facts`, with today's date). The answer is judged against that, not
      against a journal that never records reads.
    - One rerun reused the same minute's fresh world and broke on its own setup (the stamp is
      per minute).
    - Then passed (`-1759.md`).
  - `contacts_from_the_mac` is written and reads his real contacts: run only on his say.
- **In the browser pane** (Chromium) on a copy of his world made with SQLite's backup, seeded
  with the journey's `.vcf`, a connections table and two emails:
  - Home's card showed the two Sara Ramos side by side, with organisations, addresses and
    sources;
  - the People list showed Anna "RestoPros · … · 2 in 90 days · last 17 Oct", Ben as one person
    from two ways of writing his number, and RestoPros with 3 people;
  - Anna's page showed Belongs to, Contact with both emails, and where she came from;
  - Merge made one Sara with both organisations, and Unmerge made two again, each with her
    own.
  - Two things fixed from it:
    - the email address had become Anna's alias;
    - organisation names were joined without a space.
  - Not yet seen in the WebKit app: the app needs a rebuild for the Contacts prompt's words.

## Numbers (`just stats`, 19 Oct)

- 420 core tests, 238 desktop tests (1 skipped);
- lint and types clean;
- 70 operations behind the hands;
- 46 journeys defined;
- core 28,823 lines, tests 10,932, desktop 21,476;
- 293 commits. P8 and P9 are uncommitted.

## Left

- **A rebuild and a restart on his yes**, then his acceptance in the app:
  - Contacts connected (the Mac's prompt);
  - the People page filled;
  - a person from two sources as one;
  - a pairs card decided, with one Keep apart;
  - an organisation by its domain;
  - one Unmerge.
- **`contacts_from_the_mac`** on his say.
- **The commits**, on his word.
- **Not built:** Google Contacts and Outlook or IMAP (OAuth, the connector slot, P11), and a
  person's interactions from mail (a Gmail reader's table declared as interactions is the way;
  none exists in his world yet).

## Kenil's run in his app (19 Oct, 18:07 BST)

After the restart on his yes, he connected Contacts in Intelligence › Connections. Read back
from his world:
- **The read:** 746 contacts became 651 people and 18 organisations, with 21 links of a
  person to their organisation.
- **Phones:** 619 were read as India (+91) and 27 as the UK (+44). The country came from his
  own numbers, though the Mac's region is Singapore. 13 that couldn't be read were kept as
  written and never merge.
- **The card:** "15 pairs that may be the same person or company":
  - 10 because one contact named both (a card whose phones already belonged to two people:
    "Keyur", "Kajal");
  - 4 by the same name ("Vinod Sir", "Rahul Nitc");
  - 1 by the same email name at another domain: `jaybluejhm@gmail.com` and the typo
    `jaybluejhm@gamil.com`.
- **His decision:** he merged all 15 (the journal says each, with a number or address to tell
  them apart).
- **Not tried in the app:** a Keep apart and an Unmerge (the tests cover both; the browser pane
  saw them work).
- **His word:** "ok looks good". P8 and P9 accepted in his app.

## Committed

On Kenil's word ("Yes, commit P8–P9 with their docs to main"): `e340f78`, all checks clean
(420 core, 238 desktop, lint and types).
