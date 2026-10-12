/**
 * One agent's page (the UI rulebook §12): its face, name and description as fields, the
 * companion it wears (kept per agent in `PREF.agentLooks`; Alpha's falls back to the
 * companion's own), the skills and automations it runs, what it did lately, and the standing
 * permissions that apply. An agent is Alpha or a module's runner, read from `/api/intelligence`
 * (`agents.ts`); the core keeps no record of one, so Save stays disabled with the reason.
 */
import { useEffect, useMemo, useState } from "react";
import { LookPicker } from "../avatar/LookPicker";
import { say } from "../core/client";
import type { Client, Intelligence as Data, JournalEntry } from "../core/client";
import { humanize, when } from "../modules/format";
import { Badge, Button, EmptyCard, InfoTip, ListRow, Notice, PageHeader, SectionCard, Trouble, type Tone } from "../ui";
import { AgentAvatar, useAgentLook } from "./AgentAvatar";
import { AgentIcon, ICON, PermissionIcon } from "../ui/icons";
import { ALPHA_AGENT, agentsFrom } from "./agents";
import { DataPage } from "../modules/DataPage";
import { automationListSource, skillsSource } from "./intel/sources";
import { BackLink } from "./BackLink";
import type { Surface } from "./Rail";
import { RevokeButton } from "./Settings";
import { Field } from "./SkillPage";

const RUN_KINDS = new Set(["did", "changed", "made", "saw", "failed", "checked"]);
const runTone = (e: JournalEntry): Tone => (e.kind === "failed" ? "bad" : e.actor === "person" ? "info" : "gray");

export function AgentPage({ client, id, version, onGo, onAsk, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [modules, setModules] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string } | null>(null);
  const [look, setLook] = useAgentLook(client, id);
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
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, id, module, version, tick]);
  const sources = useMemo(() => {
    const mine = data ? agentsFrom(data, modules).find((a) => a.id === id) : undefined;
    return { skills: skillsSource(client, modules, mine?.skills.map((s) => s.name) ?? []), automations: automationListSource(client, mine?.automations ?? [], modules) };
  }, [client, data, modules, id]);
  const back = <BackLink to="Agents and automations" onClick={() => onGo({ kind: "intelligence", tab: "agents" })} />;
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
          <EmptyCard icon={<AgentIcon size={ICON} />} title="No such agent" />
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
      setMessage({ ok: false, text: say(e) });
    }
  }
  const fields = draft ?? { name: agent.name, description: agent.description };
  return (
    <>
      <PageHeader
        left={back}
        centre={
          <span className="intel__head">
            <AgentAvatar client={client} agent={agent.id} size={32} label={agent.name} />
            <h1 className="pagehead__title serif">{agent.name}</h1>
          </span>
        }
        right={
          <Button size="sm" variant="primary" onClick={() => onAsk(`Change the agent "${agent.name}": `)}>
            Ask Alpha to change this
          </Button>
        }
      />
      <div className="page page--narrow">
        <div className="stack stack--wide">
          <SectionCard
            title="Agent"
            actions={
              <>
                {draft ? (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    Discard
                  </Button>
                ) : null}
                <Button size="sm" variant="primary" disabledReason="This can't be saved from here yet. Use Ask Alpha to change this.">
                  Save
                </Button>
              </>
            }
          >
            <div className="intel__fields">
              <Field label="Name" value={fields.name} onChange={(v) => setDraft({ ...fields, name: v })} />
              <Field label="Description" value={fields.description} onChange={(v) => setDraft({ ...fields, description: v })} />
            </div>
            {agent.module === null && data.hands.length ? (
              <div className="intel__hands">
                {data.hands.map((h) => (
                  <Badge key={h.name} tone="gray">
                    {h.title}
                  </Badge>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Companion">
            <LookPicker value={look} onChange={setLook} />
          </SectionCard>

          {/* its skills and automations are the one data view (12 Oct, the owner) */}
          <SectionCard title="Skills">
            <DataPage client={client} source={sources.skills} version={version} onChanged={onChanged} onAsk={onAsk} onOpenRecord={(_k, name) => onGo({ kind: "skill", name })} />
          </SectionCard>

          <SectionCard title="Automations">
            <DataPage client={client} source={sources.automations} version={version} onChanged={onChanged} onAsk={onAsk} onOpenRecord={(_k, aid) => onGo({ kind: "automation", id: aid })} />
          </SectionCard>

          <SectionCard title="Runs">
            {runs.length ? (
              runs.map((e) => (
                <div key={e.id} className="list__row">
                  <span className="faint people__when">{when(e.at)}</span>
                  <Badge tone={runTone(e)}>{humanize(e.kind)}</Badge>
                  <span className="people__line">{e.text}</span>
                </div>
              ))
            ) : (
              <p className="faint">None yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Standing permissions" actions={<InfoTip text="Shared by every agent; anything that reaches someone asks every time" />}>
            {permissions.length ? (
              permissions.map((p) => <ListRow key={p.id} icon={<PermissionIcon size={ICON} />} title={p.sentence} description={`Since ${when(p.granted_at)}`} controls={<RevokeButton permission={p} onRevoke={() => void revoke(p.id)} />} />)
            ) : (
              <p className="faint">None yet.</p>
            )}
            {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
