/**
 * Intelligence: everything Alpha knows and can do across projects (the UI rulebook §12). One page
 * with a centred switch in its header: **Second Brain** (the brain in an egg, with the Map as its
 * second view), **Agents and automations** (one list since 9 Oct, the owner: Alpha is one agent
 * among them; Q33: every automation is an agent's process, with a goal and a verdict per run,
 * each wearing its companion's face; Add agent and Add automation ask Alpha), **Skills** (the
 * built-in ones open a page of their own too) and **Connections**. (9 Oct: Knowledge became Second Brain; later
 * the same day Map moved under Second Brain and Activity left the switch for the bell. The old
 * addresses still open: `map` is Second Brain's Map view, `activity` still draws Activity here.)
 * Agents, Automations, Skills and Connections are each the one data view (`intel/sources.ts`):
 * views, filters, the person's own lists; a row's click opens its page.
 */
import { useEffect, useMemo, useState } from "react";
import type { Client, Intelligence as Data } from "../core/client";
import { DataPage } from "../modules/DataPage";
import { Activity } from "./Activity";
import { Connections } from "./Connections";
import { DescribeAdd } from "./DescribeAdd";
import { AGENT_ROW, automationsSource, skillsSource } from "./intel/sources";
import type { Surface } from "./Rail";
import { SecondBrain } from "./SecondBrain";
import { HeaderSwitch, PageHeader, Trouble, type HeaderSwitchItem } from "../ui";
import { AgentIcon, BrainIcon, ConnectionIcon, ICON_SM, SkillIcon } from "../ui/icons";
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
    if (current === "activity") return <Activity client={client} version={version} onChanged={onChanged} onOpen={onGo ? (id) => onGo({ kind: "entry", id }) : undefined} />;
    if (!data) return error ? fails : loading;
    switch (current) {
      case "second-brain":
      case "map":
        return <SecondBrain client={client} data={data} version={version} onChanged={onChanged} onAsk={onAsk} onGo={onGo} initialView={current === "map" ? "map" : undefined} />;
      case "agents":
        return (
          <div className="stack stack--wide">
            <div className="intel__adds">
              <DescribeAdd thing="agent" />
              <DescribeAdd thing="automation" />
            </div>
            <DataPage client={client} source={sources.agents} version={version} onChanged={onChanged} onAsk={onAsk} onOpenRecord={(_k, id) => onGo?.(id.startsWith(AGENT_ROW) ? { kind: "agent", id: id.slice(AGENT_ROW.length) } : { kind: "automation", id })} />
          </div>
        );
      case "skills":
        return <DataPage client={client} source={sources.skills} version={version} onChanged={onChanged} onAsk={onAsk} onOpenRecord={(_k, id) => onGo?.({ kind: "skill", name: id })} />;
      case "connections":
        return <Connections client={client} data={data} version={version} onChanged={onChanged} onOpen={onGo ? (id) => onGo({ kind: "connection", id }) : undefined} />;
    }
  })();
  const shown = current === "map" ? "second-brain" : current;
  const subtitle = TABS.find((t) => t.id === shown)?.hint; // the active tab's plain subtitle (rulebook §2)
  return (
    <>
      <PageHeader centre={<HeaderSwitch label="Intelligence" items={TABS} value={shown} onChange={onTab} />} />
      <div className={`page ${current === "activity" ? "page--column" : "page--wide"}`}>
        {subtitle ? <p className="scard__sub intel__sub">{subtitle}</p> : null}
        {body}
      </div>
    </>
  );
}
