"""A small world for the layout run: a project with a table, a person, a question, a proposal,
a fact and a pending action, so every page shows its full states, not only empty ones. Writes
into ALPHA_HOME (the layout run passes a scratch folder); never into the person's own world."""

import os
import sys

from alpha.mcp.tools import Tools
from alpha.world.actions import Actions
from alpha.world.world import World

if not os.environ.get("ALPHA_HOME"):
    sys.exit("Set ALPHA_HOME to a scratch folder; the layout seed never touches a real world.")
world = World()
t = Tools(world, turn="j_seed")
project = t.module_create("Job Search", "An offer by December")
t.collection_create("openings", "Openings", [
    {"name": "title", "kind": "text"}, {"name": "company", "kind": "text"},
    {"name": "fit", "kind": "number"},
    {"name": "status", "kind": "status", "choices": ["new", "applied"]}], module="Job Search")
for title, company, fit in [("Backend Engineer", "Lumen", 88), ("Platform Lead", "Northwind", 74),
                            ("Staff Engineer, Developer Experience", "Contoso", 61)]:
    t.records_add("openings", {"title": title, "company": company, "fit": fit, "status": "new"})
priya = t.entity_resolve("person", "Priya Raman", {"email": "priya@lumen.example"})
world.journal.append("saw", "Email from Priya about Friday", entity_ids=[priya["entity"]["id"]],
                     source="connector:mail")
world.journal.append("failed", "Couldn't read calendar (macos): EventKit stopped answering",
                     source="connector:calendar")
t.ask_person("What salary floor should I filter by?")
t.propose("Raise protein to 130 g on training days", "Four workouts this week")
t.fact_record("person", "prefers", "mornings")
Actions(world).propose("save_document", "Save the thank-you note to Priya in Notes",
                       {"folder": "/tmp", "name": "thanks.md", "text": "Thank you."},
                       connector="files")
print(project["id"])
world.close()
