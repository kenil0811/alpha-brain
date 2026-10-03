# The table views, stage three: relations followed, and the form view (3 October 2026, evening)

The two leftovers of the table views from pull request #3's port (`2026-10-03-table-views-1.md`),
on main's shapes.

**A relation is a link with a way back.** A relation field holds the related record's id
(`advisory_financials.client` → a row of `advisory_clients`); the page used to show the id in a
pill. Now:

- The core resolves the ids to titles on the table route (`relations: {field: {id: title}}`,
  `relation_titles` in `api/server.py`), and serves one record with its table at
  `GET /api/tables/{name}/records/{rid}` for a relation followed into another table. Relations
  to a person or an organisation (entities) are left as they are for now: those open on the
  People page, which has its own address.
- The pill shows the title and opens the related record **in the same drawer, on a stack**:
  the drawer shows the client with its table's name under the title, every field editable as
  on its own page, and Back returns to where the person came from (the row they had open, or
  the table). A relation inside the related record pushes another; Close clears the stack.
  Remove is not offered on a related record (it belongs to its own table's page). Pull request
  #3 had a full record page with a back stack; a drawer that stacks keeps the person on the
  table they were reading.

**The form view.** A view like the others ("Form" in the view switch, kept per table like the
rest): one row at a time, every field as a form, Previous and Next over every row the search and
the filters leave, in the table's order, with "n of N". For going through rows one by one,
checking or filling each. It is the drawer's body (`RecordFields`, now shared) in the page.

**What ran.** In the browser pane against a check core on a copy of Kenil's world: Advisory
Financials showed "RestoPros (St. Louis, MO)" in its client column instead of `r_c2111690635f`;
clicking it opened the client in the drawer under "Advisory Clients" with Industry, Added and
Notes, and "Back to Advisory Financials" returned; the Form view walked the 26 financials rows
with their client pill live in it. Tests: one in the core (titles resolved, a missing target
left out, the record route, a missing record a plain 400), two in the desktop (the pill opens
the related record and Back returns; the form view's next and previous); 47 desktop tests,
typecheck clean; `just check-desktop m`: the six module pages clean at every size
(`docs/checks/2026-10-03-1651.md`).
