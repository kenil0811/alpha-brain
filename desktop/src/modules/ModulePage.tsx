/**
 * A project's page (9 Oct, the UI rulebook §5, §8; "module" in the code). The header holds the
 * breadcrumb on the left and, when it has several collections, a switch of them in the centre
 * (its name in serif when it has one). It lands on the first collection's data, never on a
 * description; its numbers sit above it as the metrics strip. Below the data, as the page
 * scrolls: Files, Intelligence (activity, agents and automations), then Governance (where its
 * data lives, settings, Always and Never). A project with no collection yet shows one empty table,
 * never an empty screen. Files can be dropped anywhere on the page. (Vikas, 9 Oct: this undoes
 * the header tabs for Files, Intelligence and Governance; a remembered "@…" tab falls back to the
 * first collection.)
 */
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Client, ModuleCard, ModuleDetail, TableSummaryData } from "../core/client";
import { dedupeCrumbs } from "./crumbs";
import { DataPage } from "./DataPage";
import { RecordPage } from "./RecordPage";
import { FilesSection, GovernanceSection, IntelligenceSection, type AddedFile } from "./ModuleSections";
import { SimpleTable } from "./NewProjectPage";
import type { Surface } from "../shell/Rail";
import { Breadcrumb, HeaderSwitch, Notice, PageHeader, Trouble, type Crumb } from "../ui";
import { ICON_SM, Table2 } from "../ui/icons";

export function ModulePage({ client, moduleId, version, onChanged, onGo, onSay, onAsk, onOpenRecord, modules = [] }: { client: Client; moduleId: string; version: number; onChanged: () => void; onGo: (s: Surface) => void; onSay?: (sentence: string) => void; onAsk?: (sentence: string) => void; onOpenRecord?: (table: string, id: string) => void; modules?: ModuleCard[] }) {
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TableSummaryData[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedFile[]>([]);
  // Files come in by Upload (the Mac's picker) or by dropping them anywhere on
  // the page; both take the same route (3 Oct: with only the drop, an empty attachments table
  // had no visible way in).
  const picker = useRef<HTMLInputElement>(null);
  async function addFiles(files: File[]) {
    if (!files.length) return;
    try {
      const out = await client.addFiles(files, { module: moduleId });
      // the core answers with one document per file, in order
      setAdded((now) => [...out.documents.map((doc, i) => ({ doc, file: files[i] })), ...now]);
      setDropNote(`Uploaded ${out.documents.map((d) => d.title).join(", ")}. Alpha is reading ${files.length === 1 ? "it" : "them"}.`);
      onChanged();
    } catch (err) {
      setDropNote(`Couldn't upload ${files.map((f) => f.name).join(", ")}: ${err instanceof Error ? err.message : String(err)}`);
    }
    window.setTimeout(() => setDropNote(null), 6000);
  }
  async function dropped(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    await addFiles(Array.from(e.dataTransfer.files ?? []));
  }
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
  // lands on data: the remembered collection if it is still there, else the first
  const table = detail.tables.find((t) => t.name === tab) ?? detail.tables[0] ?? null;
  const several = detail.tables.length > 1;
  const crumbs: Crumb[] = dedupeCrumbs([...(detail.path ?? []).slice(0, -1).map((name, i) => ({ label: name, onClick: () => onGo({ kind: "module", id: pathIds[i] }) })), { label: detail.name }]);
  // with one collection or none the name is the title, so the breadcrumb holds only where it sits
  const where = several ? crumbs : crumbs.slice(0, -1).filter((c) => c.label !== detail.name);
  return (
    <div className={dragging ? "modpage page--drop" : "modpage"} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(e) => void dropped(e)}>
      <PageHeader
        left={where.length ? <Breadcrumb items={where} /> : undefined}
        centre={several && table ? <HeaderSwitch label="Collections" value={table.name} onChange={setTab} items={detail.tables.map((t) => ({ id: t.name, label: t.title, icon: <Table2 size={ICON_SM} /> }))} /> : undefined}
        title={several ? undefined : detail.name}
      />
      <input ref={picker} type="file" multiple style={{ display: "none" }} aria-hidden="true" tabIndex={-1} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(files); }} />
      <div className="page page--wide modpage__body">
        {dragging ? <div className="dropnote">Drop to upload to {detail.name}</div> : null}
        {dropNote ? <Notice tone={dropNote.startsWith("Couldn") ? "bad" : "ok"}>{dropNote}</Notice> : null}
        {table ? (
          <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} onSay={onSay} onAsk={onAsk} onOpenRecord={onOpenRecord} onAddFiles={() => picker.current?.click()} summary={summary.find((s) => s.name === table.name) ?? null} renderPeek={(t, id, onGuard) => <RecordPage key={`${t}/${id}`} client={client} module={moduleId} table={t} id={id} version={version} modules={modules} onGo={onGo} onChanged={onChanged} onAsk={onAsk} onGuard={onGuard} />} />
        ) : (
          <SimpleTable label={`${detail.name}'s first table`} columns={["Name"]} addReason="There's no table here yet to add to." note="Alpha fills this in as the project is built: ask in the panel, or upload files." />
        )}
        <FilesSection added={added} onPick={() => picker.current?.click()} />
        <IntelligenceSection client={client} detail={detail} version={version} onChanged={onChanged} onGo={(id) => onGo({ kind: "module", id })} />
        <GovernanceSection client={client} detail={detail} modules={modules} onChanged={onChanged} />
      </div>
    </div>
  );
}
