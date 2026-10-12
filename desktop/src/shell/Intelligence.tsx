/**
 * Intelligence: everything Alpha knows and can do across projects (the UI rulebook §12). One page
 * with a centred switch in its header: **Second Brain** (the brain in an egg, with the Map as its
 * second view), **Agents and automations** (one list since 9 Oct, the owner: Alpha is one agent
 * among them; Q33: every automation is an agent's process, with a goal and a verdict per run,
 * each wearing its companion's face; one New in the toolbar asks Alpha, which picks agent or automation), **Skills** (the
 * built-in ones open a page of their own too) and **Connections**. (9 Oct: Knowledge became Second Brain; later
 * the same day Map moved under Second Brain and Activity left the switch for the bell. The old
 * addresses still open: `map` opens Second Brain, `activity` still draws Activity here.)
 * Agents, Automations, Skills and Connections are each the one data view (`intel/sources.ts`):
 * views, filters, the person's own lists; a row's click opens its page.
 */
import { useEffect, useMemo, useState } from "react";
import { say } from "../core/client";
import type { Client, Intelligence as Data } from "../core/client";
import { DataFrame } from "../modules/DataFrame";
import { DataPage } from "../modules/DataPage";
import { Activity } from "./Activity";
import { Connections } from "./Connections";
import { newAgentOrAutomation, useDescribe } from "./DescribeAdd";
import { AGENT_ROW, automationsSource, skillsSource } from "./intel/sources";
import type { Surface } from "./Rail";
import { SecondBrain } from "./SecondBrain";
import { HeaderSwitch, PageHeader, SectionCard, Trouble, type HeaderSwitchItem } from "../ui";
import { AgentIcon, BrainIcon, ConnectionIcon, ICON_SM, PlusIcon, SkillIcon } from "../ui/icons";
import { SUBTITLES } from "../ui/subtitles";

export type IntelTab = "second-brain" | "agents" | "skills" | "connections" | "activity" | "map";
const TABS: HeaderSwitchItem<IntelTab>[] = [
  { id: "second-brain", label: "Second Brain", icon: <BrainIcon size={ICON_SM} />, hint: SUBTITLES.secondBrain },
  { id: "agents", label: "Agents and automations", icon: <AgentIcon size={ICON_SM} />, hint: SUBTITLES.agents },
  { id: "skills", label: "Skills", icon: <SkillIcon size={ICON_SM} />, hint: SUBTITLES.skills },
  { id: "connections", label: "Connections", icon: <ConnectionIcon size={ICON_SM} />, hint: SUBTITLES.connections },
];

/** An address from before the rename ("knowledge") or one nobody knows opens Second Brain. */
export function intelTab(tab: string | undefined): IntelTab {
  if (tab === "activity" || tab === "map") return tab;
  if (tab === "automations") return "agents"; // since Q33 an automation is an agent
  return TABS.find((t) => t.id === tab)?.id ?? "second-brain";
}

export function Intelligence({ client, tab, version, onTab, onChanged, onGo, onAsk }: { client: Client; tab: string; version: number; onTab: (t: IntelTab) => void; onChanged: () => void; onGo?: (s: Surface) => void; onAsk?: (text: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [modules, setModules] = useState<Record<string, string>>({});
  const current = intelTab(tab);
  const describe = useDescribe();
  // Stable per client and module names, so a data view reloads on `version`, not on every render.
  const sources = useMemo(() => ({ agents: automationsSource(client, modules), skills: skillsSource(client, modules) }), [client, modules]);
  useEffect(() => {
    let live = true;
    client
      .intelligence()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
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
    if (current === "activity") return <Activity client={client} version={version} onChanged={onChanged} onOpen={onGo ? (id) => onGo({ kind: "entry", id }) : undefined} />;
    if (!data) return error ? fails : loading;
    switch (current) {
      case "second-brain":
      case "map":
        return <SecondBrain client={client} data={data} version={version} onChanged={onChanged} onAsk={onAsk} onGo={onGo} />;
      case "agents":
        return (
          <>
            <DataPage client={client} source={sources.agents} version={version} onChanged={onChanged} onAsk={onAsk} actions={[{ label: "New", icon: <PlusIcon size={ICON_SM} />, onSelect: () => describe.open(newAgentOrAutomation()) }]} onOpenRecord={(_k, id) => onGo?.(id.startsWith(AGENT_ROW) ? { kind: "agent", id: id.slice(AGENT_ROW.length) } : { kind: "automation", id })} />
            {describe.dialog}
          </>
        );
      case "skills":
        return <DataPage client={client} source={sources.skills} version={version} onChanged={onChanged} onAsk={onAsk} onOpenRecord={(_k, id) => onGo?.({ kind: "skill", name: id })} />;
      case "connections":
        return <Connections client={client} data={data} version={version} onChanged={onChanged} onOpen={onGo ? (id) => onGo({ kind: "connection", id }) : undefined} />;
    }
  })();
  const shown = current === "map" ? "second-brain" : current;
  // no subtitle under the switch (rule 28): each tab's plain words are its tooltip and description
  const header = <PageHeader centre={<HeaderSwitch label="Intelligence" items={TABS} value={shown} onChange={onTab} />} />;
  // A list (agents, skills, connections) is a table page like any project's: the one layout, the
  // table over the first screen, then Files, Intelligence (what Alpha did) and Governance (9 Oct, the owner).
  if (data && (current === "agents" || current === "skills" || current === "connections")) {
    return (
      <DataFrame
        client={client}
        scope={`intelligence.${current}`}
        name="Intelligence"
        onChanged={onChanged}
        header={header}
        data={() => body}
        intelligence={
          <SectionCard title="Intelligence" info="Everything Alpha did and you did, newest first.">
            <Activity client={client} version={version} onChanged={onChanged} onOpen={onGo ? (id) => onGo({ kind: "entry", id }) : undefined} />
          </SectionCard>
        }
      />
    );
  }
  return (
    <>
      {header}
      <div className={`page ${current === "activity" ? "page--column" : "page--wide"}`}>
        {body}
      </div>
    </>
  );
}
