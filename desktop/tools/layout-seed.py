"""A small world for the layout run: a project with a table, a person, a question, a proposal,
a fact, a goal, a note, an automation, a folder, a reader and a standing permission, so every
page (and each Intelligence item's own page) shows its full states, not only empty ones. Writes
into ALPHA_HOME (the layout run passes a scratch folder); never into the person's own world."""

import json
import os
import sys
from pathlib import Path

from alpha.mcp.tools import Tools
from alpha.world.world import World

if not os.environ.get("ALPHA_HOME"):
    sys.exit("Set ALPHA_HOME to a scratch folder; the layout seed never touches a real world.")
world = World()
# Lasting things are made only in an approved plan's build, so the seed runs inside one.
plan = world.plans.propose("Layout seed", "What the layout run needs.")
world.plans.approve(plan["id"], "yes")
build = world.modules.open_thread("Layout seed", "build")
world.plans.start(plan["id"], build["id"])
t = Tools(world, turn="j_seed", thread=build["id"])
project = t.module_create("Job Search", "An offer by December")
t.collection_create("openings", "Openings", [
    {"name": "title", "kind": "text"}, {"name": "company", "kind": "text"},
    {"name": "fit", "kind": "number"},
    {"name": "status", "kind": "status", "choices": ["new", "applied"]}], module="Job Search")
for title, company, fit in [("Backend Engineer", "Lumen", 88), ("Platform Lead", "Northwind", 74),
                            ("Staff Engineer, Developer Experience", "Contoso", 61)]:
    t.records_add("openings", {"title": title, "company": company, "fit": fit, "status": "new"},
                  source="stated")
priya = t.entity_resolve("person", "Priya Raman", {"email": "priya@lumen.example"})
world.journal.append("saw", "Email from Priya about Friday", entity_ids=[priya["entity"]["id"]],
                     source="connector:mail")
world.journal.append("failed", "Couldn't read calendar (macos): EventKit stopped answering",
                     source="connector:calendar")
t.ask_person("What salary floor should I filter by?")
t.propose("Raise protein to 130 g on training days", "Four workouts this week")
fact = t.fact_record("person", "prefers", "mornings")
goal = t.goal_set("A backend role by December", module="Job Search")
note = t.note_write("person", "Profile", "Backend engineer looking for a platform role.")
auto = t.automation_create("Every morning at 08:00, read the openings and tell you what's new",
                           "daily 08:00", procedure="Read the openings and report new ones.",
                           module="Job Search")
folder = Path(os.environ["ALPHA_HOME"]) / "Job search"
folder.mkdir(exist_ok=True)
conn = t.folder_watch(str(folder))
reader = world.readers.save("lumen_jobs", site="lumen.example", url="https://lumen.example/jobs",
                            script="return []", description="Open roles on Lumen's careers page",
                            to_end=False, count=3)
perm = world.permissions.grant(sentence="Draft replies to recruiters in your mail",
                               procedure="mail_draft", effect="prepare")
# One line the layout run reads: the ids its item pages open.
print("SEED " + json.dumps({"project": project["id"], "fact": fact["id"], "goal": goal["id"],
                            "note": note["id"], "automation": auto["id"],
                            "connection": conn["connection"], "reader": reader["name"],
                            "permission": perm["id"], "entity": priya["entity"]["id"]}))
world.close()
