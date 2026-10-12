/**
 * The sections below a project's data, in the rulebook's order (9 Oct, the UI rulebook §5;
 * "module" in the code): Files, then Intelligence (what happened here, its agents and automations,
 * its goals, Alpha's page about it, its sub-projects, each a tab), then Governance (what Alpha
 * may and may not do here as Allowed and Denied tabs, then where its data lives and is read
 * from, and where it sits).
 * Each is a section card.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { UploadIcon as Upload } from "../ui/icons";
import { moduleWords, say } from "../core/client";
import type { Client, DocumentInfo, ModuleCard, ModuleDetail, Note, Source } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { ADD_GOAL, newAgentOrAutomation, useDescribe } from "../shell/DescribeAdd";
import { AGENT_ROW, goalsSource, projectAgentsSource, subProjectsSource } from "../shell/intel/sources";
import { DataPage } from "./DataPage";
import { NewAboveDialog } from "../shell/ModuleDialogs";
import type { Surface } from "../shell/Rail";
import { Badge, Button, Confirm, IconButton, InfoTip, ListRow, Menu, MenuHeading, MenuItem, Notice, SectionCard, Toggle, Tooltip, type Tone, type ToggleItem } from "../ui";
import { ActivityIcon, AgentIcon, Ban, Check, FileText, Flag, ICON, ICON_SM, ModuleIcon, PermissionIcon, PlusIcon, Table2, X } from "../ui/icons";
import { downloadText, parseCsv, toCsv } from "./csv";
import { humanize, recent, when } from "./format";

const word = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A file added in this visit: the document the core made, and the file itself (the core has no
 *  route that gives a document's content back, so a preview reads the file the person chose). */
export interface AddedFile {
  doc: DocumentInfo;
  file?: File;
  /** when it was added in this visit (the core gives documents no date) */
  at: string;
}

/** Files, always its own section: what was added in this visit, a CSV as a grid that can be
 *  edited and downloaded, or an empty space to drop files on. A drop anywhere on the page, or
 *  Upload (the Mac's picker), adds them. */
export function FilesSection({ added, onPick }: { added: AddedFile[]; onPick: () => void }) {
  return (
    <SectionCard
      title="Files"
      info="Alpha reads what you upload into this project's collections."
      actions={
        added.length ? (
          <Button size="sm" icon={<Upload size={ICON} />} onClick={onPick}>
            Upload
          </Button>
        ) : undefined
      }
    >
      {added.length ? (
        <div className="lrows">
          {added.map(({ doc, file, at }) => (
            <ListRow key={doc.id} icon={<FileText size={ICON} />} title={doc.title} description={<Tooltip text={recent(at).title}><span tabIndex={0}>Added {recent(at).text}</span></Tooltip>}>
              {file && /\.csv$/i.test(file.name) ? <CsvGrid file={file} /> : null}
            </ListRow>
          ))}
        </div>
      ) : (
        <div className="dropzone">
          Drop files here or{" "}
          <button type="button" className="linkbtn dropzone__pick" onClick={onPick}>
            Upload
          </button>
        </div>
      )}
    </SectionCard>
  );
}

/** A CSV file as a grid of cells the person can change; Download hands back the edited file.
 *  Saving into the world needs the core (no route takes a document's new content). */
function CsvGrid({ file }: { file: File }) {
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    file.text().then(
      (text) => live && setGrid(parseCsv(text)),
      (e: unknown) => live && setProblem(say(e)),
    );
    return () => {
      live = false;
    };
  }, [file]);
  if (problem) return <p className="faint">Couldn't read it: {problem}</p>;
  if (!grid) return null;
  const set = (r: number, c: number, v: string) => setGrid((g) => g!.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  // ponytail: every row is drawn; a very large CSV is slow here, page it if that bites
  return (
    <div className="csvgrid">
      <div className="csvgrid__scroll">
        <table className="table csvgrid__table">
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} className={r === 0 ? "csvgrid__head" : undefined}>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input value={cell} aria-label={`Row ${r + 1}, column ${c + 1}`} onChange={(e) => set(r, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="csvgrid__bar">
        <Button size="sm" onClick={() => downloadText(file.name, toCsv(grid))}>
          Download
        </Button>
        <Button size="sm" disabledReason="Saving back into Alpha can't be done from here yet. Download keeps your edits.">
          Save
        </Button>
      </div>
    </div>
  );
}

const PAGE = 10;

/** Everything that happened in this project, newest first: what you did, what Alpha did, what
 *  it read, what you asked and what it answered. */
function ModuleActivity({ detail }: { detail: ModuleDetail }) {
  const [shown, setShown] = useState(PAGE);
  const rows = detail.activity;
  if (!rows.length) return <p className="faint">Nothing has happened here yet.</p>;
  const label = (e: ModuleDetail["activity"][number]) =>
    e.kind === "failed" ? { tone: "bad" as const, words: "Failed" }
    : e.kind === "said" ? { tone: "gray" as const, words: "You said" }
    : e.kind === "replied" ? { tone: "info" as const, words: "Alpha said" }
    : e.kind === "asked" || e.kind === "proposed" ? { tone: "warn" as const, words: "Asked" }
    : e.actor === "person" ? { tone: "gray" as const, words: "You" }
    : e.kind === "saw" ? { tone: "info" as const, words: "Read" }
    : { tone: "good" as const, words: "Alpha" };
  return (
    <div className="stack">
      <div className="list" aria-label="Everything that happened here">
        {rows.slice(0, shown).map((e) => {
          const b = label(e);
          return (
            <div key={e.id} className="item item--top">
              <span className="item__when">{when(e.at)}</span>
              <Badge tone={b.tone}>{b.words}</Badge>
              <div className="item__body activity__text">{e.text}</div>
            </div>
          );
        })}
      </div>
      {rows.length > shown ? (
        <Button size="sm" style={{ alignSelf: "flex-start" }} onClick={() => setShown((n) => n + PAGE)}>
          Show more ({rows.length - shown} earlier)
        </Button>
      ) : null}
    </div>
  );
}

/** The project's page of Alpha's wiki: what it is for, what it holds, what was tried, what is
 *  open; Alpha writes it and the person may edit it. */
function ModulePageCard({ client, moduleRef, version, onChanged }: { client: Client; moduleRef: string; version: number; onChanged: () => void }) {
  const [page, setPage] = useState<{ name: string; scope: string; page: Note | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  useEffect(() => {
    let live = true;
    client
      .modulePage(moduleRef)
      .then((p) => {
        if (!live) return;
        setPage(p);
        if (!editing) setBody(p.page?.body ?? "");
      })
      .catch(() => live && setPage(null));
    return () => {
      live = false;
    };
  }, [client, moduleRef, version, editing]);
  if (!page) return null;
  const save = () =>
    void client.writeNote(page.scope, page.name, body, page.page?.summary ?? undefined).then(() => {
      setEditing(false);
      onChanged();
    });
  return (
    <div className="subsec">
      <div className="subsec__head">
        <InfoTip text="What this project is for, what it holds, what is open. Alpha writes it; you can edit it." />
        <span className="section__right">
          {editing ? (
            <>
              <Button size="sm" variant="primary" onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBody(page.page?.body ?? ""); }}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              {page.page ? "Edit" : "Write"}
            </Button>
          )}
        </span>
      </div>
      {editing ? (
        <textarea className="note__edit" rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Edit the page about ${page.name}`} />
      ) : page.page ? (
        <div className="people__page">{page.page.body}</div>
      ) : (
        <p className="faint">No page yet.</p>
      )}
    </div>
  );
}

type IntelTab = "activity" | "agents" | "goals" | "page" | "inside";

export function IntelligenceSection({ client, detail, version, onChanged, onGo }: { client: Client; detail: ModuleDetail; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [tab, setTab] = useState<IntelTab>("activity");
  const inside = detail.inside ?? [];
  const describe = useDescribe();
  // a list here is the one data view (12 Oct, the owner), rebuilt when the project's detail changes
  const sources = useMemo(() => ({ goals: goalsSource(client, "project.goals", () => detail.goals), agents: projectAgentsSource(client, detail), inside: subProjectsSource(client, detail.inside ?? []) }), [client, detail]);
  const tabs: ToggleItem<IntelTab>[] = [
    { id: "activity", label: "Activity", icon: <ActivityIcon size={ICON_SM} /> },
    // Alpha, the assistant that works here, is the first agent
    { id: "agents", label: "Agents and automations", icon: <AgentIcon size={ICON_SM} />, count: detail.automations.length + 1 },
    { id: "goals", label: "Goals", icon: <Flag size={ICON_SM} />, count: detail.goals.length || undefined },
    { id: "page", label: "Alpha's page", icon: <FileText size={ICON_SM} /> },
    ...(inside.length ? [{ id: "inside" as const, label: "Sub-projects", icon: <ModuleIcon size={ICON_SM} />, count: inside.length }] : []),
  ];
  return (
    <SectionCard title="Intelligence">
      <Toggle inBody label="Intelligence" items={tabs} value={tab} onChange={setTab} />
      {tab === "page" ? <ModulePageCard client={client} moduleRef={detail.id} version={version} onChanged={onChanged} /> : null}
      {tab === "activity" ? <ModuleActivity detail={detail} /> : null}
      {tab === "goals" ? <DataPage client={client} source={sources.goals} version={version} onChanged={onChanged} actions={[{ label: "Add goal", icon: <PlusIcon size={ICON_SM} />, onSelect: () => describe.open({ ...ADD_GOAL, ask: (t) => `In ${detail.name}, add a goal: ${t}` }) }]} onOpenRecord={() => onGo({ kind: "module", id: detail.id })} /> : null}
      {tab === "agents" ? <DataPage client={client} source={sources.agents} version={version} onChanged={onChanged} actions={[{ label: "New", icon: <PlusIcon size={ICON_SM} />, onSelect: () => describe.open(newAgentOrAutomation(detail.name)) }]} onOpenRecord={(_k, id) => onGo(id.startsWith(AGENT_ROW) ? { kind: "agent", id: id.slice(AGENT_ROW.length) } : { kind: "automation", id })} /> : null}
      {tab === "inside" ? <DataPage client={client} source={sources.inside} version={version} onChanged={onChanged} onOpenRecord={(_k, id) => onGo({ kind: "module", id })} /> : null}
      {describe.dialog}
    </SectionCard>
  );
}

/** Governance's card (9 Oct, Vikas's design): a shield-check title, then what Alpha may and may
 *  not do here as two tabs, Allowed and Denied, each a list of sentences the person writes (a
 *  click edits one, its × removes it, the dashed button adds one). The rest of the section (what
 *  it keeps, where it reads from, where it sits) follows below as `children`. Kept per project in
 *  `PREF.governance` as `always` (Allowed) and `never` (Denied); the runtime does not read them yet. */
export function GovernanceCard({ client, moduleId, children }: { client: Client; moduleId: string; children?: ReactNode }) {
  const [all, setAll] = usePreference<Record<string, { always: string[]; never: string[] }>>(client, PREF.governance, {});
  const [problem, setProblem] = useState<string | null>(null);
  const [side, setSide] = useState<"always" | "never">("always");
  const mine = { always: all[moduleId]?.always ?? [], never: all[moduleId]?.never ?? [] };
  const save = async (next: string[]) => setProblem(await setAll({ ...all, [moduleId]: { ...mine, [side]: next } }));
  const tab = (id: "always" | "never", icon: ReactNode, label: string): ToggleItem<"always" | "never"> => ({ id, label, icon, count: mine[id].length });
  return (
    <section className="card scard" aria-label="Governance">
      <header className="scard__head">
        <div className="scard__titles">
          <div className="scard__titleline">
            <PermissionIcon size={ICON} aria-hidden="true" />
            <h3 className="scard__title">Governance</h3>
          </div>
        </div>
      </header>
      <div className="scard__body">
        <Toggle inBody label="What Alpha may do here" items={[tab("always", <Check size={ICON_SM} />, "Allowed"), tab("never", <Ban size={ICON_SM} />, "Denied")]} value={side} onChange={setSide} />
        <RuleList key={side} noun={side === "always" ? "allowed" : "denied"} rules={mine[side]} onChange={(next) => void save(next)} />
        {problem ? <Notice tone="bad">Couldn't save the rules: {problem}</Notice> : null}
        {children}
      </div>
    </section>
  );
}

function RuleList({ noun, rules, onChange }: { noun: string; rules: string[]; onChange: (next: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  // the rule waiting for a yes before it goes: its × or its text cleared (every delete confirms, rule 13)
  const [doomed, setDoomed] = useState<number | null>(null);
  const finish = (keep: boolean) => {
    if (editing === null) return;
    const clean = text.trim();
    if (keep && clean) onChange(rules.map((r, i) => (i === editing ? clean : r)));
    else if (keep) setDoomed(editing);
    setEditing(null);
  };
  const add = (keep: boolean) => {
    if (keep && draft.trim()) onChange([...rules, draft.trim()]);
    setDraft("");
    setAdding(false);
  };
  return (
    <div className="govrules__block" role="group" aria-label={noun === "allowed" ? "Allowed" : "Denied"}>
      {rules.length ? (
        <ul className="govrules__list">
          {rules.map((r, i) => (
            <li key={i} className="govrules__rule">
              {editing === i ? (
                <input
                  className="govrules__input"
                  autoFocus
                  aria-label={`Edit rule: ${r}`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => finish(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault(); // the Enter must not also press the confirm that may open
                      finish(true);
                    }
                    if (e.key === "Escape") finish(false);
                  }}
                />
              ) : (
                <>
                  <button type="button" className="linkbtn govrules__text" onClick={() => { setText(r); setEditing(i); }}>
                    {r}
                  </button>
                  <IconButton size="sm" className="govrules__del" label={`Delete rule: ${r}`} icon={<X size={ICON_SM} />} onClick={() => setDoomed(i)} />
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint">Nothing {noun}.</p>
      )}
      <Confirm
        open={doomed !== null && doomed < rules.length}
        title="Delete this rule?"
        action="Delete rule"
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          onChange(rules.filter((_, j) => j !== doomed));
          setDoomed(null);
        }}
      >
        “{doomed !== null ? rules[doomed] : ""}” goes from what Alpha may {noun === "allowed" ? "do" : "not do"} here. This can't be undone.
      </Confirm>
      {adding ? (
        <input
          className="govrules__input"
          autoFocus
          aria-label={`Add ${noun} action`}
          placeholder="Say it as a sentence, and press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => add(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(true);
            if (e.key === "Escape") add(false);
          }}
        />
      ) : (
        <button type="button" className="govadd" onClick={() => setAdding(true)}>
          <PlusIcon size={ICON_SM} aria-hidden="true" />
          Add {noun} action
        </button>
      )}
    </div>
  );
}

const SOURCE_STATUS: Record<Source["status"], { tone: Tone; words: string }> = {
  working: { tone: "good", words: "Working" },
  needs_signin: { tone: "warn", words: "Needs your sign-in" },
  blocked: { tone: "bad", words: "Blocked" },
  broken: { tone: "bad", words: "Being repaired" },
  not_built: { tone: "gray", words: "Not read yet" },
  unavailable: { tone: "gray", words: "Nothing to read" },
  skipped: { tone: "gray", words: "Skipped by you" },
};

function sourceSummary(sources: Source[]): string {
  const working = sources.filter((s) => s.status === "working").length;
  return `${working} of ${sources.length} working`;
}

export function GovernanceSection({ client, detail, modules, onChanged }: { client: Client; detail: ModuleDetail; modules: ModuleCard[]; onChanged: () => void }) {
  // Where this project could go (never itself, what it holds, or where it already is), and what
  // could come in (never itself, what is already here, or anything above it).
  const canHoldMe = useMemo(() => modules.filter((m) => m.id !== detail.id && m.id !== (detail.parent ?? null) && !(m.path ?? []).includes(detail.name)), [modules, detail.id, detail.parent, detail.name]);
  const canMoveIn = useMemo(() => modules.filter((m) => m.id !== detail.id && m.parent !== detail.id && !(detail.path ?? []).slice(0, -1).includes(m.name)), [modules, detail.id, detail.path]);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const asCard: ModuleCard = { ...detail, tables: detail.tables.map((t) => ({ name: t.name, title: t.title, module: t.module, records: t.records })) };
  async function moveUnder(parent: string | null) {
    try {
      const card = await client.moveModule(detail.id, parent);
      setMoveNote(`${card.name} now sits ${card.path && card.path.length > 1 ? `inside ${card.path.slice(0, -1).join(" › ")}` : "at the top"}.`);
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't move it: ${say(e)}`);
    }
  }
  /** A new project above this one: made where this one sits, then this one moves into it
   *  ("create Avilo and have Deals and Advisory in it": make it above one, move the other in). */
  async function makeParent(name: string) {
    try {
      const made = await client.createModule(name, null, detail.parent ?? null);
      await client.moveModule(detail.id, made.id);
      setMoveNote(`${detail.name} now sits inside ${made.name}.`);
      setNaming(false);
      onChanged();
    } catch (e) {
      setNaming(false);
      setMoveNote(`Couldn't make it: ${say(e)}`);
    }
  }
  async function moveIn(id: string) {
    try {
      const card = await client.moveModule(id, detail.id);
      setMoveNote(`${card.name} now sits inside ${detail.name}.`);
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't move it in: ${say(e)}`);
    }
  }
  return (
    <GovernanceCard client={client} moduleId={detail.id}>
      {naming ? <NewAboveDialog module={asCard} onMake={(name) => void makeParent(name)} onClose={() => setNaming(false)} /> : null}
      <div className="subsecs">
        <div className="subsec">
          <div className="subsec__head">
            <h4 className="subsec__title">What it keeps</h4>
          </div>
          {detail.tables.length ? (
            <div className="lrows">
              {detail.tables.map((t) => (
                <ListRow
                  key={t.name}
                  icon={<Table2 size={ICON} />}
                  title={t.title}
                  description={t.fields.map((f) => `${f.label ?? humanize(f.name)}${f.unit ? ` (${f.unit})` : ""}`).join(" · ")}
                  controls={<span className="faint num">{t.records.toLocaleString()} {word(t.records, "record", "records")}</span>}
                />
              ))}
            </div>
          ) : (
            <p className="faint">Nothing yet.</p>
          )}
        </div>
        {detail.sources.length ? (
          <div className="subsec">
            <div className="subsec__head">
              <h4 className="subsec__title">Where it reads from</h4>
              <span className="faint">{sourceSummary(detail.sources)}</span>
            </div>
            <div className="lrows">
              {detail.sources.map((src) => (
                <ListRow
                  key={src.id}
                  icon={<PermissionIcon size={ICON} />}
                  title={
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.title}
                    </a>
                  }
                  description={src.detail ?? (src.status === "working" ? `${src.last_rows ?? 0} ${word(src.last_rows ?? 0, "record", "records")}${src.last_checked ? ` · read ${when(src.last_checked)}` : ""}` : src.site)}
                  controls={<Badge tone={SOURCE_STATUS[src.status].tone}>{SOURCE_STATUS[src.status].words}</Badge>}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="subsec">
          <div className="subsec__head">
            <h4 className="subsec__title">Where it sits</h4>
            <InfoTip text="Everything in a project moves with it." />
          </div>
          <div className="lrows">
            <ListRow
              icon={<ModuleIcon size={ICON} />}
              title={detail.name}
              description={detail.path && detail.path.length > 1 ? `Inside ${detail.path.slice(0, -1).join(" › ")}` : "At the top level"}
              controls={
                <Menu
                  trigger={
                    <Button size="sm" aria-label={`Move ${detail.name}`}>
                      Move…
                    </Button>
                  }
                >
                  <MenuItem onSelect={() => setNaming(true)}>A new project above it…</MenuItem>
                  {detail.parent ? <MenuItem onSelect={() => void moveUnder(null)}>To the top level</MenuItem> : null}
                  {canHoldMe.length ? <MenuHeading>Inside</MenuHeading> : null}
                  {canHoldMe.map((m) => (
                    <MenuItem key={m.id} onSelect={() => void moveUnder(m.id)}>
                      {moduleWords(m)}
                    </MenuItem>
                  ))}
                </Menu>
              }
            />
            <ListRow
              icon={<ModuleIcon size={ICON} />}
              title="Sub-projects"
              description={detail.inside?.length ? detail.inside.map((m) => m.name).join(", ") : "Nothing yet"}
              controls={
                canMoveIn.length ? (
                  <Menu
                    trigger={
                      <Button size="sm" aria-label={`Move a project into ${detail.name}`}>
                        Move a project in…
                      </Button>
                    }
                  >
                    {canMoveIn.map((m) => (
                      <MenuItem key={m.id} onSelect={() => void moveIn(m.id)}>
                        {moduleWords(m)}
                      </MenuItem>
                    ))}
                  </Menu>
                ) : undefined
              }
            />
          </div>
          {moveNote ? <Notice tone={moveNote.startsWith("Couldn") ? "bad" : "ok"}>{moveNote}</Notice> : null}
        </div>
      </div>
    </GovernanceCard>
  );
}
