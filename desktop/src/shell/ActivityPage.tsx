/**
 * One Activity entry's own page, `#/activity/<id>` (9 Oct, the owner: every element has a page,
 * Activity too): what happened in plain words, who did it, when (absolute), the project, what it
 * touched (each opens), the result or what went wrong, and Try again where the core can (an
 * automation's run). The core has no call for one entry, so the page looks it up among the
 * recent ones `/api/activity` returns, and says so plainly when it is not among them.
 */
import { useEffect, useState } from "react";
import type { Client, Entity, Intelligence, JournalEntry, ModuleCard } from "../core/client";
import { dayLabel, humanize, timeText } from "../modules/format";
import { Badge, Button, EmptyCard, ListRow, Notice, PageHeader, SectionCard, Trouble } from "../ui";
import { ActivityIcon, ICON } from "../ui/icons";
import { badge, detailLines } from "./Activity";
import { BackLink } from "./BackLink";
import type { Surface } from "./Rail";

/** How far back the page looks for the entry. */
const RECENT = 1000;

type Touch = { label: string; what: string; open: () => void };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Who did it, in words: you, an automation, or Alpha (or the agent the journal names). */
export function whoDid(e: JournalEntry, automation?: string | null): string {
  if (e.actor === "person") return "You";
  if (str(e.data.automation)) return automation ? `The automation "${automation}"` : "An automation";
  if (e.actor === "alpha") return "Alpha";
  return humanize(e.actor);
}

export function ActivityPage({ client, id, version, onGo, onOpenThread, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onOpenThread: (id: string) => void; onChanged: () => void }) {
  const [entry, setEntry] = useState<JournalEntry | null | undefined>(undefined);
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [people, setPeople] = useState<Entity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([client.activity({ limit: RECENT }), client.modules().catch(() => []), client.intelligence().catch(() => null), client.people().catch(() => [])])
      .then(([rows, mods, data, ents]) => {
        if (!live) return;
        setEntry(rows.find((r) => r.id === id) ?? null);
        setModules(mods);
        setIntel(data);
        setPeople(ents);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, id, version, tick]);

  const back = <BackLink to="Activity" onClick={() => onGo({ kind: "activity" })} />;
  if (!entry) {
    return (
      <>
        <PageHeader left={back} title="Activity" />
        <div className="page page--narrow">
          {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Activity: {error}</Trouble> : null}
          {entry === undefined && !error ? <p className="faint">Loading…</p> : null}
          {entry === null ? (
            <EmptyCard
              icon={<ActivityIcon size={ICON} />}
              title="This entry isn't among the recent ones"
              action={
                <Button size="sm" onClick={() => onGo({ kind: "activity" })}>
                  Open Activity
                </Button>
              }
            >
              Alpha keeps every entry, but this window only looks through the latest {RECENT.toLocaleString()}.
            </EmptyCard>
          ) : null}
        </div>
      </>
    );
  }

  const automationId = str(entry.data.automation);
  const automation = automationId ? intel?.automations.find((a) => a.id === automationId) : undefined;
  const module = entry.module ? modules.find((m) => m.id === entry.module) : undefined;
  const table = str(entry.data.table) ?? str(entry.data.collection);
  const record = str(entry.data.record);
  const skill = str(entry.data.reader) ?? str(entry.data.procedure) ?? str(entry.data.skill);
  const connection = str(entry.data.connection);
  const url = str(entry.data.url);
  const touches: Touch[] = [
    ...(entry.module ? [{ label: module?.name ?? "The project", what: "Project", open: () => onGo({ kind: "module", id: entry.module! }) }] : []),
    ...(entry.module && table && record ? [{ label: `A record in ${humanize(table)}`, what: "Record", open: () => onGo({ kind: "record", module: entry.module!, table, id: record }) }] : []),
    ...(automationId ? [{ label: automation?.title ?? "The automation", what: "Automation", open: () => onGo({ kind: "automation", id: automationId }) }] : []),
    ...(skill && intel?.skills.some((s) => s.name === skill) ? [{ label: intel.skills.find((s) => s.name === skill)!.description, what: "Skill", open: () => onGo({ kind: "skill", name: skill }) }] : []),
    ...(connection ? [{ label: "The connection", what: "Connection", open: () => onGo({ kind: "connection", id: connection }) }] : []),
    ...(entry.thread ? [{ label: "The conversation", what: "Conversation", open: () => onOpenThread(entry.thread!) }] : []),
    ...entry.entity_ids.map((eid) => {
      const p = people.find((x) => x.id === eid);
      return { label: p?.name ?? "Someone in Network", what: p ? humanize(p.kind) : "Network", open: () => onGo({ kind: "entity", id: eid }) };
    }),
  ];
  const b = badge(entry);
  const lines = detailLines(entry);
  const at = new Date(entry.at);
  async function again() {
    if (!automationId) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.runAutomation(automationId);
      setMessage({ ok: true, text: "Running it again; it reports in Activity." });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        left={back}
        title={entry.text}
        right={
          entry.kind === "failed" ? (
            <Button size="sm" variant="primary" disabled={busy} disabledReason={automationId ? undefined : "Trying this again needs Alpha's core; ask Alpha in the panel."} onClick={() => void again()}>
              Try again
            </Button>
          ) : null
        }
      />
      <div className="page page--narrow">
        <div className="stack stack--wide">
          <SectionCard title="What happened">
            <div className="actpage__facts">
              <span className="faint">What</span>
              <span>
                {entry.text.startsWith(b.words) ? null : <><Badge tone={b.tone}>{b.words}</Badge> </>}{entry.text}
              </span>
              <span className="faint">Who</span>
              <span>{whoDid(entry, automation?.title)}</span>
              <span className="faint">When</span>
              <span>
                {dayLabel(entry.at)}, {timeText(at)}
              </span>
              <span className="faint">Project</span>
              <span>
                {entry.module ? (
                  <button type="button" className="lrow__open" onClick={() => onGo({ kind: "module", id: entry.module! })}>
                    {module?.name ?? "The project"}
                  </button>
                ) : (
                  "None: across your workspace"
                )}
              </span>
            </div>
            {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
          </SectionCard>

          <SectionCard title="What it touched">
            {touches.length || url ? (
              <>
                {touches.map((t, i) => (
                  <ListRow key={`${t.what}-${i}`} title={t.label} description={t.what} onOpen={t.open} />
                ))}
                {url ? (
                  <ListRow
                    title={
                      <a href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                    }
                    description="Page"
                  />
                ) : null}
              </>
            ) : (
              <p className="faint">Nothing else was recorded.</p>
            )}
          </SectionCard>

          <SectionCard title={entry.kind === "failed" ? "What went wrong" : "Result"}>
            {lines.length ? (
              <ul className="check">
                {lines.map((l) => (
                  <li key={l}>
                    <span className="m m--y">·</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="faint">{entry.kind === "failed" ? "Alpha recorded no reason." : "Nothing more recorded."}</p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
