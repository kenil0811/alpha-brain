/**
 * One goal's own page (13 Oct, slice 2 D12), at `#/intelligence/goals/<id>`: its words, its state,
 * since and until, its module, the same Edit, Done and Drop as the Goals card, and everything that
 * happened to it, each entry opening its own page. A goal isn't linked to the agents that work on
 * it (an agent's goal is its own sentence), so the page doesn't guess which do.
 */
import { useEffect, useState } from "react";
import { say, type Client, type Goal, type GoalPage as GoalData } from "../core/client";
import { humanize, when } from "../modules/format";
import { Badge, Button } from "../ui";
import { ArrowLeft } from "../ui/icons";
import type { Surface } from "./Rail";

/** A goal's buttons, on the Goals card and on its page: Edit, then Done and Drop for an active
 *  one, Pick up again for one that ended. */
export function GoalButtons({ client, goal, editing, onEdit, act }: { client: Client; goal: Goal; editing: boolean; onEdit: () => void; act: (work: () => Promise<unknown>, what: string) => unknown }) {
  return (
    <>
      {!editing ? (
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      ) : null}
      {goal.state === "active" ? (
        <>
          <Button size="sm" onClick={() => void act(() => client.changeGoal(goal.id, { state: "done" }), "mark it done")}>
            Done
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void act(() => client.changeGoal(goal.id, { state: "dropped" }), "drop it")}>
            Drop
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => void act(() => client.changeGoal(goal.id, { state: "active" }), "pick it up again")}>
          Pick up again
        </Button>
      )}
    </>
  );
}

/** A goal's words rewritten in place: Enter or leaving the box keeps them, Escape doesn't. */
export function GoalWords({ goal, onDone, onCancel }: { goal: Goal; onDone: (text: string) => void; onCancel: () => void }) {
  return (
    <input
      className="textfield"
      defaultValue={goal.text}
      autoFocus
      aria-label={`New words for ${goal.text}`}
      style={{ width: "100%" }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(e.currentTarget.value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => onDone(e.currentTarget.value)}
    />
  );
}

export function GoalPage({ client, id, version, onGo, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onChanged: () => void }) {
  const [goal, setGoal] = useState<GoalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    client
      .goal(id)
      .then((g) => {
        if (!live) return;
        setGoal(g);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, id, version, tick]);
  const act = (work: () => Promise<unknown>, what: string) => {
    setProblem(null);
    return work()
      .then(() => {
        setTick((t) => t + 1);
        onChanged();
      })
      .catch((e: unknown) => setProblem(`Couldn't ${what}: ${say(e)}`));
  };
  const back = (
    <Button size="sm" onClick={() => onGo({ kind: "intelligence", tab: "knowledge" })}>
      <ArrowLeft size={14} aria-hidden="true" /> Knowledge
    </Button>
  );
  if (error)
    return (
      <div className="page">
        {back}
        <p className="notice" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      </div>
    );
  if (!goal) return <div className="page"><p className="empty">Loading…</p></div>;
  return (
    <div className="page">
      {back}
      <div className="modhead" style={{ marginTop: 12 }}>
        <div className="modhead__title" style={{ display: "block", flex: 1 }}>
          {editing ? (
            <GoalWords goal={goal} onCancel={() => setEditing(false)} onDone={(t) => { setEditing(false); if (t.trim() !== goal.text) void act(() => client.changeGoal(goal.id, { text: t }), "rewrite the goal"); }} />
          ) : (
            <h1 style={goal.text.length > 60 ? { fontSize: "var(--text-xl)", lineHeight: 1.3 } : undefined}>{goal.text}</h1>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <Badge tone={goal.state === "active" ? "info" : goal.state === "done" ? "good" : "gray"}>{goal.state === "active" ? "Active" : humanize(goal.state)}</Badge>
            <span className="faint">
              since {when(goal.since)}
              {goal.state !== "active" && goal.until ? ` · until ${when(goal.until)}` : ""}
              {goal.module_name ? ` · in ${goal.module_name}` : ""}
            </span>
          </div>
        </div>
        <span className="row">
          <GoalButtons client={client} goal={goal} editing={editing} onEdit={() => setEditing(true)} act={act} />
        </span>
      </div>
      {problem ? (
        <p className="notice" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="section">
        <div className="section__head">
          <h2>What happened to it</h2>
        </div>
        <div className="card list">
          {!goal.history.length ? <p className="empty setcard__empty">Nothing recorded yet.</p> : null}
          {goal.history.map((h) => (
            <button key={h.id} type="button" className="item item--btn" onClick={() => onGo({ kind: "entry", id: h.id })}>
              <span className="item__when num">{when(h.at)}</span>
              <span className="badge">{h.actor === "person" ? "You" : "Alpha"}</span>
              <span className="item__body">
                <b>{h.text}</b>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
