/**
 * "New project" (9 Oct, Vikas): a name, an optional line on what it is for, and the one empty
 * table it starts with. Create project asks Alpha in the panel to build it (no route makes a
 * project with its first table); it appears in the sidebar when it is ready. `SimpleTable` is the
 * empty table every project shows before it has collections, and Network's table too: a header
 * row, blank rows when there is nothing, and the "+ New" row, never an empty screen.
 */
import { type ReactNode, useState } from "react";
import type { Client } from "../core/client";
import type { Surface } from "../shell/Rail";
import { Button, Notice, PageHeader } from "../ui";
import { ICON_SM, PlusIcon } from "../ui/icons";

const BLANK_ROWS = 3;

/** A plain table in the data view's classes: `columns` as its header, `children` as its rows
 *  (blank rows when there are none), and "+ New", disabled with `addReason` when there is no `onAdd`. */
export function SimpleTable({ label, columns, children, onAdd, addReason, note }: { label: string; columns: string[]; children?: ReactNode; onAdd?: () => void; addReason?: string; note?: string }) {
  const rows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="tablewrap">
      <table className="table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows
            ? children
            : Array.from({ length: BLANK_ROWS }, (_, i) => (
                <tr key={i} className="row--blank" aria-hidden="true">
                  {columns.map((c) => (
                    <td key={c} />
                  ))}
                </tr>
              ))}
          <tr className="row--add">
            <td colSpan={columns.length} className="addcell">
              <Button size="sm" variant="ghost" className="addrow" icon={<PlusIcon size={ICON_SM} />} disabledReason={onAdd ? undefined : addReason} onClick={onAdd}>
                New
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
      {note ? <p className="faint">{note}</p> : null}
    </div>
  );
}

/** The sentence Create project sends. */
export function newProjectSentence(name: string, purpose: string): string {
  const why = purpose.trim();
  return `Make a new project called "${name.trim()}"${why ? `: ${why}` : ""}. Start it with one table.`;
}

export function NewProjectPage({ onSay, onGo, onOpenChat }: { client: Client; onSay: (sentence: string) => void; onGo: (s: Surface) => void; onOpenChat?: () => void }) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [sent, setSent] = useState(false);
  const ready = name.trim().length > 0;
  const create = () => {
    if (!ready) return;
    onSay(newProjectSentence(name, purpose));
    setSent(true);
  };
  return (
    <>
      <PageHeader title="New project" />
      <div className="page page--column">
        <div className="stack stack--wide">
          <div className="field">
            <label htmlFor="newproject-name">Name</label>
            <input id="newproject-name" className="textfield" autoFocus placeholder="e.g. Deals" value={name} disabled={sent} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
          </div>
          <div className="field">
            <label htmlFor="newproject-purpose">What is it for? (optional)</label>
            <input id="newproject-purpose" className="textfield" placeholder="One line, e.g. the restaurants I'm advising" value={purpose} disabled={sent} onChange={(e) => setPurpose(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
          </div>
          <SimpleTable label={`${name.trim() || "The new project"}'s first table`} columns={["Name"]} addReason="Fills in once the project exists." />
          {sent ? (
            <Notice tone="ok">
              Alpha is building it — it'll appear in the sidebar when it's ready.{" "}
              <button type="button" className="linkbtn" onClick={onOpenChat ?? (() => onGo({ kind: "activity" }))}>
                See the conversation
              </button>
            </Notice>
          ) : (
            <div className="row">
              <Button variant="primary" disabledReason={ready ? undefined : "Give it a name first."} onClick={create}>
                Create project
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
