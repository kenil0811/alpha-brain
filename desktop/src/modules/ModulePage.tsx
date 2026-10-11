/**
 * A project's page (9 Oct, the UI rulebook §5, §8; "module" in the code). The header holds the
 * breadcrumb on the left and, when it has several collections, a switch of them in the centre
 * (its name in serif when it has one). It lands on the first collection's data, never on a
 * description; its numbers sit above it as the metrics strip. Below the data, as the page
 * scrolls: Files, Intelligence (activity, agents and automations), then Governance (Allowed and
 * Denied, where its data lives and where it sits). A project with no collection yet shows one empty table,
 * never an empty screen. Files can be dropped anywhere on the page. (Vikas, 9 Oct: this undoes
 * the header tabs for Files, Intelligence and Governance; a remembered "@…" tab falls back to the
 * first collection.)
 */
import { useEffect, useMemo, useState } from "react";
import type { Client, ModuleCard, ModuleDetail, TableSummaryData } from "../core/client";
import { dedupeCrumbs } from "./crumbs";
import { DataPage } from "./DataPage";
import { DataFrame } from "./DataFrame";
import { GovernanceSection, IntelligenceSection } from "./ModuleSections";
import { emptySource } from "./source";
import type { Surface } from "../shell/Rail";
import { Breadcrumb, HeaderSwitch, PageHeader, Trouble, type Crumb } from "../ui";
import { ICON_SM, Table2 } from "../ui/icons";

export function ModulePage({ client, moduleId, version, onChanged, onGo, onSay, onAsk, onOpenRecord, modules = [] }: { client: Client; moduleId: string; version: number; onChanged: () => void; onGo: (s: Surface) => void; onSay?: (sentence: string) => void; onAsk?: (sentence: string) => void; onOpenRecord?: (table: string, id: string) => void; modules?: ModuleCard[] }) {
  const [loaded, setDetail] = useState<ModuleDetail | null>(null);
  let detail = loaded;
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TableSummaryData[]>([]);
  const [tab, setTab] = useState<string>(() => {
    try {
      return localStorage.getItem(`alpha.module.${moduleId}.tab`) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`alpha.module.${moduleId}.tab`, tab);
    } catch {
      /* per-window convenience */
    }
  }, [moduleId, tab]);
  const load = () =>
    client
      .module(moduleId)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    void load();
    // the numbers above the table come from the module's summary (the core works them out)
    client.moduleSummary(moduleId).then((s) => setSummary(s.tables)).catch(() => setSummary([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, moduleId, version]);
  const empty = useMemo(() => emptySource(client, `empty:${moduleId}`, "First table", "Alpha fills this in as the project is built: ask in the panel, or upload files."), [client, moduleId]);

  // The ids behind the path's names, from the rail's cards (the page itself knows the names).
  const pathIds = useMemo(() => {
    const ids: string[] = [];
    let current = modules.find((m) => m.id === moduleId);
    while (current?.parent) {
      ids.unshift(current.parent);
      current = modules.find((m) => m.id === current?.parent);
    }
    return ids;
  }, [modules, moduleId]);

  if (!detail) {
    return (
      <>
        <PageHeader />
        <div className="page">{error ? <Trouble onRetry={() => void load()}>Couldn't load this project: {error}</Trouble> : <p className="muted">Loading {modules.find((m) => m.id === moduleId)?.name ?? "this project"}…</p>}</div>
      </>
    );
  }
  // the name the person gave it in the window, when they did (the sidebar's rename)
  const shownName = modules.find((m) => m.id === moduleId)?.name;
  if (shownName && shownName !== detail.name) detail = { ...detail, name: shownName, path: detail.path ? [...detail.path.slice(0, -1), shownName] : detail.path };
  const d = detail;
  // lands on data: the remembered collection if it is still there, else the first
  const table = d.tables.find((t) => t.name === tab) ?? d.tables[0] ?? null;
  const several = d.tables.length > 1;
  const crumbs: Crumb[] = dedupeCrumbs([...(d.path ?? []).slice(0, -1).map((name, i) => ({ label: name, onClick: () => onGo({ kind: "module", id: pathIds[i] }) })), { label: d.name }], several ? table?.title : undefined);
  // with one collection or none the name is the title, so the breadcrumb holds only where it sits
  const where = several ? crumbs : crumbs.slice(0, -1).filter((c) => c.label !== d.name);
  return (
    <DataFrame
      client={client}
      scope={d.id}
      name={d.name}
      module={moduleId}
      onChanged={onChanged}
      header={
        <PageHeader
          left={where.length ? <Breadcrumb items={where} /> : undefined}
          centre={several && table ? <HeaderSwitch label="Collections" value={table.name} onChange={setTab} items={d.tables.map((t) => ({ id: t.name, label: t.title, icon: <Table2 size={ICON_SM} /> }))} /> : undefined}
          title={several ? undefined : d.name}
        />
      }
      data={(upload) =>
        table ? (
          <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} onSay={onSay} onAsk={onAsk} onOpenRecord={(t, id) => onOpenRecord?.(t, id)} onAddFiles={upload} summary={summary.find((s) => s.name === table.name) ?? null} />
        ) : (
          <DataPage client={client} source={empty} version={version} onChanged={onChanged} onAsk={onAsk} onAddFiles={upload} onOpenRecord={() => undefined} />
        )
      }
      intelligence={<IntelligenceSection client={client} detail={d} version={version} onChanged={onChanged} onGo={onGo} />}
      governance={<GovernanceSection client={client} detail={d} modules={modules} onChanged={onChanged} />}
    />
  );
}
