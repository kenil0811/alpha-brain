/**
 * One agent's page (the UI rulebook §12): what it does, the skills and automations it runs, what
 * it did lately, and the standing permissions that apply. An agent is Alpha, the assistant, or a
 * module's runner; both are read from `/api/intelligence` (`agents.ts`), and the runs are the
 * journal's entries for that module. Nothing here is edited by hand: the person asks Alpha.
 * (9 Oct, the pages phase.)
 */
import { useEffect, useState } from "react";
import type { Client, Intelligence as Data, JournalEntry } from "../core/client";
import { humanize, when } from "../modules/format";
import { Badge, Button, EmptyCard, ListRow, Notice, PageHeader, SectionCard, Trouble, type Tone } from "../ui";
import { AgentIcon, ICON, PermissionIcon, SkillIcon } from "../ui/icons";
import { ALPHA_AGENT, agentsFrom } from "./agents";
import { AutomationList } from "./Automations";
import { BackLink } from "./BackLink";
import type { Surface } from "./Rail";

const KIND: Record<string, string> = { read: "Reads a list from a page", act: "Does a task on a site", run: "Runs on its own" };
const RUN_KINDS = new Set(["did", "changed", "made", "saw", "failed", "checked"]);
const runTone = (e: JournalEntry): Tone => (e.kind === "failed" ? "bad" : e.actor === "person" ? "info" : "gray");

export function AgentPage({ client, id, version, onGo, onAsk, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [modules, setModules] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const module = id === ALPHA_AGENT ? undefined : id;
  useEffect(() => {
    let live = true;
    Promise.all([client.intelligence(), client.modules().catch(() => []), client.activity({ module, limit: 60 }).catch(() => [])])
      .then(([d, mods, rows]) => {
        if (!live) return;
        setData(d);
        setModules(Object.fromEntries(mods.map((m) => [m.id, m.name])));
        setRuns(rows.filter((e) => RUN_KINDS.has(e.kind)).slice(0, 20));
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, id, module, version, tick]);
  const back = <BackLink to="Agents" onClick={() => onGo({ kind: "intelligence", tab: "agents" })} />;
  if (!data) {
    return (
      <>
        <PageHeader left={back} />
        <div className="page page--narrow">{error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this agent: {error}</Trouble> : <p className="faint">Loading this agent…</p>}</div>
      </>
    );
  }
  const agent = agentsFrom(data, modules).find((a) => a.id === id);
  if (!agent) {
    return (
      <>
        <PageHeader left={back} title="Agent" />
        <div className="page page--narrow">
          <EmptyCard icon={<AgentIcon size={ICON} />} title="No such agent">It has no automations any more, so it is no longer listed. Open Agents to see who is.</EmptyCard>
        </div>
      </>
    );
  }
  const permissions = data.knowledge.permissions ?? [];
  async function revoke(pid: string) {
    try {
      await client.revokePermission(pid);
      setMessage({ ok: true, text: "Revoked." });
      onChanged();
      setTick((n) => n + 1);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  return (
    <>
      <PageHeader
        left={back}
        title={agent.name}
        right={
          <Button size="sm" variant="primary" onClick={() => onAsk(`Change the agent "${agent.name}": `)}>
            Ask Alpha to change this
          </Button>
        }
      />
      <div className="page page--narrow">
        <div className="stack stack--wide">
          <SectionCard title="What it does">
            <p className="agentpage__lead">{agent.description}</p>
            {agent.module === null
              ? data.hands.map((h) => <ListRow key={h.name} icon={<AgentIcon size={ICON} />} title={h.title} description={h.description ?? undefined} controls={<Badge tone="gray">Built in</Badge>} />)
              : null}
          </SectionCard>

          <SectionCard title="Skills it uses" subtitle={agent.skills.length ? undefined : "None yet"}>
            {agent.skills.length ? (
              agent.skills.map((s) => (
                <ListRow
                  key={s.name}
                  icon={<SkillIcon size={ICON} />}
                  title={s.description}
                  onOpen={() => onGo({ kind: "skill", name: s.name })}
                  description={`${KIND[s.kind] ?? s.kind} · version ${s.version}${s.last_run_at ? ` · last run ${when(s.last_run_at)}` : ""}`}
                  controls={<Badge tone={s.health === "ok" ? "good" : s.health === "broken" ? "bad" : "gray"}>{s.health === "ok" ? "Working" : s.health === "broken" ? "Being repaired" : "Not tried yet"}</Badge>}
                />
              ))
            ) : (
              <EmptyCard icon={<SkillIcon size={ICON} />} title="No skills yet">When Alpha learns to read a list or do a task for this, it appears here.</EmptyCard>
            )}
          </SectionCard>

          <SectionCard title="Automations it runs">
            <AutomationList bare client={client} items={agent.automations} onChanged={onChanged} onOpen={(aid) => onGo({ kind: "automation", id: aid })} empty="Nothing runs on its own here yet." />
          </SectionCard>

          <SectionCard title="Runs" subtitle={runs.length ? `The last ${runs.length} things it did` : undefined}>
            {runs.length ? (
              runs.map((e) => (
                <div key={e.id} className="list__row">
                  <span className="faint people__when">{when(e.at)}</span>
                  <Badge tone={runTone(e)}>{humanize(e.kind)}</Badge>
                  <span className="people__line">{e.text}</span>
                </div>
              ))
            ) : (
              <EmptyCard title="No runs yet">Nothing in the journal names it yet.</EmptyCard>
            )}
          </SectionCard>

          <SectionCard title="Standing permissions" subtitle="They apply to every agent; anything that reaches someone asks every time">
            {permissions.length ? (
              permissions.map((p) => <ListRow key={p.id} icon={<PermissionIcon size={ICON} />} title={p.sentence} description={`Since ${when(p.granted_at)}`} controls={<Button size="sm" variant="ghost" onClick={() => void revoke(p.id)}>Revoke</Button>} />)
            ) : (
              <EmptyCard icon={<PermissionIcon size={ICON} />} title="None yet">Alpha asks before it does anything that reaches someone.</EmptyCard>
            )}
            {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
