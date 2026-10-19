/**
 * One record's own page (12 Oct, Q42 section 2a; the feature from pull request #5, the layout
 * main's own, an automation's page): a back button named for its table, the record's title and
 * when it was added and last changed,  
 * editable in place with where its value came from. A related record opens its own page the same
 * way. It replaces the drawer that opened under the table. Under the details: the record's
 * History, with Undo, and the person's Notes (section 2b, `RecordHistory`).
 */
import { useEffect, useState } from "react";
import type { Client, Note, RecordRow, Relations, TableDesc } from "../core/client";
import type { Surface } from "../shell/Rail";
import { Button, Confirm } from "../ui";
import { ArrowLeft } from "../ui/icons";
import { coerce, fieldLabel, titleFieldOf, type FieldInfo } from "./fields";
import { humanize, when } from "./format";
import { RecordHistory, RecordNote } from "./RecordHistory";
import { RecordFields } from "./views/RecordFields";
import { say } from "../core/client";
import { TASKS_TABLE } from "../shell/Rail";
import { TaskAgent, TaskApprovals, TaskParts, TaskSuggestion, TasksHere, addressOf } from "./Tasks";

export function RecordPage({ client, table, id, version, onChanged, onGo }: { client: Client; table: string; id: string; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [data, setData] = useState<{ table: TableDesc; record: RecordRow; relations: Relations; note: Note | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    client
      .record(table, id)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, table, id, version, tick]);
  const module = data?.table.module ?? null;

  const tableTitle = data ? humanize(data.table.title === data.table.name ? data.table.name : data.table.title) : humanize(table);
  const isTask = table === TASKS_TABLE;
  /** Back to the table it belongs to (the module's page opens on the table last seen; a task's, the
   *  Tasks page), or where the person came from. */
  const back = () => (module ? onGo({ kind: "module", id: module, table: data?.table.name ?? table }) : isTask ? onGo({ kind: "tasks" }) : window.history.back());
  const backButton = (
    <Button size="sm" onClick={back}>
      <ArrowLeft size={14} aria-hidden="true" /> {tableTitle}
    </Button>
  );

  if (error) {
    return (
      <div className="page">
        {backButton}
        <p className="notice" role="alert" style={{ marginTop: 12 }}>
          Couldn't open this record: {error}
        </p>
      </div>
    );
  }
  if (!data) return <div className="page"><p className="empty">Loading…</p></div>;

  const { record: row, relations } = data;
  const fields = data.table.fields as FieldInfo[];
  const titleField = titleFieldOf(fields, data.table.title_field);
  const title = (titleField && String(row.values[titleField] ?? "")) || "Untitled";
  const readonly = Boolean(data.table.readonly);
  const dates = [row.created_at ? `Added ${when(row.created_at)}` : "", row.updated_at && row.updated_at !== row.created_at ? `last changed ${when(row.updated_at)}` : ""].filter(Boolean).join(" · ");

  const commit = (field: FieldInfo, text: string) => {
    if (readonly) return;
    const value = coerce(text, field.kind);
    if (JSON.stringify(value) === JSON.stringify(row.values[field.name] ?? null)) return;
    client
      .editRecord(data.table.name, row.id, { [field.name]: value }, row.revision)
      .then((saved) => {
        setData({ ...data, record: saved });
        setMessage(null);
        onChanged();
      })
      .catch((e: unknown) => setMessage({ ok: false, text: `Couldn't save the change: ${say(e)}` }));
  };
  const remove = async () => {
    setAsking(false);
    try {
      await client.deleteRecord(data.table.name, row.id, row.revision);
      onChanged();
      back();
    } catch (e) {
      setMessage({ ok: false, text: `Couldn't remove it: ${say(e)}` });
    }
  };

  return (
    <div className="page">
      <Confirm open={asking} title={`Remove ${title}?`} action="Remove it" onConfirm={() => void remove()} onCancel={() => setAsking(false)}>
        It leaves the table; Activity keeps that it was here.
      </Confirm>
      {backButton}
      <div className="modhead" style={{ marginTop: 12 }}>
        <div className="modhead__title" style={{ display: "block" }}>
          <h1 style={title.length > 60 ? { fontSize: "var(--text-xl)", lineHeight: 1.3 } : undefined}>{title}</h1>
          {dates ? <div className="faint" style={{ marginTop: 6 }}>{dates}</div> : null}
        </div>
        <div className="row">
          {readonly ? <span className="faint">Built by the module · read-only</span> : null}
          {!readonly ? (
            <Button size="sm" variant="danger" onClick={() => setAsking(true)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {message ? <p className={message.ok ? "notice notice--ok" : "notice"} role="status">{message.text}</p> : null}
      {isTask ? <TaskSuggestion client={client} row={row} onChanged={() => { setTick((n) => n + 1); onChanged(); }} /> : null}
      <div className="section">
        <div className="section__head">
          <h2>Details</h2>
          <span className="faint">Each value says where it came from</span>
        </div>
        <div className="card card--pad">
          <RecordFields page row={row} fields={isTask ? fields.filter((f) => f.name !== "reminded_at" && f.name !== "suggested") : fields} titleField={titleField} relations={relations} onCommit={commit} onOpenRelated={(collection, rid) => onGo({ kind: "record", table: collection, id: rid })} />
        </div>
      </div>
      {isTask ? <TaskParts client={client} row={row} version={version} onChanged={() => { setTick((n) => n + 1); onChanged(); }} onGo={onGo} /> : null}
      {isTask ? <TaskAgent client={client} row={row} version={version} onChanged={() => { setTick((n) => n + 1); onChanged(); }} onGo={onGo} /> : null}
      {isTask ? <TaskApprovals client={client} taskId={row.id} version={version} onGo={onGo} /> : null}
      {!isTask && !readonly ? <TasksHere client={client} at={addressOf(data.table.name, row.id, module)} version={version} onChanged={onChanged} onGo={onGo} fields={fields.filter((f) => f.name !== titleField).map((f) => ({ name: f.name, label: fieldLabel(f) }))} /> : null}
      <RecordHistory client={client} table={data.table.name} row={row} fields={fields} readonly={readonly} version={version} onUndone={(saved) => { setData({ ...data, record: saved }); onChanged(); }} />
      <RecordNote client={client} table={data.table.name} id={row.id} note={data.note} readonly={readonly} onSaved={() => { setTick((n) => n + 1); onChanged(); }} />
    </div>
  );
}
