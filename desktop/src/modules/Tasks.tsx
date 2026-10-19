/**
 * Tasks in the window (P1, 18 Oct 2026; docs/design/tasks-and-cards-proposal.md, Q85, Q87, Q91):
 * the Tasks page in the rail (the table's standard page, its lists and its tree), the tasks a
 * place holds (a record's section, a module's tab) with Add task there, and what a task's own page
 * adds to a record's: a suggestion to keep or drop, where it lives with Change, what is around it.
 * The tasks are a table the world keeps itself, so every view, edit and History is the table's.
 */
import { useEffect, useMemo, useState } from "react";
import type { Agent, Client, ModuleCard, RecordRow, TableDesc, TaskAround, TaskItem, TaskRuns } from "../core/client";
import { say } from "../core/client";
import { surfaceFromPath } from "../shell/address";
import { TASKS_TABLE, type Surface } from "../shell/Rail";
import { Button, Popover } from "../ui";
import { Check, X } from "../ui/icons";
import { VERDICT } from "../shell/Agents";
import { DataPage } from "./DataPage";
import { showValue } from "./fields";
import { humanize, when } from "./format";

/** The address of a record (or one of its fields), as a task's place says it. */
export function addressOf(table: string, id: string, module: string | null, field?: string): string {
  const head = module ? `#/m/${module}/${table}/${id}` : `#/records/${table}/${id}`;
  return field ? `${head}/${field}` : head;
}

/** Where an address opens in the window: the record, the module, the module on its table. */
export function surfaceOf(address: string): Surface | null {
  // a module's page opens the module (its pages are its tabs)
  return surfaceFromPath(address.replace(/\/~page\/.*$/, ""));
}

const isDone = (t: TaskItem) => t.state === "Done" || t.state === "Dropped";

/** The Tasks page: the table's own page (its lists: Open, Today, This week, Overdue, By place…). */
export function TasksPage({ client, version, onChanged, onGo, onSay }: { client: Client; version: number; onChanged: () => void; onGo: (s: Surface) => void; onSay?: (sentence: string) => void }) {
  const [table, setTable] = useState<TableDesc | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .table(TASKS_TABLE)
      .then((d) => live && (setTable(d.table), setError(null)))
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client]);
  return (
    <div className="page page--fill">
      <div className="modhead">
        <div className="modhead__title">
          <h1 title="What you mean to do and what is owed to you, each on the place it is about.">Tasks</h1>
        </div>
      </div>
      {error ? <p className="notice" role="alert">Couldn't open the tasks: {error}</p> : null}
      {table ? <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} onSay={onSay} onOpenRecord={(t, id) => onGo({ kind: "record", table: t, id })} onOpenAddress={(a) => { const s = surfaceOf(a); if (s) onGo(s); }} /> : error ? null : <p className="empty">Loading…</p>}
    </div>
  );
}

/** A module's Tasks tab: the tasks living in it, on its tables, rows and pages; one added here
 *  lives on the module. */
export function ModuleTasks({ client, moduleId, version, onChanged, onGo }: { client: Client; moduleId: string; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [table, setTable] = useState<TableDesc | null>(null);
  const at = `#/m/${moduleId}`;
  useEffect(() => {
    let live = true;
    client.table(TASKS_TABLE).then((d) => live && setTable(d.table)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client]);
  const scope = useMemo(() => ({ id: at, keep: (r: RecordRow) => { const a = String(r.values.anchor ?? ""); return a === at || a.startsWith(`${at}/`); }, values: { anchor: at } }), [at]);
  return table ? <DataPage key={`tasks-${moduleId}`} client={client} table={table} scope={scope} version={version} onChanged={onChanged} onOpenRecord={(t, id) => onGo({ kind: "record", table: t, id })} onOpenAddress={(a) => { const s = surfaceOf(a); if (s) onGo(s); }} /> : <p className="empty">Loading…</p>;
}

/** The tasks a record holds (on it and on its fields), on the record's page, with Add task here. */
export function TasksHere({ client, at, version, onChanged, onGo, fields }: { client: Client; at: string; version: number; onChanged: () => void; onGo: (s: Surface) => void; fields?: { name: string; label: string }[] }) {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [on, setOn] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    client
      .tasksAt(at, { done: true })
      .then((d) => live && setTasks(d.tasks))
      .catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, at, version, tick]);
  async function add() {
    const words = title.trim();
    if (!words) return;
    try {
      await client.addTask({ title: words, anchor: on ? `${at}/${on}` : at });
      setTitle("");
      setProblem(null);
      setTick((n) => n + 1);
      onChanged();
    } catch (e) {
      setProblem(`Couldn't add it: ${say(e)}`);
    }
  }
  const open = (tasks ?? []).filter((t) => !isDone(t));
  const done = (tasks ?? []).filter(isDone);
  const shown = showDone ? [...open, ...done] : open;
  return (
    <div className="section">
      <div className="section__head">
        <h2>Tasks</h2>
        <span className="faint num">{open.length || ""}</span>
        {done.length ? (
          <button type="button" className="linkbtn faint" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Hide done" : `Show ${done.length} done`}
          </button>
        ) : null}
      </div>
      <div className="card">
        {shown.length ? (
          <div className="list">
            {shown.map((t) => (
              <TaskLine key={t.id} task={t} at={at} onOpen={() => onGo({ kind: "record", table: TASKS_TABLE, id: t.id })} />
            ))}
          </div>
        ) : null}
        <form
          className="tasks__add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input className="textfield" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task here…" aria-label="A new task's title" />
          {fields?.length ? (
            <select className="btn btn--sm" value={on} onChange={(e) => setOn(e.target.value)} aria-label="On which field">
              <option value="">On the whole row</option>
              {fields.map((f) => (
                <option key={f.name} value={f.name}>
                  On {f.label}
                </option>
              ))}
            </select>
          ) : null}
          <Button size="sm" type="submit" disabled={!title.trim()}>
            Add task
          </Button>
        </form>
        {problem ? <p className="notice" role="alert" style={{ margin: 12 }}>{problem}</p> : null}
      </div>
    </div>
  );
}

function TaskLine({ task, at, onOpen }: { task: TaskItem; at: string; onOpen: () => void }) {
  // a task on one of the record's fields says which, the rest of its place is this page
  const field = task.anchor && task.anchor !== at && task.anchor.startsWith(`${at}/`) ? task._words?.anchor?.split(" › ").pop() : null;
  return (
    <button type="button" className="list__row" onClick={onOpen}>
      <span className={isDone(task) ? "faint" : undefined}>{task.title}</span>
      <span className={`pill pill--${isDone(task) ? "good" : "gray"}`}>{humanize(task.state)}</span>
      {task.suggested ? <span className="pill pill--info">Suggested</span> : null}
      <span className="faint">{[field ? `on ${field}` : "", task.due ? `due ${showValue(task.due, "date")}` : "", task.owner && task.owner !== "person" ? task._words?.owner ?? "" : ""].filter(Boolean).join(" · ")}</span>
    </button>
  );
}

/** What a task's own page adds: the suggestion to keep or drop; where it lives, with Change;
 *  what is around it, nearest first (the same the model is given about it). */
export function TaskParts({ client, row, version, onChanged, onGo }: { client: Client; row: RecordRow; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [around, setAround] = useState<TaskAround | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [child, setChild] = useState("");
  useEffect(() => {
    let live = true;
    client
      .taskAround(row.id)
      .then((a) => live && (setAround(a), setProblem(null)))
      .catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, row.id, row.revision, version, tick]);
  const changed = () => {
    setTick((n) => n + 1);
    onChanged();
  };
  async function act(fn: () => Promise<unknown>, what: string) {
    try {
      await fn();
      setProblem(null);
      changed();
    } catch (e) {
      setProblem(`Couldn't ${what}: ${say(e)}`);
    }
  }
  const go = (address: string) => {
    const s = surfaceOf(address);
    if (s) onGo(s);
  };
  const brief = (t: { id: string; title: string; state: string; due?: string | null }) => (
    <button key={t.id} type="button" className="list__row" onClick={() => onGo({ kind: "record", table: TASKS_TABLE, id: t.id })}>
      <span>{t.title}</span>
      <span className="pill pill--gray">{humanize(t.state)}</span>
      {t.due ? <span className="faint">due {showValue(t.due, "date")}</span> : null}
    </button>
  );
  return (
    <>
      <div className="section">
        <div className="section__head">
          <h2>Where it lives</h2>
        </div>
        <div className="card card--pad tasks__where">
          {around?.where.length ? (
            <span className="tasks__path">
              {around.where.map((s, i) => (
                <span key={s.address}>
                  {i ? <span className="faint"> › </span> : null}
                  <button type="button" className="linkbtn" onClick={() => go(s.address)}>
                    {s.words}
                  </button>
                </span>
              ))}
            </span>
          ) : (
            <span className="faint">{around?.where_gone ? `Its place is gone: ${around.where_gone}` : "No place yet."}</span>
          )}
          <PlacePicker client={client} onPick={(place) => void act(() => client.placeTask(row.id, place), "move it")} />
        </div>
      </div>
      {problem ? <p className="notice" role="alert">{problem}</p> : null}
      {around ? (
        <div className="section">
          <div className="section__head">
            <h2>Around it</h2>
            <span className="faint">Nearest first: what Alpha sees about this task too</span>
          </div>
          <div className="card card--pad stack">
            {around.place ? (
              <div>
                <div className="eyebrow">{String(around.place.title ?? "")}</div>
                <dl className="tasks__values">
                  {around.place.values.slice(0, 12).map((v) => (
                    <div key={v.field}>
                      <dt>{v.label}</dt>
                      <dd>
                        {showValue(v.value, v.kind ?? (typeof v.value === "number" ? "number" : "text"), v.unit)}
                        {v.source ? <span className="faint"> · from {v.source}</span> : null}
                        {v.estimated ? <span className="faint"> · estimated</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {around.parent ? (
              <div>
                <div className="eyebrow">Part of</div>
                <div className="list">{brief(around.parent)}</div>
              </div>
            ) : null}
            <div>
              <div className="eyebrow">Under it</div>
              {around.children.length ? <div className="list">{around.children.map(brief)}</div> : null}
              <form
                className="tasks__add"
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = child.trim();
                  if (!title) return;
                  void act(async () => {
                    await client.addTask({ title, parent: row.id, anchor: typeof row.values.anchor === "string" ? row.values.anchor : null });
                    setChild("");
                  }, "add it");
                }}
              >
                <input className="textfield" value={child} onChange={(e) => setChild(e.target.value)} placeholder="Add a step under it…" aria-label="A step under this task" />
                <Button size="sm" type="submit" disabled={!child.trim()}>
                  Add
                </Button>
              </form>
            </div>
            {around.blocked_by.length ? (
              <div>
                <div className="eyebrow">Blocked by</div>
                <div className="list">{around.blocked_by.map(brief)}</div>
              </div>
            ) : null}
            {around.beside.length ? (
              <div>
                <div className="eyebrow">Beside it, on the same place</div>
                <div className="list">{around.beside.map(brief)}</div>
              </div>
            ) : null}
            {around.about.length ? (
              <div>
                <div className="eyebrow">About</div>
                <p>{around.about.map((a) => a.words).join(", ")}</p>
              </div>
            ) : null}
            {around.notes ? (
              <div>
                <div className="eyebrow">The module's notes</div>
                <p className="tasks__notes">{around.notes}</p>
              </div>
            ) : null}
            {!around.place && !around.parent && !around.beside.length && !around.about.length && !around.notes ? <p className="faint">Nothing around it yet: give it a place, or add steps under it.</p> : null}
          </div>
        </div>
      ) : null}
      {row.values.remind_at ? <p className="faint">Reminds you {when(String(row.values.remind_at))}.</p> : null}
    </>
  );
}

/** A task an agent made is a suggestion until the person keeps it (Q91): who made it, Keep, Drop;
 *  at the top of its page, above its details. */
export function TaskSuggestion({ client, row, onChanged }: { client: Client; row: RecordRow; onChanged: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  if (row.values.suggested !== true) return null;
  const by = typeof row.words?.by === "string" ? row.words.by : null;
  async function act(fn: () => Promise<unknown>, what: string) {
    try {
      await fn();
      setProblem(null);
      onChanged();
    } catch (e) {
      setProblem(`Couldn't ${what}: ${say(e)}`);
    }
  }
  return (
    <div className="notice notice--quiet tasks__suggested" role="status">
      <span>{by ? `${by} suggested this task.` : "Suggested."} It is yours once you keep it.</span>
      <span className="row">
        <Button size="sm" variant="primary" onClick={() => void act(() => client.keepTask(row.id), "keep it")}>
          Keep
        </Button>
        <Button size="sm" onClick={() => void act(() => client.dropTask(row.id), "drop it")}>
          Drop
        </Button>
      </span>
      {problem ? <span className="notice" role="alert">{problem}</span> : null}
    </div>
  );
}

/** Change: find the place a task is about (a row of any table, or a module), or take it off. */
function PlacePicker({ client, onPick }: { client: Client; onPick: (place: { anchor?: string | null; module?: string; table?: string; record?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ collection: string; id: string; snippet: string }[]>([]);
  const [modules, setModules] = useState<ModuleCard[]>([]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    client.modules().then((m) => live && setModules(m)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, open]);
  useEffect(() => {
    const words = q.trim();
    if (!open || words.length < 2) {
      setRows([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      client
        .search(words)
        .then((r) => live && setRows(r.records.filter((x) => x.collection !== TASKS_TABLE).slice(0, 8)))
        .catch(() => undefined);
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [client, q, open]);
  const pick = (place: { anchor?: string | null; module?: string; table?: string; record?: string }) => {
    setOpen(false);
    setQ("");
    onPick(place);
  };
  const shownModules = modules.filter((m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6);
  return (
    <Popover open={open} onOpenChange={setOpen} label="Move the task" trigger={<Button size="sm">Change</Button>}>
      <div className="tasks__picker">
        <input autoFocus className="textfield" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a row or a module…" aria-label="Find a place" />
        {rows.length ? <div className="menu__head">Rows</div> : null}
        {rows.map((r) => (
          <button key={`${r.collection}/${r.id}`} type="button" className="menu__item" onClick={() => pick({ table: r.collection, record: r.id })}>
            {r.snippet.replace(/[[\]]/g, "") || r.id} <span className="faint">· {humanize(r.collection)}</span>
          </button>
        ))}
        {shownModules.length ? <div className="menu__head">Modules</div> : null}
        {shownModules.map((m) => (
          <button key={m.id} type="button" className="menu__item" onClick={() => pick({ module: m.id })}>
            {m.name}
          </button>
        ))}
        <div className="menu__head">Or</div>
        <button type="button" className="menu__item" onClick={() => pick({})}>
          No place
        </button>
      </div>
    </Popover>
  );
}

/** The agent a task was given and the runs that served it (P2): give it to an agent (never a
 *  start), Start, Stop while it runs, each run with its verdict, its line and its steps. */
export function TaskAgent({ client, row, version, onChanged, onGo }: { client: Client; row: RecordRow; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [runs, setRuns] = useState<TaskRuns | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .taskRuns(row.id)
      .then((r) => live && (setRuns(r), setProblem(null)))
      .catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, row.id, row.revision, version, tick]);
  useEffect(() => {
    let live = true;
    client.agents().then((a) => live && setAgents(a.filter((x) => x.kind === "custom"))).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client]);
  async function act(fn: () => Promise<unknown>, what: string) {
    try {
      await fn();
      setProblem(null);
      setTick((n) => n + 1);
      onChanged();
    } catch (e) {
      setProblem(`Couldn't ${what}: ${say(e)}`);
    }
  }
  if (!runs) return null;
  const agent = runs.agent;
  const owner = String(row.values.owner ?? "person");
  const give = (aid: string) => void act(() => client.editRecord(TASKS_TABLE, row.id, { owner: aid }, row.revision), "give it");
  const done = row.values.state === "Done" || row.values.state === "Dropped";
  return (
    <div className="section">
      <div className="section__head">
        <h2>Agent</h2>
        <span className="faint">give it to an agent, then Start</span>
      </div>
      <div className="card card--pad stack">
        <div className="row tasks__agent">
          {agent ? (
            <>
              <button type="button" className="linkbtn" onClick={() => onGo({ kind: "agent", id: agent.id })}>
                {agent.name}
              </button>
              {agent.running ? <span className="badge badge--running">Running</span> : null}
              <span className="spacer" />
              {!agent.running && agent.takes_tasks && !done ? (
                <Button size="sm" variant="primary" onClick={() => void act(() => client.startTask(row.id), "start it")}>
                  Start
                </Button>
              ) : null}
              {agent.running ? (
                <Button size="sm" onClick={() => void act(() => client.stopAgent(agent.id), "stop it")}>
                  Stop
                </Button>
              ) : null}
              {!agent.running ? (
                <Button size="sm" onClick={() => give("person")}>
                  Take it back
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <span className="faint">{owner === "person" ? "Yours." : "Not an agent's."}</span>
              <span className="spacer" />
              {agents.length ? (
                <select className="btn btn--sm" value="" onChange={(e) => e.target.value && give(e.target.value)} aria-label="Give it to an agent">
                  <option value="">Give it to…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="faint">No agent of yours yet.</span>
              )}
            </>
          )}
        </div>
        {agent && !agent.takes_tasks ? <p className="faint">{agent.name} only runs its steps; it can't take a task. Take it back, or give it to an agent with a brief.</p> : null}
        {runs.runs.length ? (
          <div className="stack">
            {runs.runs.map((r) => (
              <div key={r.id} className="tasks__run">
                <button type="button" className="row tasks__runhead" aria-expanded={open === r.id} onClick={() => setOpen((o) => (o === r.id ? null : r.id))}>
                  <b>{when(r.started_at)}</b>
                  {r.verdict ? <span className={`badge ${VERDICT[r.verdict].cls}`}>{VERDICT[r.verdict].words}</span> : <span className="badge badge--running">Running</span>}
                  <span className="muted tasks__runline">{r.line ?? r.why ?? ""}</span>
                  <span className="faint">{r.steps.length} step{r.steps.length === 1 ? "" : "s"}</span>
                </button>
                {open === r.id || !r.verdict ? (
                  <ul className="stages">
                    {r.steps.map((st) => (
                      <li key={st.id} className={st.kind === "failed" ? "notice" : "stages__done"}>
                        {st.kind === "failed" ? <X size={12} aria-label="failed" /> : <Check size={12} aria-label="done" />} {st.text.length > 240 ? `${st.text.slice(0, 240)}…` : st.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        ) : agent ? (
          <p className="faint">No run has served it yet.</p>
        ) : null}
        {problem ? <p className="notice" role="alert">{problem}</p> : null}
      </div>
    </div>
  );
}

/** An agent's tasks, on its page (P2): its own job first, then what it was given. */
export function AgentTasks({ client, agentId, version, onGo }: { client: Client; agentId: string; version: number; onGo: (s: Surface) => void }) {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  useEffect(() => {
    let live = true;
    client.tasksOf(agentId, true).then((r) => live && setTasks(r.tasks)).catch(() => live && setTasks([]));
    return () => {
      live = false;
    };
  }, [client, agentId, version]);
  if (!tasks?.length) return null;
  return (
    <div className="section">
      <div className="section__head">
        <h2>Its tasks</h2>
        <span className="faint">what it was given</span>
      </div>
      <div className="card list">
        {tasks.map((t) => (
          <button key={t.id} type="button" className="list__row" onClick={() => onGo({ kind: "record", table: TASKS_TABLE, id: t.id })}>
            <span className={isDone(t) ? "faint" : undefined}>{t.title}</span>
            <span className={`pill pill--${isDone(t) ? "good" : "gray"}`}>{humanize(t.state)}</span>
            {t.due ? <span className="faint">due {showValue(t.due, "date")}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
