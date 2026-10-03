# A graph of the person's world: proposal (3 October 2026, for Kenil to decide)

Idea 19 of the pull request #3 port was a knowledge graph. Kenil: "I would want a graph,
that's cool, but we do need to think on how to best do it, in a good and meaningful way." This
is that thinking, short, with what the world holds today measured first.

## What there is to draw, today (Kenil's world, read on 3 Oct)

| | |
|---|---|
| Entities | 13 people, 7 documents (the 1,551 LinkedIn connections are rows, not people) |
| Facts | 6, all about Kenil himself (age, height, goals) |
| Journal entries naming an entity | 7 of 1,044 |
| Pages | 6, one per module; none per person yet |
| Modules, tables, rows | 6, 13, 2,552 |
| Skills, automations, connections | 28, 5, 13 conversations |

A graph of *people and what Alpha knows about them* drawn now would be twenty dots and seven
lines. It would look like a graph and mean nothing. The thing that would make it meaningful is
pending item 6 in `STATE.md`: readers declare their rows as people, a pass links the rows that
exist, and noticing names entities in what Alpha reads, not only in what the person says.

## What a graph is for here

Not a picture of the database. A way to see, in one glance, **what connects to what and
how Alpha knows it**, and to go there: every node opens its page (a person, a module, a
table, a skill, an automation, a document), every edge says where it came from (a row in
which table, a journal entry on which day, a fact with its source). A graph that cannot be
clicked through, or whose edges have no provenance, is decoration. That rules out anything
drawn from embeddings or "similarity": edges are facts with a source, as everything is here
(design §7).

## Three ways to do it

**A. A graph of entities now.** Twenty nodes, seven edges. Not worth a page. Not proposed.

**B. A graph of the person's world, after people-for-real** (recommended, in its turn).
Nodes: people and organisations (entities), documents, modules and their tables, pages.
Edges, each with a count and a source: *named in* (journal entries that mention the entity,
by day), *is a row of* (the entity's rows in a table: the connection in `linkedin_connections`,
the sender in `vikas_badami_emails`), *attached* (a document that came from or went to a
person), *says* (a fact: subject → value, with its source), *about* (a page about the entity).
Opening a node opens its page; hovering an edge shows its source; a time slider hides what
was not known by a date (the facts and the journal are bi-temporal already). Built after
pending item 6, because that is what gives it its nodes: the day the connections become
people, a graph of 1,500 people with "who emailed whom" and "who sits in which table" is
something Kenil would use (who do I know at X, through whom).

**C. A map of Alpha's own work, now** (small; meaningful today). Nodes: modules, tables,
skills, automations, connections, documents' folders. Edges: *reads into* (a read skill → its
table), *runs* (an automation → the skills it runs, in order), *signed in at* (a connection → the
skills on its site), *in* (a table → its module), *watched* (a folder → its table). This is the
structure the Intelligence section lists in four tabs; drawn, it shows at once which
automation feeds which table through which skills, what is broken (a skill with a problem in
red, as on its card) and what nothing uses. Sixty nodes with real edges in Kenil's world today.
It is the smaller piece and it would live as a fifth view in Intelligence ("Map"), not a page
of its own.

## How it would be built (either B or C)

- **Core:** one route, `GET /api/graph?kind=work|world`, computing nodes and edges from the
  tables with counts and sources; nothing stored, nothing new in the world. Fifty lines per
  kind; a test per edge kind.
- **Window:** one `Graph` component: a force layout run in a Web Worker so the page never
  stalls, drawn in SVG (nodes are the kit's cards in miniature, edges lines with the count),
  pan and zoom, click to open, hover for the source. A worker is the one real piece of
  engineering; the layout itself is `d3-force` (30 KB, the standard) unless we would rather
  write a 150-line force layout of our own to keep the dependency list as it is. I would take
  `d3-force`.
- **Rules:** nothing per use case (edge kinds are the world's own kinds, not LinkedIn's or
  Gmail's); no caps (a graph with 1,500 people draws 1,500 people, with the layout in the
  worker and the labels appearing on zoom); every edge with its provenance.

## The question for Kenil

Which first: C now (a map of Alpha's work in Intelligence, about two sessions), or wait for
people-for-real and build B (the graph of the world, the one worth the word)? My
recommendation: C now, because it is honest with today's data and most of its code (the
route shape, the worker, the drawing) is B's code too; then B as soon as pending item 6 lands.
