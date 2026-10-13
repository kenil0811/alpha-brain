import { ArrowLeft, Copy, History, Pin, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, Confirm, Dialog, Dropdown, Flash, More, Pill, Tip, useFlash } from "../kit";
import { fmt, fmtDate } from "../data/format";
import { go, href } from "../data/route";
import { useWorld } from "../data/store";
import type { Collection, Field, Project, Rec, Value } from "../data/types";
import { CellValue, toneOf } from "./cells";

/** Every record opens as a full page of its own; the page is the form (rulebook §7). */
export function RecordPage({ project, coll, id, fresh }: { project: Project; coll: Collection; id: string; fresh?: boolean }) {
  const w = useWorld();
  const rec = w.rows(project.id, coll.id).find((r) => r.id === id);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const back = href.project(project.id, coll.id);

  if (!rec) {
    return (
      <div className="record">
        <a className="back" href={back}><ArrowLeft aria-hidden />{coll.label}</a>
        <p className="empty">This {coll.word.toLowerCase()} is no longer here. It may have been deleted in this visit.</p>
      </div>
    );
  }

  const title = String(rec[coll.titleKey] ?? "") || `New ${coll.word.toLowerCase()}`;
  const set = (f: Field, v: Value) => {
    w.setField(project.id, coll.id, rec.id, f.key, v);
    const d = new Date();
    setSaved(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  };
  const history = w.history[rec.id] ?? [];
  const prov = Object.entries(rec._prov ?? {});

  return (
    <div className="record">
      <div className="record__bar">
        <a className="back" href={back}>
          <ArrowLeft aria-hidden />
          {coll.label === project.name ? project.name : `${project.name} · ${coll.label}`}
        </a>
        <span className="record__barright">
          <Flash msg={flash} />
          <More
            items={[
              { label: "Duplicate", icon: Copy, onSelect: () => { const nid = w.addRecord(project.id, coll.id, { ...rec, id: undefined, [coll.titleKey]: `${title} (copy)` } as never); go(href.record(project.id, coll.id, nid)); } },
              { label: "Pin", icon: Pin, onSelect: () => setFlash("Pinned to Home") },
              { label: "History", icon: History, onSelect: () => setShowHistory(true) },
              { label: "Delete", icon: Trash2, danger: true, onSelect: () => setConfirmDel(true) },
            ]}
          />
        </span>
      </div>

      {fresh || history.length ? (
        <div className="savebar">
          <span>{saved ? `Last saved ${saved}` : fresh ? "New — fill in what you know" : "Changes save as you go"}</span>
          <Button variant="primary" onClick={() => { setSaved(new Date().toTimeString().slice(0, 5)); setFlash("Saved"); }}>Save</Button>
          {fresh ? <Button onClick={() => setConfirmCancel(true)}>Cancel</Button> : null}
        </div>
      ) : null}

      <div className="record__col">
        <div className="record__title">
          <coll.icon className="record__ico" aria-hidden />
          <div>
            <div className="eyebrow">{coll.word}</div>
            <h1 className="serif-title">{title}</h1>
          </div>
        </div>

        <Card title="Details">
          <div className="fields">
            {coll.fields.map((f) => (
              <label key={f.key} className={["fieldrow", f.type === "longtext" && "fieldrow--long"].filter(Boolean).join(" ")}>
                <span className="fieldrow__label">{f.label}</span>
                <span className="fieldrow__value"><FieldInput f={f} rec={rec} onSet={(v) => set(f, v)} /></span>
              </label>
            ))}
          </div>
        </Card>

        {coll.sections?.(rec)}

        <Card title="Notes">
          <textarea className="notes" placeholder="No notes yet." defaultValue={String(rec.notes ?? "")} aria-label="Notes" onBlur={(e) => w.setField(project.id, coll.id, rec.id, "notes", e.target.value)} />
        </Card>

        <Card title="Governance" info="Where each value came from, and what Alpha may do with this record.">
          {prov.length ? (
            <ul className="provlist">
              {prov.map(([k, p]) => (
                <li key={k}>
                  <span className="provlist__field">{coll.fields.find((f) => f.key === k)?.label ?? k}</span>
                  <Pill tone={p.kind === "source" ? "blue" : "yellow"}>{p.kind === "source" ? "Source" : p.kind === "estimated" ? "Estimated" : "Assumed"}</Pill>
                  <span className="provlist__note">{p.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Every value here was entered by staff.</p>
          )}
          <p className="meta">Alpha may read and draft for this {coll.word.toLowerCase()}. Anything that leaves the firm waits for your approval.</p>
        </Card>
      </div>

      <Confirm
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={`Delete ${title}?`}
        body={`This removes the ${coll.word.toLowerCase()} and its notes. In this demo, reloading the page brings it back.`}
        action="Delete"
        onConfirm={() => { w.removeRecords(project.id, coll.id, [rec.id]); go(back); }}
      />
      <Confirm
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Discard this new ${coll.word.toLowerCase()}?`}
        body="Nothing you typed here is kept."
        action="Discard"
        onConfirm={() => { w.removeRecords(project.id, coll.id, [rec.id]); go(back); }}
      />
      <Dialog open={showHistory} onOpenChange={setShowHistory} title="History" actions={<Button onClick={() => setShowHistory(false)}>Close</Button>}>
        {history.length ? (
          <ul className="hist">
            {history.map((h, i) => (
              <li key={i}><span className="meta">{h.at} · {h.who}</span> {coll.fields.find((f) => f.key === h.field)?.label ?? h.field}: <s>{String(h.from ?? "empty")}</s> → {String(h.to ?? "empty")}</li>
            ))}
          </ul>
        ) : (
          <p className="empty">No changes in this visit yet.</p>
        )}
      </Dialog>
    </div>
  );
}

function FieldInput({ f, rec, onSet }: { f: Field; rec: Rec; onSet: (v: Value) => void }) {
  const w = useWorld();
  const v = rec[f.key] as Value | undefined;
  if (f.computed) {
    return (
      <Tip text="Computed by the platform">
        <span className="readonly" tabIndex={0}><CellValue field={f} rec={rec} rowsOf={w.rows} /></span>
      </Tip>
    );
  }
  if (f.type === "status" || f.type === "choice") {
    return (
      <Dropdown
        value={String(v ?? "")}
        options={(f.options ?? []).map((o) => ({ value: o.value, label: o.value }))}
        onChange={(x) => onSet(x)}
        addLabel="Add choice…"
        trigger={<button className="fieldbtn">{v ? <Pill tone={toneOf(f, v)}>{String(v)}</Pill> : <span className="dash">Unknown</span>}</button>}
      />
    );
  }
  if (f.type === "relation" || f.type === "file" || f.type === "person") {
    return <span className="readonly"><CellValue field={f} rec={rec} rowsOf={w.rows} /></span>;
  }
  if (f.type === "longtext") {
    return <textarea className="input input--long" defaultValue={String(v ?? "")} placeholder="Unknown" onBlur={(e) => onSet(e.target.value)} />;
  }
  if (f.type === "check") {
    return <input type="checkbox" className="check" defaultChecked={!!v} onChange={(e) => onSet(e.target.checked)} />;
  }
  const type = f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : f.type === "number" || f.type === "money" || f.type === "percent" ? "number" : "text";
  return (
    <span className="withprov">
      <input
        className={["input", type === "number" ? "input--num" : type === "date" ? "input--date" : ""].join(" ")}
        type={type}
        defaultValue={String(v ?? "")}
        placeholder="Unknown"
        onBlur={(e) => onSet(type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
        aria-label={f.label}
      />
      {rec._prov?.[f.key] && rec._prov[f.key].kind !== "source" ? (
        <Tip text={rec._prov[f.key].note}><span className="prov" tabIndex={0}>{rec._prov[f.key].kind === "estimated" ? "Estimated" : "Assumed"}</span></Tip>
      ) : null}
      {f.type === "date" && v ? <span className="meta">{fmtDate(String(v))}</span> : null}
      {f.type === "money" && v ? <span className="meta">{fmt(f, v)}</span> : null}
    </span>
  );
}
