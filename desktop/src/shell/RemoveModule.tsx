/**
 * Taking a module away (13 Oct, slice 2 A3–A4), from its right-click menu in the sidebar or its
 * page's Settings: one question with three answers, each saying what it does. **Hide it from the
 * sidebar** changes nothing else. **Remove it, keep its data** takes it and what it holds out of
 * sight and stops its automations; Settings › Removed modules brings it back or deletes it. **Delete
 * it and its data** says exactly what goes (the core's own plan) and that it can't be undone;
 * Activity keeps that it was here. Settings' Removed modules card lists the removed ones with
 * Restore and Delete.
 */
import { useEffect, useState } from "react";
import { say, type Client, type ModuleCard, type RemovalPlan, type RemovedModule } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { when } from "../modules/format";
import { Button, Confirm, Dialog } from "../ui";

type Choice = "hide" | "keep" | "delete";

const CHOICES: { id: Choice; title: string; words: string }[] = [
  { id: "hide", title: "Hide it from the sidebar", words: "Nothing else changes: its page, tables and agents stay as they are." },
  { id: "keep", title: "Remove it, keep its data", words: "It leaves the sidebar with what it holds and its agents stop. Settings › Removed modules can bring it back." },
  { id: "delete", title: "Delete it and its data", words: "" },
];

const NO_IDS: string[] = [];

export function RemoveModuleDialog({ client, module, open, onClose, onDone }: { client: Client; module: Pick<ModuleCard, "id" | "name">; open: boolean; onClose: () => void; onDone: (how: Choice) => void }) {
  const [choice, setChoice] = useState<Choice>("hide");
  const [plan, setPlan] = useState<RemovalPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [hidden, setHidden] = usePreference<string[]>(client, PREF.sidebarHidden, NO_IDS);
  useEffect(() => {
    if (!open) return;
    setChoice("hide");
    setProblem(null);
    setPlan(null);
    client
      .moduleRemoval(module.id)
      .then(setPlan)
      .catch((e: unknown) => setProblem(say(e)));
  }, [client, module.id, open]);

  async function go() {
    setBusy(true);
    setProblem(null);
    try {
      if (choice === "hide") {
        const err = await setHidden([...(Array.isArray(hidden) ? hidden : []).filter((h) => h !== module.id), module.id]);
        if (err) {
          setProblem(`Couldn't hide it: ${err}`);
          return;
        }
      } else if (choice === "keep") {
        await client.removeModule(module.id);
      } else {
        await client.deleteModule(module.id);
      }
      onDone(choice);
    } catch (e) {
      setProblem(`Couldn't do that: ${say(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const action = choice === "hide" ? "Hide it" : choice === "keep" ? "Remove it" : "Delete for good";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={`Take ${module.name} away?`}>
      <div className="dialog__body">
        <div className="removechoice" role="radiogroup" aria-label={`What to do with ${module.name}`}>
          {CHOICES.map((c) => (
            <label key={c.id} className={`removechoice__item${choice === c.id ? " removechoice__item--on" : ""}${c.id === "delete" ? " removechoice__item--danger" : ""}`}>
              <input type="radio" name="remove-choice" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} />
              <span>
                <b>{c.title}</b>
                <span className="removechoice__words">
                  {c.id === "delete" ? (plan ? `Deletes ${plan.what}. This can't be undone; Activity keeps that it was here.` : "Working out what it holds…") : c.words}
                </span>
              </span>
            </label>
          ))}
        </div>
        {problem ? (
          <p className="notice" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
      <div className="row dialog__actions">
        <Button variant={choice === "delete" ? "danger" : "primary"} disabled={busy || (choice === "delete" && !plan)} onClick={() => void go()}>
          {busy ? "Working…" : action}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

/** Settings › Removed modules: each with when it was removed and what it holds, Restore and
 *  Delete (which asks first, saying what goes). */
export function RemovedModulesList({ client, version, onChanged }: { client: Client; version?: number; onChanged?: () => void }) {
  const [removed, setRemoved] = useState<RemovedModule[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RemovedModule | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    client
      .removedModules()
      .then((r) => {
        setRemoved(r);
        setProblem(null);
      })
      .catch((e: unknown) => setProblem(say(e)));
  }, [client, version, tick]);
  const act = (work: () => Promise<unknown>, what: string) =>
    work()
      .then(() => {
        setTick((t) => t + 1);
        onChanged?.();
      })
      .catch((e: unknown) => setProblem(`Couldn't ${what}: ${say(e)}`));
  if (removed === null && !problem) return <p className="empty setcard__empty">Loading…</p>;
  return (
    <>
      {problem ? (
        <p className="notice" role="alert" style={{ margin: 12 }}>
          {problem}
        </p>
      ) : null}
      {removed && !removed.length ? <p className="empty setcard__empty">Nothing here. A module you remove while keeping its data shows here, to bring back or delete for good.</p> : null}
      {(removed ?? []).map((m) => (
        <div key={m.id} className="item">
          <div className="item__body">
            <b>{m.path.join(" › ")}</b>
            <div className="item__sub">
              Removed {when(m.removed_at)} · {m.holds}
            </div>
          </div>
          <Button size="sm" onClick={() => void act(() => client.restoreModule(m.id), `restore ${m.name}`)}>
            Restore
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>
            Delete…
          </Button>
        </div>
      ))}
      <Confirm open={deleting !== null} title={deleting ? `Delete ${deleting.name} for good?` : ""} action="Delete for good" onConfirm={() => { const m = deleting; setDeleting(null); if (m) void act(() => client.deleteModule(m.id), `delete ${m.name}`); }} onCancel={() => setDeleting(null)}>
        {deleting ? `Deletes ${deleting.holds}. This can't be undone; Activity keeps that it was here.` : null}
      </Confirm>
    </>
  );
}
