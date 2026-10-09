/**
 * A module's page (9 Oct, the UI rulebook §5, §8). The header holds the breadcrumb on the left
 * and, in the centre, a switch with one tab per collection, then Files, Intelligence and
 * Governance (rulebook §5, fixed rule 19: one section fills the screen, nothing stacked below the
 * table). It lands on the first collection's data, never on a description; its numbers sit above
 * it as the metrics strip. The remembered tab is a collection's name or one of the `@` ids below,
 * which no collection name can take. Files can be dropped anywhere on the page, whatever the tab.
 */
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Client, ModuleCard, ModuleDetail, TableSummaryData } from "../core/client";
import { DataPage } from "./DataPage";
import { RecordPage } from "./RecordPage";
import { FilesSection, GovernanceSection, IntelligenceSection, type AddedFile } from "./ModuleSections";
import type { Surface } from "../shell/Rail";
import { Breadcrumb, EmptyCard, HeaderSwitch, Notice, PageHeader, Trouble, type Crumb } from "../ui";
import { FolderOpen, ICON, ICON_SM, IntelligenceIcon, PermissionIcon, Table2 } from "../ui/icons";

/** The sections after the collections, in the rulebook's order; `@` keeps them apart from collection names. */
const SECTIONS = [
  { id: "@files", label: "Files", icon: <FolderOpen size={ICON_SM} /> },
  { id: "@intelligence", label: "Intelligence", icon: <IntelligenceIcon size={ICON_SM} /> },
  { id: "@governance", label: "Governance", icon: <PermissionIcon size={ICON_SM} /> },
];

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
        <div className="page">{error ? <Trouble onRetry={() => void load()}>Couldn't load this module: {error}</Trouble> : <p className="muted">Loading {modules.find((m) => m.id === moduleId)?.name ?? "this module"}…</p>}</div>
      </>
    );
  }
  // lands on data: the remembered tab if it is still there, else the first collection (Files when there is none)
  const section = SECTIONS.find((s) => s.id === tab)?.id ?? (detail.tables.length ? null : "@files");
  const table = section ? null : (detail.tables.find((t) => t.name === tab) ?? detail.tables[0]);
  const crumbs: Crumb[] = [...(detail.path ?? []).slice(0, -1).map((name, i) => ({ label: name, onClick: () => onGo({ kind: "module", id: pathIds[i] }) })), { label: detail.name }];
  return (
    <div className={dragging ? "modpage page--drop" : "modpage"} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(e) => void dropped(e)}>
      {/* the switch always shows (a lone collection's tab is its title), so the breadcrumb always names the module */}
      <PageHeader left={<Breadcrumb items={crumbs} />} centre={<HeaderSwitch label="Sections" value={section ?? table!.name} onChange={setTab} items={[...detail.tables.map((t) => ({ id: t.name, label: t.title, icon: <Table2 size={ICON_SM} /> })), ...SECTIONS]} />} />
      <input ref={picker} type="file" multiple style={{ display: "none" }} aria-hidden="true" tabIndex={-1} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(files); }} />
      <div className="page page--wide modpage__body">
        {dragging ? <div className="dropnote">Drop to upload to {detail.name}</div> : null}
        {dropNote ? <Notice tone={dropNote.startsWith("Couldn") ? "bad" : "ok"}>{dropNote}</Notice> : null}
        {table ? (
          <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} onSay={onSay} onAsk={onAsk} onOpenRecord={onOpenRecord} onAddFiles={() => picker.current?.click()} summary={summary.find((s) => s.name === table.name) ?? null} renderPeek={(t, id, onGuard) => <RecordPage key={`${t}/${id}`} client={client} module={moduleId} table={t} id={id} version={version} modules={modules} onGo={onGo} onChanged={onChanged} onAsk={onAsk} onGuard={onGuard} />} />
        ) : section === "@files" ? (
          <>
            {detail.tables.length ? null : (
              <EmptyCard icon={<Table2 size={ICON} />} title="Nothing is kept here yet">
                Ask Alpha in the panel to set one up, or upload files.
              </EmptyCard>
            )}
            <FilesSection added={added} onPick={() => picker.current?.click()} />
          </>
        ) : section === "@intelligence" ? (
          <IntelligenceSection client={client} detail={detail} version={version} onChanged={onChanged} onGo={(id) => onGo({ kind: "module", id })} />
        ) : (
          <GovernanceSection client={client} detail={detail} modules={modules} onChanged={onChanged} />
        )}
      </div>
    </div>
  );
}
