/**
 * Work beside the desk, in the stream (section C, Q107): one live message per piece of work
 * the desk started (its title, its state and its last step, updated in place), "Show the
 * work" folding out its steps from its thread's journal with no model call, the topic chip on
 * every message about it (a click filters the stream to it), and the Now strip above the
 * composer (the work running or waiting on the person, three at most and "+N").
 */
import { useEffect, useState } from "react";
import { say } from "../core/client";
import type { Client, JournalEntry, Work } from "../core/client";
import { Button } from "../ui";

export const WORK_STATE: Record<string, string> = { working: "working", needs_you: "needs you", done: "done", stopped: "stopped", open: "open" };

/** The work's steps, from its thread's journal: what it was asked, each step, its outcome. */
export function WorkFold({ client, id }: { client: Client; id: string }) {
  const [steps, setSteps] = useState<JournalEntry[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .thread(id)
      .then((t) => live && setSteps(t.journal))
      .catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, id]);
  if (problem) return <p className="notice">Couldn't load the work: {problem}</p>;
  if (!steps) return <p className="faint work__steps">Loading the work…</p>;
  if (!steps.length) return <p className="faint work__steps">No steps yet.</p>;
  return (
    <ol className="work__steps" aria-label="The work's steps">
      {steps.map((e) => (
        <li key={e.id} className={`work__step${e.data.outcome ? " work__step--outcome" : ""}`}>
          {e.data.outcome ? <b>Its report: </b> : null}
          <span>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** "Show the work": a fold under a live entry or an outcome. */
export function ShowTheWork({ client, id }: { client: Client; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="work__fold">
      <button type="button" className="work__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide the work" : "Show the work"}
      </button>
      {open ? <WorkFold client={client} id={id} /> : null}
    </div>
  );
}

/** A message's topic: the piece of work it came from or is about; a click shows only it. */
export function TopicChip({ work, onFilter, on }: { work: Work; onFilter: (id: string | null) => void; on?: boolean }) {
  return (
    <button type="button" className="topic" aria-pressed={on ? "true" : "false"} title={on ? "Show the whole conversation" : "Show only this"} onClick={() => onFilter(on ? null : work.id)}>
      <span className={`convchip__dot convchip__dot--${work.state}`} aria-hidden="true" />
      <span className="topic__title">{work.title}</span>
    </button>
  );
}

/** One live message for a piece of work while it runs (or after it stopped with no word from
 *  the desk): its title, its state and its last step, and Stop while it works. */
export function WorkEntry({ work, client, onFilter, filtered, onChanged }: { work: Work; client: Client; onFilter: (id: string | null) => void; filtered: boolean; onChanged: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const running = work.state === "working";
  const line = (running && work.live?.doing) || work.last_line || (running ? "Starting…" : "");
  return (
    <article className={`work work--${work.state}`} aria-label={`Work: ${work.title}`}>
      <div className="work__head">
        <TopicChip work={work} onFilter={onFilter} on={filtered} />
        <span className={`badge badge--${work.state === "needs_you" ? "waiting" : running ? "running" : work.state === "done" ? "good" : "failed"}`}>{WORK_STATE[work.state] ?? work.state}</span>
        {running ? (
          <Button size="sm" variant="ghost" onClick={() => void client.stopWork(work.id).then(onChanged).catch((e: unknown) => setProblem(say(e)))}>
            Stop
          </Button>
        ) : null}
      </div>
      {line ? (
        <div className="work__line">
          {running ? <span className="working__pulse" aria-hidden="true" /> : null}
          <span className={running ? "shimmer" : "faint"}>{line}</span>
        </div>
      ) : null}
      <ShowTheWork client={client} id={work.id} />
      {problem ? <p className="notice">{problem}</p> : null}
    </article>
  );
}

/** Above the composer: the work running or waiting on the person, three at most and "+N",
 *  each a filter; a dot when any waits on the person. */
export function NowStrip({ now, filter, onFilter, needsYou }: { now: Work[]; filter: string | null; onFilter: (id: string | null) => void; needsYou: number }) {
  if (!now.length && !needsYou) return null;
  const shown = now.slice(0, 3);
  const more = now.length - shown.length;
  return (
    <div className="nowstrip" aria-label="Now">
      <span className="nowstrip__head">
        Now{needsYou ? <span className="nowstrip__dot" aria-label={`${needsYou} waiting on you`} title={`${needsYou} waiting on you`} /> : null}
      </span>
      {shown.map((w) => (
        <TopicChip key={w.id} work={w} onFilter={onFilter} on={filter === w.id} />
      ))}
      {more > 0 ? <span className="faint">+{more}</span> : null}
      {needsYou ? <span className="faint nowstrip__needs">{needsYou} waiting on you, above</span> : null}
    </div>
  );
}
