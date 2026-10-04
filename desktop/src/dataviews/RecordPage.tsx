/**
 * One record, in a drawer beside the view or as a full page: every field edited in place, who
 * added and changed it (the person, or Alpha and the words that turn started from), and links to
 * the records and people it points at. A person or company opens here too.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";
import type { Client, EntityDetail, RecordRow } from "../core/client";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { useComingSoon } from "../ui/Soon";
import type { FieldInfo } from "../modules/fields";
import { when } from "../modules/format";
import { EditInPlace, fieldLabel, type Link, type Relations } from "./cells";

export type Opened = { kind: "record"; table: string; id: string } | { kind: "entity"; id: string; label: string } | { kind: "new" };

function Frame({ mode, title, onClose, onBack, onToggle, actions, children }: { mode: "drawer" | "page"; title: string; onClose: () => void; onBack?: () => void; onToggle?: () => void; actions?: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <section className={mode === "page" ? "dv-recpage" : "dv-drawer"} aria-label={title || "Details"} role={mode === "drawer" ? "complementary" : "region"}>
      <header className="dv-rec__head">
        {onBack ? (
          <IconButton size="sm" aria-label="Back" onClick={onBack}>
            <ArrowLeft size={14} />
          </IconButton>
        ) : null}
        <h3 className="dv-rec__title dv-ellipsis" title={title}>
          {title || "Untitled"}
        </h3>
        <span className="dv-spacer" />
        {actions}
        {onToggle ? (
          <IconButton size="sm" aria-label={mode === "page" ? "Show beside the table" : "Open as a page"} title={mode === "page" ? "Show beside the table" : "Open as a page"} onClick={onToggle}>
            {mode === "page" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </IconButton>
        ) : null}
        <IconButton size="sm" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </header>
      <div className="dv-rec__body">{children}</div>
    </section>
  );
}

function who(actor: string) {
  return actor === "person" ? "You" : actor === "alpha" ? "Alpha" : actor;
}

export function RecordPage({ fields, titleField, record, relations, mode, onClose, onBack, onToggle, onSave, onRemove, onOpenLink }: {
  fields: FieldInfo[];
  titleField: string | undefined;
  record: RecordRow;
  relations: Relations;
  mode: "drawer" | "page";
  onClose: () => void;
  onBack?: () => void;
  onToggle?: () => void;
  onSave: (values: Record<string, unknown>) => void;
  onRemove: () => Promise<void>;
  onOpenLink: (link: Link) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const soon = useComingSoon();
  const title = titleField ? String(record.values[titleField] ?? "") : "";
  const short = fields.filter((f) => f.kind !== "long_text");
  const long = fields.filter((f) => f.kind === "long_text");
  const by = record.provenance?.by;
  return (
    <Frame
      mode={mode}
      title={title}
      onClose={onClose}
      onBack={onBack}
      onToggle={onToggle}
      actions={
        confirming ? (
          <>
            <Button size="sm" variant="destructive" onClick={() => void onRemove()}>
              Remove row
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        )
      }
    >
      <dl className="dv-kv">
        {short.map((f) => (
          <div key={f.name} className="dv-kv__row">
            <dt className="dv-ellipsis" title={fieldLabel(f)}>
              {fieldLabel(f)}
            </dt>
            <dd>
              <EditInPlace field={f} value={record.values[f.name]} row={record} relations={relations} onOpenLink={onOpenLink} onCommit={(v) => onSave({ [f.name]: v })} />
            </dd>
          </div>
        ))}
      </dl>
      {long.map((f) => (
        <div key={f.name} className="dv-rec__long">
          <h4>{fieldLabel(f)}</h4>
          <EditInPlace field={f} value={record.values[f.name]} row={record} relations={relations} onCommit={(v) => onSave({ [f.name]: v })} />
        </div>
      ))}
      <div className="dv-rec__history" aria-label="History">
        <h4>History</h4>
        <p className="dv-faint">
          Added {when(record.created_at)}
          {by ? ` by ${who(by)}` : ""}
        </p>
        {/* Every change and what was said then needs the core's record history (backend-requests.md §5). */}
        <Button size="sm" variant="link" className="dv-rec__more" onClick={() => soon("A row's full history")}>
          Every change
        </Button>
      </div>
    </Frame>
  );
}

export function EntityPage({ client, id, label, mode, onClose, onBack }: { client: Client; id: string; label: string; mode: "drawer" | "page"; onClose: () => void; onBack?: () => void }) {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client
      .entity(id)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, id]);
  return (
    <Frame mode={mode} title={detail?.name ?? label} onClose={onClose} onBack={onBack}>
      {error ? <p className="dv-error">{error}</p> : null}
      {detail ? (
        <>
          <dl className="dv-kv">
            <div className="dv-kv__row">
              <dt>Kind</dt>
              <dd>{detail.kind === "organisation" ? "Company" : detail.kind === "person" ? "Person" : detail.kind}</dd>
            </div>
            {Object.entries(detail.keys).map(([k, v]) => (
              <div key={k} className="dv-kv__row">
                <dt>{k}</dt>
                <dd className="dv-ellipsis">{v.join(", ")}</dd>
              </div>
            ))}
            {detail.facts.map((f) => (
              <div key={f.id} className="dv-kv__row">
                <dt>{f.predicate.replace(/_/g, " ")}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="dv-rec__history">
            <h4>Timeline</h4>
            {detail.timeline.length ? null : <p className="dv-faint">Nothing yet</p>}
            {detail.timeline.slice(0, 20).map((e) => (
              <div key={e.id} className="dv-rec__event">
                <span className="dv-faint dv-num">{when(e.at)}</span>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Frame>
  );
}

export function NewRecordFrame({ mode, onClose, children }: { mode: "drawer" | "page"; onClose: () => void; children: React.ReactNode }) {
  return (
    <Frame mode={mode} title="New row" onClose={onClose}>
      {children}
    </Frame>
  );
}

