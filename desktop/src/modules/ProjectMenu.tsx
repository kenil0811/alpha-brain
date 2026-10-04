/**
 * A project's menu, the same on the rail's project row (its ⋯ or a right-click) and on the
 * project page. Adding a sub project and taking one out run on the core's module routes (make,
 * move); renaming, the icon, the goal, export and delete wait for the core's project routes
 * (PATCH/DELETE /api/modules/{ref}, export) and say so.
 */
import { useState, type ReactNode } from "react";
import type { Client, ModuleCard } from "../core/client";
import type { Surface } from "../shell/Rail";
import { Button, Dialog, Menu, MenuItem, useComingSoon } from "../ui";

export function ProjectMenu({ client, module, trigger, open, onOpenChange, onGo, onChanged }: { client: Client; module: Pick<ModuleCard, "id" | "name" | "parent">; trigger: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; onGo: (s: Surface) => void; onChanged: () => void }) {
  const soon = useComingSoon();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  async function addSub() {
    if (!name.trim()) return;
    try {
      const made = await client.createModule(name.trim(), null, module.id);
      setNaming(false);
      setName("");
      onChanged();
      onGo({ kind: "module", id: made.id });
    } catch (e) {
      setProblem(`Couldn't make it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function takeOut() {
    try {
      await client.moveModule(module.id, null);
      onChanged();
    } catch (e) {
      setProblem(`Couldn't take it out: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return (
    <>
      <Menu align="start" open={open} onOpenChange={onOpenChange} trigger={trigger}>
        <MenuItem onSelect={() => soon("Renaming a project")}>Rename</MenuItem>
        <MenuItem onSelect={() => soon("Changing a project's icon")}>Change icon</MenuItem>
        <MenuItem onSelect={() => soon("Editing a project's goal")}>Edit goal</MenuItem>
        <MenuItem onSelect={() => { setProblem(null); setNaming(true); }}>Add sub project…</MenuItem>
        {module.parent ? <MenuItem onSelect={() => void takeOut()}>Take out</MenuItem> : null}
        <MenuItem onSelect={() => soon("Exporting a project")}>Export…</MenuItem>
        <MenuItem onSelect={() => soon("Exporting a project with its data")}>Export with data…</MenuItem>
        <MenuItem danger onSelect={() => soon("Deleting a project")}>
          Delete
        </MenuItem>
      </Menu>
      <Dialog open={naming} onOpenChange={setNaming} title={`A project inside ${module.name}`}>
        <form className="dialog__body" onSubmit={(e) => { e.preventDefault(); void addSub(); }}>
          <input className="textfield" style={{ width: "100%" }} autoFocus aria-label="The sub project's name" placeholder="Its name" value={name} onChange={(e) => setName(e.target.value)} />
          {problem ? <p className="notice" role="alert">{problem}</p> : null}
        </form>
        <div className="row dialog__actions">
          <Button variant="primary" disabled={!name.trim()} onClick={() => void addSub()}>
            Make it
          </Button>
          <Button variant="ghost" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>
      <Dialog open={!naming && problem !== null} onOpenChange={() => setProblem(null)} title="Something went wrong">
        <div className="dialog__body">{problem}</div>
        <div className="row dialog__actions">
          <Button onClick={() => setProblem(null)}>Close</Button>
        </div>
      </Dialog>
    </>
  );
}
