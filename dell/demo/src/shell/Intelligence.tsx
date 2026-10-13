import { ArrowLeft, Bot, Brain, Cable, Play, Zap } from "lucide-react";
import { useState } from "react";
import { Button, Card, Flash, Pill, Switch, useFlash } from "../kit";
import { CONNECTIONS, FACTS } from "../data/home";
import { go, href } from "../data/route";
import { useWorld } from "../data/store";
import { PROJECTS } from "../projects/registry";
import { PageHeader } from "../views/ProjectPage";

const TABS = [
  { id: "brain", label: "Second Brain", icon: Brain },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "automations", label: "Automations", icon: Zap },
  { id: "connections", label: "Connections", icon: Cable },
];

const agents = () => PROJECTS.flatMap((p) => p.agents.map((a) => ({ ...a, project: p })));
const automations = () => PROJECTS.flatMap((p) => p.automations.map((a) => ({ ...a, project: p })));

export function Intelligence({ tab, item }: { tab: string; item?: string }) {
  return (
    <>
      <PageHeader>
        <Switch tabs={TABS} active={tab} onPick={(id) => go(href.intelligence(id))} />
      </PageHeader>
      <div className="main__body">
        <div className="readcol">
          {tab === "agents" && item ? <AgentPage id={item} /> : null}
          {tab === "automations" && item ? <AutomationPage id={item} /> : null}
          {tab === "agents" && !item ? <AgentList /> : null}
          {tab === "automations" && !item ? <AutomationList /> : null}
          {tab === "connections" ? <Connections /> : null}
          {tab === "brain" ? <SecondBrain /> : null}
        </div>
      </div>
    </>
  );
}

function AgentList() {
  return (
    <div className="grid">
      {agents().map((a) => (
        <a key={a.id} className="pcard" href={href.intelligence("agents", a.id)}>
          <span className="pcard__ico"><Bot aria-hidden /></span>
          <span className="pcard__name">{a.name}</span>
          <span className="pcard__desc">{a.does}</span>
          <span className="pcard__meta">{a.project.name}</span>
        </a>
      ))}
    </div>
  );
}

function AgentPage({ id }: { id: string }) {
  const a = agents().find((x) => x.id === id);
  if (!a) return <p className="empty">This agent is not in the demo.</p>;
  return (
    <div className="stack">
      <a className="back" href={href.intelligence("agents")}><ArrowLeft aria-hidden />Agents</a>
      <div className="record__title">
        <Bot className="record__ico" aria-hidden />
        <div><div className="eyebrow">Agent · {a.project.name}</div><h1 className="serif-title">{a.name}</h1></div>
      </div>
      <Card title="What it does"><p>{a.does}</p></Card>
      <Card title="Skills"><ul className="plain">{a.skills.map((s) => <li key={s}>{s}</li>)}</ul></Card>
      <Card title="Recent runs">
        <ul className="runs">
          {a.runs.map((r, i) => (
            <li key={i}><span className="meta">{r.when}</span><span>{r.what}</span><Pill tone={r.tone}>{r.result}</Pill></li>
          ))}
        </ul>
      </Card>
      <Card title="Permissions">
        <h3 className="subhead">May</h3>
        <ul className="plain">{a.may.map((s) => <li key={s}>{s}</li>)}</ul>
        <h3 className="subhead">May not</h3>
        <ul className="plain">{a.mayNot.map((s) => <li key={s}>{s}</li>)}</ul>
      </Card>
    </div>
  );
}

function AutomationList() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return (
    <Card>
      <ul className="rows">
        {automations().map((a) => {
          const isOn = on[a.id] ?? a.on;
          return (
            <li key={a.id} className="rows__row">
              <Zap aria-hidden className="rows__ico" />
              <a className="rows__title" href={href.intelligence("automations", a.id)}>{a.sentence}</a>
              <span className="rows__desc">{a.project.name} · next {a.next}</span>
              <button role="switch" aria-checked={isOn} aria-label={`${isOn ? "Turn off" : "Turn on"}: ${a.sentence}`} className={["toggle", isOn && "toggle--on"].filter(Boolean).join(" ")} onClick={() => setOn((o) => ({ ...o, [a.id]: !isOn }))}>
                <span className="toggle__knob" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AutomationPage({ id }: { id: string }) {
  const a = automations().find((x) => x.id === id);
  const [flash, setFlash] = useFlash();
  if (!a) return <p className="empty">This automation is not in the demo.</p>;
  return (
    <div className="stack">
      <a className="back" href={href.intelligence("automations")}><ArrowLeft aria-hidden />Automations</a>
      <div className="record__title">
        <Zap className="record__ico" aria-hidden />
        <div><div className="eyebrow">Automation · {a.project.name}</div><h1 className="serif-title">{a.sentence}</h1></div>
      </div>
      <Card title="When it runs" actions={<><Flash msg={flash} /><Button icon={Play} onClick={() => setFlash("Run started — in this demo nothing is sent")}>Run now</Button></>}>
        <dl className="kv">
          <div className="kv__row"><dt>Trigger</dt><dd>{a.trigger}</dd></div>
          <div className="kv__row"><dt>Next run</dt><dd>{a.next}</dd></div>
          <div className="kv__row"><dt>State</dt><dd>{a.on ? "On" : "Off"}</dd></div>
        </dl>
      </Card>
    </div>
  );
}

function Connections() {
  return (
    <Card>
      <ul className="rows">
        {CONNECTIONS.map((c) => (
          <li key={c.name} className="rows__row">
            <Cable aria-hidden className="rows__ico" />
            <span className="rows__title">{c.name}</span>
            <span className="rows__desc">{c.what}</span>
            <Pill tone={c.tone}>{c.state}</Pill>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SecondBrain() {
  const w = useWorld();
  const counts = PROJECTS.map((p) => ({ p, n: p.collections.reduce((n, c) => n + w.rows(p.id, c.id).length, 0) }));
  return (
    <div className="stack">
      <Card title="What Alpha holds" info="Every project, collection and record Alpha can read in this workspace.">
        <ul className="rows">
          {counts.map(({ p, n }) => (
            <li key={p.id} className="rows__row">
              <p.icon aria-hidden className="rows__ico" />
              <a className="rows__title" href={href.project(p.id)}>{p.name}</a>
              <span className="rows__desc">{n} records in {p.collections.map((c) => c.label).join(", ")}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Standing facts" info="Firm-wide facts Alpha uses. Each can be corrected or forgotten, and shows where it came from.">
        <ul className="rows">
          {FACTS.map((f) => (
            <li key={f.fact} className="rows__row">
              <Brain aria-hidden className="rows__ico" />
              <span className="rows__title">{f.fact}</span>
              <span className="rows__desc">{f.source}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
