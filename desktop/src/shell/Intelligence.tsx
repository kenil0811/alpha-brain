/**
 * Intelligence: everything Alpha knows and can do across modules (the UI rulebook §12). One page
 * with a centred switch in its header: **Second Brain** (facts, goals, instructions, notes),
 * **Agents** (Alpha and each module's runner), **Automations** (what runs on its own),
 * **Skills** (what Alpha can do), **Connections** (what it can reach), **Activity** (what it did)
 * and **Map**. Each is a sentence the person can read, switch or correct, never a form.
 * (9 Oct, the pages phase: the switch moved into the header; Knowledge became Second Brain;
 * Agents and Activity joined.)
 */
import { useEffect, useState } from "react";
import type { Client, Intelligence as Data, Skill } from "../core/client";
import { humanize, when } from "../modules/format";
import { Activity } from "./Activity";
import { agentsFrom } from "./agents";
import { AutomationList } from "./Automations";
import { Connections } from "./Connections";
import { WorkMap } from "./map/WorkMap";
import { ModuleGlyph } from "./moduleIcons";
import { OpenCard } from "./OpenCard";
import type { Surface } from "./Rail";
import { SecondBrain } from "./SecondBrain";
import { Badge, EmptyCard, HeaderSwitch, ListRow, PageHeader, Trouble, type HeaderSwitchItem } from "../ui";
import { ActivityIcon, AgentIcon, BrainIcon, ConnectionIcon, ICON, ICON_SM, MapIcon, SkillIcon, Zap } from "../ui/icons";

export type IntelTab = "second-brain" | "agents" | "automations" | "skills" | "connections" | "activity" | "map";
const TABS: HeaderSwitchItem<IntelTab>[] = [
  { id: "second-brain", label: "Second Brain", icon: <BrainIcon size={ICON_SM} /> },
  { id: "agents", label: "Agents", icon: <AgentIcon size={ICON_SM} /> },
  { id: "automations", label: "Automations", icon: <Zap size={ICON_SM} /> },
  { id: "skills", label: "Skills", icon: <SkillIcon size={ICON_SM} /> },
  { id: "connections", label: "Connections", icon: <ConnectionIcon size={ICON_SM} /> },
  { id: "activity", label: "Activity", icon: <ActivityIcon size={ICON_SM} /> },
  { id: "map", label: "Map", icon: <MapIcon size={ICON_SM} /> },
];

/** An address from before the rename ("knowledge") or one nobody knows opens Second Brain. */
export function intelTab(tab: string | undefined): IntelTab {
  return TABS.find((t) => t.id === tab)?.id ?? "second-brain";
}

const KIND_LABEL: Record<Skill["kind"], string> = { read: "Reads", act: "Does", run: "Runs" };

function SkillRow({ skill, modules, onOpen }: { skill: Skill; modules: Record<string, string>; onOpen?: () => void }) {
  const where = skill.site ?? (skill.module ? modules[skill.module] ?? "a module" : "");
  const health = skill.health === "ok" ? "Working" : skill.health === "broken" ? "Being repaired" : "Not tried yet";
  return (
    <ListRow
      icon={<SkillIcon size={ICON} />}
      title={skill.description}
      onOpen={onOpen}
      description={[KIND_LABEL[skill.kind], where, `version ${skill.version}`, skill.last_run_at ? `last ${skill.kind === "read" ? `read ${skill.last_count ?? 0} records` : "run"} ${when(skill.last_run_at)}` : ""].filter(Boolean).join(" · ")}
      controls={<Badge tone={skill.health === "ok" ? "good" : skill.health === "broken" ? "bad" : "gray"}>{health}</Badge>}
    >
      {skill.last_problem ? <p className="notice lrow__problem">{skill.last_problem}</p> : null}
    </ListRow>
  );
}

function Agents({ data, modules, onGo }: { data: Data; modules: Record<string, string>; onGo?: (s: Surface) => void }) {
  const agents = agentsFrom(data, modules);
  return (
    <div className="modgrid">
      {agents.map((a) => (
        <OpenCard
          key={a.id}
          icon={a.module ? <ModuleGlyph id={a.module} size={ICON} /> : <AgentIcon size={ICON} />}
          name={a.name}
          description={a.description}
          meta={`${a.skills.length} ${a.skills.length === 1 ? "skill" : "skills"} · ${a.automations.length} ${a.automations.length === 1 ? "automation" : "automations"}`}
          onOpen={() => onGo?.({ kind: "agent", id: a.id })}
        />
      ))}
    </div>
  );
}

export function Intelligence({ client, tab, version, onTab, onChanged, onGo, onAsk }: { client: Client; tab: string; version: number; onTab: (t: IntelTab) => void; onChanged: () => void; onGo?: (s: Surface) => void; onAsk?: (text: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [modules, setModules] = useState<Record<string, string>>({});
  const current = intelTab(tab);
  useEffect(() => {
    let live = true;
    client
      .intelligence()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    client
      .modules()
      .then((list) => live && setModules(Object.fromEntries(list.map((m) => [m.id, m.name]))))
      .catch(() => live && setModules({}));
    return () => {
      live = false;
    };
  }, [client, version, tick]);
  const retry = () => setTick((n) => n + 1);
  const fails = (
    <Trouble onRetry={retry}>Couldn't load Intelligence: {error}</Trouble>
  );
  const loading = <p className="faint">Loading Intelligence…</p>;
  const body = (() => {
    if (current === "activity") return <Activity client={client} version={version} onChanged={onChanged} />;
    if (current === "map") return <WorkMap client={client} onGo={onGo} />;
    if (!data) return error ? fails : loading;
    switch (current) {
      case "second-brain":
        return <SecondBrain client={client} data={data} onChanged={onChanged} onAsk={onAsk} />;
      case "agents":
        return <Agents data={data} modules={modules} onGo={onGo} />;
      case "automations":
        return <AutomationList client={client} items={data.automations} onChanged={onChanged} onOpen={onGo ? (id) => onGo({ kind: "automation", id }) : undefined} empty="Ask Alpha to keep something current (“keep my LinkedIn connections up to date”) and it appears here as a sentence with a switch." />;
      case "skills":
        return (
          <div className="stack stack--wide">
            {data.skills.length ? (
              <div className="card lrows">
                {data.skills.map((s) => (
                  <SkillRow key={s.name} skill={s} modules={modules} onOpen={onGo ? () => onGo({ kind: "skill", name: s.name }) : undefined} />
                ))}
              </div>
            ) : (
              <EmptyCard icon={<SkillIcon size={ICON} />} title="No skills yet">When Alpha reads a list, does a task on a site, or runs something on its own, it keeps how it did it here, versioned and repaired when a site changes.</EmptyCard>
            )}
            {data.hands.length ? (
              <>
                <h2 className="sectitle">Built in</h2>
                <div className="card lrows">
                  {data.hands.map((h) => (
                    <ListRow key={h.name} icon={<SkillIcon size={ICON} />} title={h.title} description={h.description ?? undefined} controls={<Badge tone="gray">Built in</Badge>}>
                      <div className="lrow__desc">
                        {h.tools.map((t) => humanize(t.name) + (t.effect === "write" ? " (asks first)" : "")).join(" · ")}
                      </div>
                    </ListRow>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        );
      case "connections":
        return <Connections client={client} data={data} onChanged={onChanged} />;
    }
  })();
  return (
    <>
      <PageHeader centre={<HeaderSwitch label="Intelligence" items={TABS} value={current} onChange={onTab} />} />
      <div className={`page ${current === "map" ? "page--wide" : "page--column"}`}>{body}</div>
    </>
  );
}
