/**
 * "New project" (9 Oct, Vikas): a name, an optional line on what it is for, Create project and
 * Cancel (every create has a way back: the rulebook), and the one empty table it starts with, in
 * the same data view as every table. While the page is open the sidebar shows the project being
 * made, under its typed name. Create project asks Alpha in the panel to build it (no route makes a
 * project with its first table); it appears in the sidebar when it is ready.
 */
import { type KeyboardEvent, useMemo, useState } from "react";
import { DataPage } from "./DataPage";
import { emptySource } from "./source";
import type { Client } from "../core/client";
import type { Surface } from "../shell/Rail";
import { Button, Notice, PageHeader } from "../ui";

/** The sentence Create project sends. */
export function newProjectSentence(name: string, purpose: string): string {
  const why = purpose.trim();
  return `Make a new project called "${name.trim()}"${why ? `: ${why}` : ""}. Start it with one table.`;
}

export function NewProjectPage({ client, onSay, onGo, onOpenChat, onName, onCancel }: { client: Client; onSay: (sentence: string) => void; onGo: (s: Surface) => void; onOpenChat?: () => void; /** The name as typed, for the sidebar's item. */ onName?: (name: string) => void; /** Leave without making anything (every create has a Cancel: the rulebook). */ onCancel: () => void }) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [sent, setSent] = useState(false);
  const ready = name.trim().length > 0;
  const source = useMemo(() => emptySource(client, "new-project", "First table", "Fills in once the project exists."), [client]);
  const create = () => {
    if (!ready) return;
    onSay(newProjectSentence(name, purpose));
    setSent(true);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") create();
    if (e.key === "Escape" && !sent) {
      e.preventDefault();
      onCancel();
    }
  };
  return (
    <>
      <PageHeader title="New project" />
      <div className="page page--column">
        <div className="stack stack--wide">
          <div className="field">
            <label htmlFor="newproject-name">Name</label>
            <input id="newproject-name" className="textfield" autoFocus placeholder="e.g. Deals" value={name} disabled={sent} onChange={(e) => { setName(e.target.value); onName?.(e.target.value); }} onKeyDown={keys} />
          </div>
          <div className="field">
            <label htmlFor="newproject-purpose">What is it for? (optional)</label>
            <input id="newproject-purpose" className="textfield" placeholder="One line, e.g. the restaurants I'm advising" value={purpose} disabled={sent} onChange={(e) => setPurpose(e.target.value)} onKeyDown={keys} />
          </div>
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
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          )}
          <DataPage client={client} source={source} version={0} onChanged={() => undefined} onOpenRecord={() => undefined} />
        </div>
      </div>
    </>
  );
}
