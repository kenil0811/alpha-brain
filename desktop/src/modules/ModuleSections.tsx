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
import { moduleWords } from "../core/client";
import type { Client, DocumentInfo, ModuleCard, ModuleDetail, Note, Source } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { AutomationList } from "../shell/Automations";
import { NewAboveDialog } from "../shell/ModuleDialogs";
import type { Surface } from "../shell/Rail";
import { Badge, Button, IconButton, InfoTip, ListRow, Menu, MenuHeading, MenuItem, Notice, SectionCard, Tabs, useAssistant, type Tone } from "../ui";
import { AgentIcon, Ban, Check, FileText, ICON, ICON_SM, ModuleIcon, PermissionIcon, PlusIcon, Table2, X } from "../ui/icons";
import { downloadText, parseCsv, toCsv } from "./csv";
import { humanize, when } from "./format";

const word = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A file added in this visit: the document the core made, and the file itself (the core has no
 *  route that gives a document's content back, so a preview reads the file the person chose). */
export interface AddedFile {
  doc: DocumentInfo;
  file?: File;
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
          {added.map(({ doc, file }) => (
            <ListRow key={doc.id} icon={<FileText size={ICON} />} title={doc.title} description="Added just now">
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
      (e: unknown) => live && setProblem(e instanceof Error ? e.message : String(e)),
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
        <Button size="sm" disabledReason="Saving back needs Alpha's core; Download keeps your edits.">
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

/** Add a goal, an agent or an automation: no route makes one, so it goes to Alpha as a sentence
 *  ("In Deals, add a goal: …") and Alpha asks the person to approve it (9 Oct, Vikas). */
function AskAlpha({ project, thing }: { project: string; thing: "goal" | "agent" | "automation" }) {
  const assistant = useAssistant();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const send = () => {
    if (!assistant || !text.trim()) return;
    assistant.say(`In ${project}, add ${thing === "automation" ? "an" : "a"} ${thing}: ${text.trim()}`);
    setText("");
    setOpen(false);
    setSent(true);
  };
  if (!open) {
    return (
      <span className="askalpha">
        <Button size="sm" icon={<PlusIcon size={ICON_SM} />} disabledReason={assistant ? undefined : "The assistant isn't reachable here."} onClick={() => { setSent(false); setOpen(true); }}>
          Add {thing}
        </Button>
        {sent ? <span className="faint">Sent to Alpha — it will ask you to approve.</span> : null}
      </span>
    );
  }
  return (
    <div className="askbox">
      <textarea className="note__edit" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={`Describe the ${thing} you want`} aria-label={`Describe the ${thing} you want`} />
      <div className="askbox__bar">
        <Button size="sm" variant="primary" disabledReason={text.trim() ? undefined : `Say what ${thing} you want first.`} onClick={send}>
          Send
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type IntelTab = "activity" | "agents" | "goals" | "page" | "inside";

export function IntelligenceSection({ client, detail, version, onChanged, onGo }: { client: Client; detail: ModuleDetail; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [tab, setTab] = useState<IntelTab>("activity");
  const inside = detail.inside ?? [];
  const tabs: { id: IntelTab; label: string }[] = [
    { id: "activity", label: "Activity" },
    // Alpha, the assistant that works here, is the first agent
    { id: "agents", label: `Agents and automations · ${detail.automations.length + 1}` },
    { id: "goals", label: `Goals${detail.goals.length ? ` · ${detail.goals.length}` : ""}` },
    { id: "page", label: "Alpha's page" },
    ...(inside.length ? [{ id: "inside" as const, label: `Sub-projects · ${inside.length}` }] : []),
  ];
  return (
    <SectionCard title="Intelligence">
      <Tabs label="Intelligence" items={tabs} value={tab} onChange={setTab} />
      {tab === "page" ? <ModulePageCard client={client} moduleRef={detail.id} version={version} onChanged={onChanged} /> : null}
      {tab === "goals" ? (
        <div className="stack">
          {detail.goals.length ? (
            <ul className="goals">
              {detail.goals.map((g) => (
                <li key={g.id}>{g.text}</li>
              ))}
            </ul>
          ) : (
            <p className="faint">No goals yet.</p>
          )}
          <AskAlpha project={detail.name} thing="goal" />
        </div>
      ) : null}
      {tab === "activity" ? <ModuleActivity detail={detail} /> : null}
      {tab === "agents" ? (
        <div className="stack">
          <div className="lrows">
            <ListRow icon={<AgentIcon size={ICON} />} title="Alpha" description={`The assistant that works in ${detail.name}`} onOpen={() => onGo({ kind: "agent", id: "alpha" })} />
          </div>
          {detail.automations.length ? <AutomationList client={client} items={detail.automations} onChanged={onChanged} bare empty="" /> : null}
          <div className="row">
            <AskAlpha project={detail.name} thing="agent" />
            <AskAlpha project={detail.name} thing="automation" />
          </div>
        </div>
      ) : null}
      {tab === "inside" ? (
        <div className="subsec">
          <div className="subsec__head">
            <InfoTip text="What you ask here reaches them all." />
          </div>
          <div className="lrows">
            {inside.map((m) => (
              <ListRow
                key={m.id}
                icon={<ModuleIcon size={ICON} />}
                title={m.name}
                description={`${m.goal ?? m.last_text ?? "Nothing in it yet."} · ${m.tables.length} ${word(m.tables.length, "collection", "collections")}${m.children?.length ? ` · holds ${m.children.length}` : ""}`}
                controls={
                  <Button size="sm" onClick={() => onGo({ kind: "module", id: m.id })}>
                    Open
                  </Button>
                }
              />
            ))}
          </div>
        </div>
      ) : null}
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
  const tab = (id: "always" | "never", icon: ReactNode, label: string) => ({
    id,
    label: (
      <>
        {icon}
        {label}{" "}
        <span className="govtabs__count">{mine[id].length}</span>
      </>
    ),
  });
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
        <Tabs label="What Alpha may do here" className="subtabs govtabs" items={[tab("always", <Check size={ICON_SM} aria-hidden="true" />, "Allowed"), tab("never", <Ban size={ICON_SM} aria-hidden="true" />, "Denied")]} value={side} onChange={setSide} />
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
  const finish = (keep: boolean) => {
    if (editing === null) return;
    const clean = text.trim();
    if (keep) onChange(clean ? rules.map((r, i) => (i === editing ? clean : r)) : rules.filter((_, i) => i !== editing));
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
                    if (e.key === "Enter") finish(true);
                    if (e.key === "Escape") finish(false);
                  }}
                />
              ) : (
                <>
                  <button type="button" className="linkbtn govrules__text" onClick={() => { setText(r); setEditing(i); }}>
                    {r}
                  </button>
                  <IconButton size="sm" className="govrules__del" label={`Delete rule: ${r}`} icon={<X size={ICON_SM} />} onClick={() => onChange(rules.filter((_, j) => j !== i))} />
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint">Nothing {noun}.</p>
      )}
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
      setMoveNote(`Couldn't move it: ${e instanceof Error ? e.message : String(e)}`);
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
      setMoveNote(`Couldn't make it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function moveIn(id: string) {
    try {
      const card = await client.moveModule(id, detail.id);
      setMoveNote(`${card.name} now sits inside ${detail.name}.`);
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't move it in: ${e instanceof Error ? e.message : String(e)}`);
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
