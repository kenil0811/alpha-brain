# People for real, and the Mac's contacts (P8–P9)

*Agreed by Kenil the same evening with the recommendation on all seven questions (Q97): built in the order P8a, P9, P8b, the same evening (`../log/2026-10-19-p8-p9-people-and-contacts.md`). Where the build differs: possible same people are also looked for after every write to a people table, not only after a sync; the `people` view replaces a broken one.*

*A proposal, 19 October 2026, for Kenil's yes before any code ("ok lets do p8,p9"). These are
P8 and P9 of `requirements/alpha-fit-four-projects.md`, the platform half of Vikas's Network
(`requirements/AB-four-projects-scope.md` §5). Nothing here is per use case: no word of networks,
brokers or circles reaches the platform. The Network module itself (its tables, circles, the
Keeper and Follow-up agents) is built after, in the app, as agreed ("platform first").*

## What this is for

Everyone the person knows should be one person in Alpha, however many places they come from.
Today:

1. **People are entities, joined by hard keys** (an email, a phone, a profile address): the same
   key from two sources is one entity, and a name alone never merges. That rule is right and
   stays.
2. **But few things make people.** Calendar attendees do (by email). A table can say its rows
   are people, but by **one** field, and only an email or a web address (`collections.py`
   `hard_key`). A phone is kept as its digits, so `+44 7700 900123` and `07700 900123` are two
   people.
3. **Nothing links a person to their organisation**, and nothing proposes "these two may be the
   same". The People page offers a same-name merge by hand, with no Unmerge (the core has one,
   no route).
4. **Nothing says when the person last talked to someone.** Meetings are kept with their
   attendees; emails are rows a reader writes; neither is counted per person.
5. **No contacts are read.** The Mac's Contacts (which carry the iPhone's through iCloud) and
   a `.vcf` export are both absent.

Your world today has no person entities, no calendar events and no table whose rows are people,
so P9's contacts are what P8 first works on.

## P8: people for real

1. **A table's rows are people by any of their keys.**
   - `world_shape` takes `rows_are` with several identity fields (email, phone, profile
     address), not one.
   - A row links to the person any of its keys names. Two keys naming two people never merge
     them silently: the row links to the first, and the pair is proposed (item 3).
   - Declaring it links the rows already there, in one pass by code.
   - A reader's table is declared the same way, so a LinkedIn connections table becomes people
     (fit doc: "the 1,551 rows become people").
2. **Phones in one form.** Every phone is read into E.164 by `phonenumbers` (a new dependency),
   so `07700 900123` and `+44 7700 900123` are one key. A number without its country takes a
   default country (question 2). One that still can't be read is kept as written and never
   merges.
3. **"These may be the same" is proposed, never applied.**
   - After every read (a sync, an import, a connector), code looks for pairs:
     - the same name;
     - the same name at the same organisation;
     - the same email before the `@` at another domain.
   - They wait on **one card per batch** ("8 pairs may be the same people"). Each pair is side
     by side with its keys, sources and organisation, with **Merge** and **Keep apart**, and
     **Merge all with the same name and organisation**.
   - A Keep apart is remembered, so the pair never comes back. Built on P3's cards and Decisions.
4. **Unmerge, in the window.** A person's page lists what was merged into them, with where each
   came from, and Unmerge on each. Every merge and unmerge is journaled.
5. **Organisations.**
   - **By email domain** (a hard key): a person at `restopros.com` belongs to that domain's
     organisation, made if missing (question 3).
     - The organisation is named by its domain until a source names it.
     - Generic domains (gmail.com, outlook.com, icloud.com, …) never make one; the list lives
       in `config/`.
   - **By a company name** (a contact's company, LinkedIn's company field): question 4.
   - A person's organisation changing (a new domain, a new company) closes the old link and
     keeps it in their history.
6. **Interactions: last contact and how often, in plain numbers.**
   - Computed by code from:
     - calendar meetings with the person among the attendees;
     - the rows of any table that says its rows are **interactions**, with its person field
       and date field (for example a Gmail reader's messages table: from, to, date, subject;
       question 6);
     - and, with a direction field, who reached out first.
   - Shown as "12 emails and 3 meetings in 90 days, last on 2 Oct". Every count opens the rows
     it came from. No score.
7. **The person's page and the list.**
   - **The page** (People & Companies) gains:
     - their keys;
     - their organisation;
     - the rows that are them in every table;
     - the interactions timeline;
     - what was merged into them, with Unmerge.
   - **The list** loses its cap of 500, in one query (a fix from Vikas's PR #10, ported, not
     merged), and gains columns: organisation, last contact, in 90 days, sources.
8. **The model reads them in SQL.** `world_query` gains `people`, `organisations` and
   `interactions` views, so "who at RestoPros did I last email?" is a query, not a recollection.
9. **Removal.**
   - Each person keeps where they came from (`entity_sources`).
   - Removing a source (a disconnected Contacts, a removed table) removes the people only it
     brought; a merged person keeps the rest.
   - `purge.py` covers the new tables; the journal is never touched.

## P9: the Mac's contacts

1. **macOS Contacts**, read through the Mac's own Contacts framework (`pyobjc-framework-Contacts`,
   a new dependency of the same family as the EventKit we use for the calendar).
   - Connected in Settings › Connections. macOS asks once; Alpha never sees a password.
   - It is read-only, on this Mac, nothing sent anywhere.
   - Each contact becomes a person:
     - keyed by their emails and phones;
     - with their organisation, title and profile addresses;
     - with the contact's source kept.
   - Read again on open and daily, like the calendar. A contact changed on the Mac updates the
     person; one deleted there takes away what only it brought.
2. **A `.vcf` file** (an iPhone, Google or Outlook export) dropped in the window or a module:
   - read by code (vCard 3 and 4: name, emails, phones, organisation, title, addresses);
   - into the same people as the Mac's contacts;
   - said in one line ("Read 412 contacts: 380 new people, 32 already known").
3. **Later, not now:** Google Contacts by its API and Outlook or IMAP need sign-in by OAuth: the
   connector slot (P11).
4. **Where contacts land:** as people (entities), on the People page and in `world_query`'s
   `people` view, not as a table of their own (question 5). The Network module, when you build
   it, makes its People table from them, with its own fields (circles and the rest).

## Order and size

P8 items 1–5 (keys, phones, proposals, Unmerge, organisations), then P9 (the Mac's contacts and
`.vcf`), then P8 items 6–9 (interactions, the page, the views, removal). Each part is its own
commits: the core, then the window.

| Part | Days | What |
|---|---|---|
| **P8a** | 2 | several keys per table, E.164, soft pairs on one card with Merge / Keep apart, Unmerge, organisations by domain |
| **P9** | 1.5 | macOS Contacts as a connection, `.vcf` read by code |
| **P8b** | 2 | interactions and their numbers, the person's page and the list, the views, sources and removal |

## Journeys

On a fresh world, with the real model:
- **`people_from_two_sources`** (P8, P9):
  - Setup: a `.vcf` of six people, and a table of LinkedIn-style rows (profile address and
    email) declared as people.
  - The same person by email in both: one person.
  - Two phone formats: one person.
  - Two "Sara Ramos" with no shared key: proposed on one card, not merged; Keep apart
    remembered.
  - A colleague's domain: one organisation.
- **`when_did_we_last_talk`** (P8b):
  - Setup: a seeded meeting and a messages table declared as interactions.
  - The person asks "when did I last talk to Sara, and how often lately?".
  - The answer gives the date and the counts from the interactions, and names their source.

And one on your say only, since it reads your real Contacts:
- **`contacts_from_the_mac`:**
  - your contacts read in;
  - a hand-checked sample of their merges.

## Acceptance

Kenil, in his app:
- Contacts connected (the Mac's prompt), and the People page filled.
- A person who is in two sources shows as one, with both sources.
- A card of possible same people decided, one Keep apart included.
- An organisation found by its domain.
- One Unmerge.
- Later, with the calendar connected: a person's last meeting on their page.

## Questions for Kenil

1. **The order:** P8a, then P9, then P8b? I'd take that order: the keys and merges first, then
   your contacts as the first real source to see them on, then what's built on top.
2. **A phone with no country code: which country?** Your Mac's region is Singapore (`en_SG`)
   while its clock is on UK time, so "the Mac's region" would read `07700 900123` as a
   Singapore number. I'd use no setting: the country most of your numbers that do carry a code
   are in, read from the contacts themselves, falling back to the Mac's region.
   A number still ambiguous is kept as written and never merges. If
   you'd rather fix it by hand, it becomes one setting with its origin (you asked to be asked
   before any setting).
3. **Organisations by email domain:** made and linked automatically, as a hard key, with
   generic domains excluded? I'd say yes. The rule is the same as for people, and Unmerge or
   removal undoes a wrong one.
4. **A company name with no domain** (a contact's "Acme Ltd"): the same exact name is the same
   organisation, or only proposed? I'd make the exact same name (ignoring case) one
   organisation. People never merge by name. Organisations rarely share a name within one
   person's network, and a wrong one is one Unmerge.
5. **Contacts as people (entities), not a table:** the Network module makes its People table
   from them later? I'd say yes. It keeps one list of people across every source, and the
   module adds what is the person's own.
6. **Interactions from any table** that says its rows are interactions (a person field and a
   date): is that the shape? I'd say yes. It is how email comes in today (a reader's rows), and
   it works the same for calls or WhatsApp exports later.
7. **Two new dependencies:** `phonenumbers` (Google's phone-number rules, read-only data) and
   `pyobjc-framework-Contacts` (the Mac's Contacts, like EventKit). I'd take both: phone parsing
   is the kind of thing not to write by hand, and the Contacts framework is the only way to the
   Mac's contacts. The `.vcf` reader I'd write in code (vCard is small), tested on real exports.
