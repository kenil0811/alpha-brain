/**
 * What a module page keeps below its data, in the rulebook's order (9 Oct, the UI rulebook §5):
 * Files, then Intelligence (Alpha's page about the module, its goals, what happened here, the
 * modules inside it), then Governance (where it sits, what it keeps, where it reads from, what
 * runs on its own). Each is a section card; the page keeps scrolling into them from the table.
 * These are what the Summary, Activity and Settings tabs held before; the tabs are gone.
 */
import { useEffect, useMemo, useState } from "react";
import { moduleWords } from "../core/client";
import type { Client, DocumentInfo, ModuleCard, ModuleDetail, Note, Source } from "../core/client";
import { AutomationList } from "../shell/Automations";
import { NewAboveDialog } from "../shell/ModuleDialogs";
import { Badge, Button, ListRow, Menu, MenuHeading, MenuItem, Notice, SectionCard, type Tone } from "../ui";
import { AttachIcon, FileText, ICON, ModuleIcon, PermissionIcon, Table2 } from "../ui/icons";
import { humanize, when } from "./format";

const word = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Files: Add files (the Mac's picker; a drop anywhere on the page does the same) and what was
 *  added in this visit. The module's data does not list its documents, so a visit that has added
 *  none says so in one line. */
export function FilesSection({ added, onPick }: { added: DocumentInfo[]; onPick: () => void }) {
  return (
    <SectionCard
      title="Files"
      subtitle="Alpha reads what you add into this module's collections"
      actions={
        <Button size="sm" icon={<AttachIcon size={ICON} />} onClick={onPick} title="Add files to this module from your Mac; Alpha reads them into its collections">
          Add files
        </Button>
      }
    >
      {added.length ? (
        <div className="lrows">
          {added.map((d) => (
            <ListRow key={d.id} icon={<FileText size={ICON} />} title={d.title} description="Added just now" />
          ))}
        </div>
      ) : (
        <p className="faint">No files are attached yet. Add them with the button, or drop them anywhere on this page.</p>
      )}
    </SectionCard>
  );
}

const PAGE = 10;

/** Everything that happened in this module, newest first: what you did, what Alpha did, what
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

/** The module's page of Alpha's wiki: what it is for, what it holds, what was tried, what is
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
        <h4 className="subsec__title">Alpha's page</h4>
        <span className="faint">what this is for, what it holds, what is open</span>
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
        <p className="faint">No page yet. Alpha writes one as it builds and learns here; you can start it.</p>
      )}
    </div>
  );
}

export function IntelligenceSection({ client, detail, version, onChanged, onGo }: { client: Client; detail: ModuleDetail; version: number; onChanged: () => void; onGo: (id: string) => void }) {
  return (
    <SectionCard title="Intelligence" subtitle="What Alpha knows and has done in this module">
      <div className="subsecs">
        <ModulePageCard client={client} moduleRef={detail.id} version={version} onChanged={onChanged} />
        <div className="subsec">
          <div className="subsec__head">
            <h4 className="subsec__title">{detail.goals.length === 1 ? "Goal" : "Goals"}</h4>
          </div>
          {detail.goals.length ? (
            <ul className="goals">
              {detail.goals.map((g) => (
                <li key={g.id}>{g.text}</li>
              ))}
            </ul>
          ) : (
            <p className="faint">No goals for this module yet. Tell Alpha what you are aiming for here.</p>
          )}
        </div>
        <div className="subsec">
          <div className="subsec__head">
            <h4 className="subsec__title">Activity</h4>
            <span className="faint">newest first</span>
          </div>
          <ModuleActivity detail={detail} />
        </div>
        {detail.inside?.length ? (
          <div className="subsec">
            <div className="subsec__head">
              <h4 className="subsec__title">Inside {detail.name}</h4>
              <span className="faint">
                {detail.inside.length} {word(detail.inside.length, "module", "modules")}; what you ask here reaches them all
              </span>
            </div>
            <div className="lrows">
              {detail.inside.map((m) => (
                <ListRow
                  key={m.id}
                  icon={<ModuleIcon size={ICON} />}
                  title={m.name}
                  description={`${m.goal ?? m.last_text ?? "Nothing in it yet."} · ${m.tables.length} ${word(m.tables.length, "collection", "collections")}${m.children?.length ? ` · holds ${m.children.length}` : ""}`}
                  controls={
                    <Button size="sm" onClick={() => onGo(m.id)}>
                      Open
                    </Button>
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
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
  // Where this module could go (never itself, what it holds, or where it already is), and what
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
  /** A new module above this one: made where this one sits, then this one moves into it
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
    <SectionCard title="Governance" subtitle="Where it sits, what it keeps and reads, what runs on its own">
      {naming ? <NewAboveDialog module={asCard} onMake={(name) => void makeParent(name)} onClose={() => setNaming(false)} /> : null}
      <div className="subsecs">
        <div className="subsec">
          <div className="subsec__head">
            <h4 className="subsec__title">Where it sits</h4>
            <span className="faint">A module can live inside another; everything in it moves with it</span>
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
                  <MenuItem onSelect={() => setNaming(true)}>A new module above it…</MenuItem>
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
              title="Inside it"
              description={detail.inside?.length ? detail.inside.map((m) => m.name).join(", ") : "Nothing yet. Other modules can move in here."}
              controls={
                canMoveIn.length ? (
                  <Menu
                    trigger={
                      <Button size="sm" aria-label={`Move a module into ${detail.name}`}>
                        Move a module in…
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
            <p className="faint">Nothing is kept here yet. Ask Alpha to set up a collection.</p>
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
            <h4 className="subsec__title">What runs on its own</h4>
            <span className="faint">Switch any off; Alpha says so if something needs it</span>
          </div>
          <AutomationList client={client} items={detail.automations} onChanged={onChanged} bare empty="Nothing runs on its own here. Ask Alpha to keep something here current and it shows up with a switch." />
        </div>
      </div>
    </SectionCard>
  );
}
