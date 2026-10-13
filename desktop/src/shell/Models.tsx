/**
 * Settings › Models (12 Oct, the owner, after SuperPenguin's Projects page): what Alpha's model
 * calls cost, per assistant and model, then per project, conversation or agent, over a range.
 * Every number is the core's usage record (`/api/usage`, `spend.ts`): answers and background
 * passes alike, priced by the tool itself; ChatGPT through Codex gives tokens and no price. The
 * daily budget warns and never stops anything (no caps on work).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { say } from "../core/client";
import type { Automation, ClaudeStatus, Client, Convo, ModuleCard, UsageRow } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { Badge, Button, Dropdown, InfoTip, ListRow, MetricTile, Notice, SectionCard, Tabs, Toggle, Tooltip, Trouble } from "../ui";
import { NumberField } from "../ui/NumberField";
import { calls, lastTwoDays, modelName, money, rank, since, tokens, total, uses, type Range, type Route, type Row, type Use } from "./spend";

/** Today at this many times yesterday is a spike worth saying (a judgement, not a cap). */
const SPIKE = 2;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

type By = "projects" | "conversations" | "agents";
const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function ModelsCard({ client, claude }: { client: Client; claude: ClaudeStatus | null }) {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [modules, setModules] = useState<ModuleCard[]>([]);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [agents, setAgents] = useState<Automation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [route, setRoute] = useState<"all" | Route>("all");
  const [model, setModel] = useState("all");
  const [range, setRange] = useState<Range>("today");
  const [by, setBy] = useState<By>("projects");
  const [project, setProject] = useState<string | null | undefined>(undefined);
  const [names] = usePreference<Record<string, string>>(client, PREF.moduleNames, {});

  useEffect(() => {
    let live = true;
    Promise.all([
      // ponytail: every row since the world began, summed here; ask the core for totals when this grows slow
      client.usage(),
      client.modules(),
      client.conversations(null, true),
      client.intelligence(),
    ])
      .then(([u, m, c, intel]) => {
        if (!live) return;
        setRows(u);
        setModules(m);
        setConvos(c);
        setAgents(intel.automations);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, tick]);

  const all = useMemo(() => uses(rows ?? []), [rows]);
  const start = since(range);
  const modelKey = (u: Use) => `${u.route ?? ""}:${u.model ?? ""}`;
  const inRoute = all.filter((u) => route === "all" || u.route === route);
  const models = rank(inRoute, modelKey);
  const picked = inRoute.filter((u) => model === "all" || modelKey(u) === model);
  const shown = picked.filter((u) => !start || u.at >= start);
  const days = lastTwoDays(picked);
  const spent = total(shown);

  const projectName = (id: string | null) => {
    if (!id) return "Not in a project";
    const m = modules.find((x) => x.id === id);
    return names[id] || m?.path?.join(" › ") || m?.name || "A removed project";
  };
  const threadName = (id: string | null) => (id ? convos.find((c) => c.id === id)?.title ?? "A conversation" : "Outside any conversation");

  const counts = { claude: calls(all.filter((u) => u.route === "claude")), codex: calls(all.filter((u) => u.route === "codex")) };
  const inProject = project === undefined ? shown : shown.filter((u) => u.module === project);
  const named = (list: Row[], name: (k: string | null) => string): Line[] =>
    list.map((row) => ({ key: row.key ?? "", name: name(row.key), spend: row.spend, unpriced: row.unpriced, cells: [...(by === "projects" ? [row.threads] : []), row.calls, tokens(row.tokens)] }));
  const lines = by === "projects" ? named(rank(shown, (u) => u.module), projectName) : by === "conversations" ? named(rank(inProject, (u) => u.thread), threadName) : agentLines(agents, shown);
  const heads = by === "projects" ? ["Project", "Conversations", "Calls", "Tokens"] : by === "conversations" ? ["Conversation", "Calls", "Tokens"] : ["Agent", "Runs", "Per run"];
  const unpriced = calls(shown.filter((u) => u.cost === null));
  const pickRoute = (next: "all" | Route) => { setRoute(next); setModel("all"); };

  return (
    <SectionCard title="Models" info="What Alpha's model calls cost, answers and background work alike, by assistant, model, project, conversation and agent. The price is the tool's own estimate of what the API would charge; ChatGPT through Codex gives none.">
      {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load spend: {error}</Trouble> : null}
      <div className="spend__bar">
        <Toggle<"all" | Route>
          inBody
          label="Assistant"
          value={route}
          onChange={pickRoute}
          items={[{ id: "all", label: "All" }, { id: "claude", label: "Claude", count: counts.claude }, { id: "codex", label: "ChatGPT", count: counts.codex }]}
        />
        <Dropdown size="sm" label="Range" value={range} options={RANGES} onChange={(v) => setRange(v)} />
      </div>
      {models.length > 1 ? (
        <div className="spend__bar">
          <Toggle<string>
            inBody
            label="Model"
            value={model}
            onChange={setModel}
            items={[{ id: "all", label: "All models" }, ...models.map((m) => { const [r, name] = (m.key ?? ":").split(":"); return { id: m.key ?? "", label: modelName(name || null, (r || null) as Route | null), count: m.calls }; })]}
          />
        </div>
      ) : null}
      {!rows && !error ? <p className="faint">Loading spend…</p> : null}
      {rows ? (
        <>
          <div className="spend__tiles">
            <MetricTile label="Spent" value={money(spent)} basis={`${plural(calls(shown), "call")} · API-equivalent estimate${unpriced ? ` · ${unpriced} without a price` : ""}`} />
            <Billed claude={claude} spent={total(shown.filter((a) => a.route === "claude"))} />
            <MetricTile
              label="Today"
              value={money(days.today)}
              basis={`Yesterday ${money(days.yesterday)}`}
              attention={days.yesterday > 0 && days.today >= SPIKE * days.yesterday}
              change={days.yesterday > 0 && days.today >= SPIKE * days.yesterday ? `${(days.today / days.yesterday).toFixed(1)}× yesterday` : undefined}
            />
          </div>
          <Budget client={client} today={lastTwoDays(all).today} />
          <div className="spend__bar">
            <Tabs<By>
              label="Group by"
              value={by}
              onChange={(next) => { setBy(next); setProject(undefined); }}
              items={[{ id: "projects", label: "Projects" }, { id: "conversations", label: "Conversations" }, { id: "agents", label: "Agents" }]}
            />
            {by === "conversations" && project !== undefined ? (
              <Button size="sm" variant="ghost" onClick={() => setProject(undefined)}>
                All projects
              </Button>
            ) : null}
          </div>
          {by === "conversations" && project !== undefined ? <p className="faint">{projectName(project)}</p> : null}
          <SpendTable
            lines={lines}
            heads={heads}
            onOpen={by === "projects" ? (key) => { setProject(key || null); setBy("conversations"); } : undefined}
          />
        </>
      ) : null}
    </SectionCard>
  );
}

interface Line {
  key: string;
  name: string;
  /** After the name: an agent's last verdict. */
  badge?: ReactNode;
  spend: number;
  /** Calls with no price, whose spend isn't in `spend`. */
  unpriced?: number;
  cells: ReactNode[];
}

/** Each agent's runs and what they cost: the calls in its own conversation (an automation runs
 *  in one thread; a run is one turn and the checks on it), with its last verdict, judged by code.
 *  Agents that never called a model are left out. */
function agentLines(agents: Automation[], shown: Use[]): Line[] {
  return agents
    .flatMap((a) => {
      const mine = shown.filter((x) => x.thread && x.thread === a.thread);
      if (!mine.length) return [];
      const spend = total(mine);
      const tone = a.last_verdict === "succeeded" ? "good" : a.last_verdict === "failed" ? "bad" : "warn";
      const runs = new Set(mine.map((x) => x.turn)).size;
      return [{ key: a.id, name: a.title, spend, unpriced: calls(mine.filter((x) => x.cost === null)), badge: a.last_verdict ? <Badge tone={tone}>{a.last_verdict}</Badge> : undefined, cells: [runs, money(spend / runs)] }];
    })
    .sort((x, y) => y.spend - x.spend);
}

/** The ranked list (SuperPenguin's shape): rank, name with its share as a bar, spend, counts. */
function SpendTable({ lines, heads, onOpen }: { lines: Line[]; heads: string[]; onOpen?: (key: string) => void }) {
  if (!lines.length) return <p className="faint">No answers in this range</p>;
  const top = Math.max(...lines.map((l) => l.spend), 0.0001);
  return (
    <div className="spend__scroll">
      <table className="spend">
        <thead>
          <tr>
            <th className="spend__n">#</th>
            <th>{heads[0]}</th>
            <th className="spend__num">Spend</th>
            {heads.slice(1).map((h) => <th key={h} className="spend__num">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key || `none-${i}`}>
              <td className="spend__n">{i + 1}</td>
              <td>
                <span className="spend__head">
                  {onOpen ? (
                    <button type="button" className="spend__name" onClick={() => onOpen(l.key)}>
                      {l.name}
                    </button>
                  ) : (
                    <span className="spend__name">{l.name}</span>
                  )}
                  {l.badge}
                </span>
                <span className="spend__track" aria-hidden="true">
                  <span className="spend__fill" style={{ width: `${(l.spend / top) * 100}%` }} />
                </span>
              </td>
              <td className="spend__num">{l.unpriced ? <Tooltip text={`${plural(l.unpriced, "call")} without a price, not in this amount`}><span>{money(l.spend)}+</span></Tooltip> : money(l.spend)}</td>
              {l.cells.map((c, j) => <td key={j} className="spend__num">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What was charged, beside the estimate: on a Claude subscription the plan covers it; with an
 *  API key the estimate is the bill. Read from today's sign-in, not from when each answer ran. */
function Billed({ claude, spent }: { claude: ClaudeStatus | null; spent: number }) {
  if (!claude?.signed_in) return <MetricTile label="Billed" value="" basis="Claude isn't signed in, so how it is paid is unknown" />;
  return claude.via === "subscription" ? (
    <MetricTile label="Billed" value={money(0)} basis={`Covered by your ${claude.plan ?? "Claude"} plan`} />
  ) : (
    <MetricTile label="Billed" value={money(spent)} basis="Charged to your API key" />
  );
}

/** A daily amount to stay under: crossing it says so here and stops nothing. */
function Budget({ client, today }: { client: Client; today: number }) {
  const [budget, change] = usePreference<number | null>(client, PREF.dailyBudget, null);
  const [draft, setDraft] = useState<number | null>(budget);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setDraft(budget), [budget]);
  const over = typeof budget === "number" && budget > 0 && today > budget;
  return (
    <ListRow
      title={<>Daily budget <InfoTip text="A warning only: crossing it shows here and stops nothing." /></>}
      description={over ? <span className="lrow__warn">Today {money(today)} is over your {money(budget)} budget</span> : typeof budget === "number" ? `${money(today)} of ${money(budget)} today` : "None"}
      controls={
        <>
          <NumberField className="textfield spend__budget" label="Daily budget in dollars" unit="USD" value={draft} onChange={setDraft} />
          <Button size="sm" variant="primary" aria-label="Save the daily budget" disabled={draft === budget} onClick={() => void change(draft).then(setProblem)}>
            Save
          </Button>
        </>
      }
    >
      {problem ? <Notice tone="bad">{problem}</Notice> : null}
    </ListRow>
  );
}
