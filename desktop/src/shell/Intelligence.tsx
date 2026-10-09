/**
 * Intelligence: everything Alpha knows and can do across modules (the UI rulebook §12). One page
 * with a centred switch in its header: **Second Brain** (the brain in an egg, with the Map as its
 * second view), **Agents** (Alpha and each module's runner, each wearing its companion's face),
 * **Automations**, **Skills** and **Connections**. (9 Oct: Knowledge became Second Brain; later
 * the same day Map moved under Second Brain and Activity left the switch for the bell. The old
 * addresses still open: `map` is Second Brain's Map view, `activity` still draws Activity here.)
 */
import { useEffect, useState } from "react";
import type { Client, Intelligence as Data, Skill } from "../core/client";
import { humanize, when } from "../modules/format";
import { Activity } from "./Activity";
import { agentsFrom } from "./agents";
import { AutomationList } from "./Automations";
import { Connections } from "./Connections";
import { AgentAvatar } from "./AgentAvatar";
import { OpenCard } from "./OpenCard";
import type { Surface } from "./Rail";
import { SecondBrain } from "./SecondBrain";
import { Badge, EmptyCard, HeaderSwitch, InfoTip, ListRow, PageHeader, Trouble, type HeaderSwitchItem } from "../ui";
import { AgentIcon, BrainIcon, ConnectionIcon, ICON, ICON_SM, SkillIcon, Zap } from "../ui/icons";

export type IntelTab = "second-brain" | "agents" | "automations" | "skills" | "connections" | "activity" | "map";
const TABS: HeaderSwitchItem<IntelTab>[] = [
  { id: "second-brain", label: "Second Brain", icon: <BrainIcon size={ICON_SM} /> },
  { id: "agents", label: "Agents", icon: <AgentIcon size={ICON_SM} /> },
  { id: "automations", label: "Automations", icon: <Zap size={ICON_SM} /> },
  { id: "skills", label: "Skills", icon: <SkillIcon size={ICON_SM} /> },
  { id: "connections", label: "Connections", icon: <ConnectionIcon size={ICON_SM} /> },
];

/** An address from before the rename ("knowledge") or one nobody knows opens Second Brain. */
export function intelTab(tab: string | undefined): IntelTab {
  if (tab === "activity" || tab === "map") return tab;
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
      description={[KIND_LABEL[skill.kind], where, skill.last_run_at ? when(skill.last_run_at) : ""].filter(Boolean).join(" · ")}
      controls={<Badge tone={skill.health === "ok" ? "good" : skill.health === "broken" ? "bad" : "gray"}>{health}</Badge>}
    >
      {skill.last_problem ? <p className="notice lrow__problem">{skill.last_problem}</p> : null}
    </ListRow>
  );
}

function Agents({ client, data, modules, onGo }: { client: Client; data: Data; modules: Record<string, string>; onGo?: (s: Surface) => void }) {
  const agents = agentsFrom(data, modules);
  return (
    <div className="modgrid">
      {agents.map((a) => (
        <OpenCard
          key={a.id}
          icon={<AgentAvatar client={client} agent={a.id} size={32} label={a.name} />}
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
    if (!data) return error ? fails : loading;
    switch (current) {
      case "second-brain":
      case "map":
        return <SecondBrain client={client} data={data} onChanged={onChanged} onAsk={onAsk} onGo={onGo} initialView={current === "map" ? "map" : undefined} />;
      case "agents":
        return <Agents client={client} data={data} modules={modules} onGo={onGo} />;
      case "automations":
        return <AutomationList client={client} items={data.automations} onChanged={onChanged} onOpen={onGo ? (id) => onGo({ kind: "automation", id }) : undefined} empty="Ask Alpha to keep something current." />;
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
              <EmptyCard icon={<SkillIcon size={ICON} />} title="No skills yet" />
            )}
            {data.hands.length ? (
              <>
                <h2 className="sectitle">Built in</h2>
                <div className="card lrows">
                  {data.hands.map((h) => (
                    <ListRow key={h.name} icon={<SkillIcon size={ICON} />} title={h.title} description={h.description ?? undefined} controls={<InfoTip text={h.tools.map((t) => humanize(t.name) + (t.effect === "write" ? " (asks first)" : "")).join(" · ")} />} />
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
      <PageHeader centre={<HeaderSwitch label="Intelligence" items={TABS} value={current === "map" ? "second-brain" : current} onChange={onTab} />} />
      <div className={`page ${current === "map" || current === "second-brain" ? "page--wide" : "page--column"}`}>{body}</div>
    </>
  );
}
