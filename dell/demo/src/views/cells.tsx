import { Paperclip } from "lucide-react";
import { Pill, Tip } from "../kit";
import { fmt } from "../data/format";
import { href } from "../data/route";
import { findCollection } from "../data/store";
import type { Field, Rec, Tone } from "../data/types";

export function toneOf(field: Field, v: unknown): Tone {
  return field.options?.find((o) => o.value === v)?.tone ?? "gray";
}

export function isDone(field: Field | undefined, v: unknown): boolean {
  return !!field?.options?.find((o) => o.value === v)?.done;
}

/** One cell's value, as the table and the record page show it. Missing reads as a quiet dash. */
/** `plain`: inside a link already (a board card), so related records show as text, not links. */
export function CellValue({ field, rec, rowsOf, plain }: { field: Field; rec: Rec; rowsOf: (p: string, c: string) => Rec[]; plain?: boolean }) {
  const v = rec[field.key];
  const prov = rec._prov?.[field.key];
  let body: React.ReactNode;
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) body = <span className="dash">—</span>;
  else if (field.type === "status" || field.type === "choice") {
    const vals = Array.isArray(v) ? v : [String(v)];
    body = <span className="pills">{vals.map((x) => <Pill key={x} tone={toneOf(field, x)}>{x}</Pill>)}</span>;
  } else if (field.type === "relation" && field.to) {
    const ids = Array.isArray(v) ? v : [String(v)];
    const coll = findCollection(field.to.project, field.to.collection);
    const rows = rowsOf(field.to.project, field.to.collection);
    body = (
      <span className="pills">
        {ids.map((id) => {
          const r = rows.find((x) => x.id === id);
          if (plain) return <span key={id} className="rel">{r && coll ? String(r[coll.titleKey]) : id}</span>;
          return (
            <a key={id} className="rel" href={href.record(field.to!.project, field.to!.collection, id)} onClick={(e) => e.stopPropagation()}>
              {r && coll ? String(r[coll.titleKey]) : id}
            </a>
          );
        })}
      </span>
    );
  } else if (field.type === "file") {
    body = (
      <span className="filecell"><Paperclip aria-hidden />{String(v)}</span>
    );
  } else body = <span className={field.type === "money" || field.type === "number" || field.type === "percent" ? "num" : undefined}>{fmt(field, v as never)}</span>;

  if (!prov || prov.kind === "source") return <>{body}</>;
  return (
    <span className="withprov">
      {body}
      <Tip text={prov.note}>
        <span className="prov" tabIndex={0}>{prov.kind === "estimated" ? "Estimated" : "Assumed"}</span>
      </Tip>
    </span>
  );
}
