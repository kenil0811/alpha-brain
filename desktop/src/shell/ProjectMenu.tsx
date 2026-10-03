/**
 * Open (on the rail), Rename, Change icon, Export and Delete for a project: the same items and
 * dialogs on the rail's project row (its ⋮ or a right-click) and on the project page. A project
 * file holds its structure (Export…) or its structure and rows (Export with data…); it is saved
 * to Downloads on the Mac, or downloaded in a browser; adding one makes a new project from it.
 */
import { useEffect, useState } from "react";
import { Database, EyeOff, FileDown, FolderOpen, Pencil, Shapes, Trash2 } from "lucide-react";
import type { Client, ModuleCard } from "../core/client";
import { hasTauri } from "../core/session";
import { Button, Dialog, DialogContent, DropdownMenuItem, DropdownMenuSeparator, Input } from "../ui";
import { PROJECT_ICONS } from "./projectIcons";

export type ProjectEdit = "rename" | "icon" | "delete";
export const PROJECT_FILE = ".alphaproject";

export function ProjectMenuItems({ onPick, onExport, onHide, onOpen }: { onPick: (edit: ProjectEdit) => void; onExport: (rows: boolean) => void; onHide?: () => void; onOpen?: () => void }) {
  return (
    <>
      {onOpen ? (
        <DropdownMenuItem onSelect={onOpen}>
          <FolderOpen size={14} strokeWidth={1.75} aria-hidden="true" /> Open
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => onPick("rename")}>
        <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onPick("icon")}>
        <Shapes size={14} strokeWidth={1.75} aria-hidden="true" /> Change icon
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onExport(false)}>
        <FileDown size={14} strokeWidth={1.75} aria-hidden="true" /> Export…
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onExport(true)}>
        <Database size={14} strokeWidth={1.75} aria-hidden="true" /> Export with data…
      </DropdownMenuItem>
      {onHide ? (
        <DropdownMenuItem onSelect={onHide}>
          <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" /> Hide from sidebar
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="ui-menu__item--danger" onSelect={() => onPick("delete")}>
        <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" /> Delete
      </DropdownMenuItem>
    </>
  );
}

/** Saves a project's file and says where it went (a path on the Mac; nothing in a browser,
 *  whose own download bar shows it). */
export async function exportProject(client: Client, m: ModuleCard, rows = false): Promise<string> {
  const bundle = await client.exportModule(m.id, rows);
  const filename = `${m.name.replace(/[^\w .-]+/g, "").trim() || "project"}${PROJECT_FILE}`;
  const text = JSON.stringify(bundle, null, 2);
  if (hasTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke<string>("save_to_downloads", { filename, text });
    return "Saved to Downloads";
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return `Exported ${m.name}`;
}

export function isProjectFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(PROJECT_FILE) || file.name.toLowerCase().endsWith(".json");
}

export async function importProject(client: Client, file: File): Promise<ModuleCard> {
  let bundle: unknown;
  try {
    bundle = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a project exported from Alpha.");
  }
  return client.importModule(bundle);
}

/** One dialog for whichever edit was picked. */
export function ProjectEditDialog({ client, project, edit, onClose, onChanged, onDeleted, subProjects = 0 }: { client: Client; project: ModuleCard | null; edit: ProjectEdit | null; onClose: () => void; onChanged: () => void; onDeleted: (id: string) => void; subProjects?: number }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(project?.name ?? "");
    setError(null);
  }, [project, edit]);

  async function run(work: () => Promise<unknown>, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      await work();
      after();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  const open = project !== null && edit !== null;
  const title = edit === "rename" ? "Rename project" : edit === "icon" ? "Change icon" : `Delete ${project?.name ?? "project"}?`;
  const tables = project?.tables.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <DialogContent title={title}>
          {edit === "rename" ? (
            <form
              className="projedit"
              onSubmit={(e) => {
                e.preventDefault();
                const clean = name.trim();
                if (clean && clean !== project.name) void run(() => client.updateModule(project.id, { name: clean }), onChanged);
                else onClose();
              }}
            >
              <Input autoFocus aria-label="Project name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
              <div className="projedit__actions">
                <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy || !name.trim()}>
                  Save
                </Button>
              </div>
            </form>
          ) : edit === "icon" ? (
            <div className="projicons" role="group" aria-label="Project icons">
              {Object.entries(PROJECT_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  className={`projicons__btn${project.icon === key ? " projicons__btn--current" : ""}`}
                  aria-label={key.replace(/-/g, " ")}
                  aria-pressed={project.icon === key}
                  disabled={busy}
                  onClick={() => void run(() => client.updateModule(project.id, { icon: key }), onChanged)}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="projedit__what">
                Removes {tables} {tables === 1 ? "table" : "tables"} ({project.records} {project.records === 1 ? "row" : "rows"}), its automations, note and goals. Activity keeps the history.{subProjects ? " Its sub projects move back to the top level." : ""} This cannot be undone.
              </p>
              <div className="projedit__actions">
                <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void run(() => client.removeModule(project.id), () => onDeleted(project.id))} disabled={busy}>
                  Delete
                </Button>
              </div>
            </>
          )}
          {error ? (
            <p className="notice" role="alert">
              {error}
            </p>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
