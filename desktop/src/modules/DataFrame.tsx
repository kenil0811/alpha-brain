/**
 * The one layout every page with a table uses (9 Oct, the owner: "one centralized UI element"):
 * a project, Network's People and Organizations, Intelligence's lists, the New project page. Top
 * to bottom: the data view (`DataPage`, with every view, dropdown and filter) filling the whole
 * first screen, then, below the fold as the page scrolls, Files, Intelligence and Governance in
 * that order. Files can be dropped anywhere on the page or picked by Upload; they go to the
 * project (`module`), or into Alpha's world when the page belongs to none. A page gives only
 * what is its own: the data view, its Intelligence and, when it has more to say, its Governance.
 */
import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { say } from "../core/client";
import type { Client } from "../core/client";
import { FilesSection, GovernanceCard, type AddedFile } from "./ModuleSections";
import { Notice, PageHeader } from "../ui";

export function DataFrame({ client, header, scope, name, module = null, onChanged, data, intelligence, governance, notice }: {
  client: Client;
  /** The page's header (title, switch, breadcrumb); a plain header when absent. */
  header?: ReactNode;
  /** The key Governance's Allowed and Denied rules are kept under (a project's id, "network", …). */
  scope: string;
  /** What the page is called, for "Drop to upload to …". */
  name: string;
  /** The project files go to; null puts them in Alpha's world. */
  module?: string | null;
  onChanged: () => void;
  /** The data view; `upload` opens the file picker (its toolbar's Upload). */
  data: (upload: () => void) => ReactNode;
  intelligence: ReactNode;
  /** Governance in full; absent, the Allowed and Denied card alone. */
  governance?: ReactNode;
  /** A line above the data (a problem loading, a note). */
  notice?: ReactNode;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedFile[]>([]);
  const upload = () => picker.current?.click();
  async function addFiles(files: File[]) {
    if (!files.length) return;
    try {
      const out = await client.addFiles(files, { module });
      // the core answers with one document per file, in order
      setAdded((now) => [...out.documents.map((doc, i) => ({ doc, file: files[i], at: new Date().toISOString() })), ...now]);
      setDropNote(`Uploaded ${out.documents.map((d) => d.title).join(", ")}. Alpha is reading ${files.length === 1 ? "it" : "them"}.`);
      onChanged();
    } catch (err) {
      setDropNote(`Couldn't upload ${files.map((f) => f.name).join(", ")}: ${say(err)}`);
    }
  }
  // the note stays until dismissed, the next upload or leaving (nothing on a timer, §14)
  useEffect(() => setDropNote(null), [module]);
  async function dropped(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    await addFiles(Array.from(e.dataTransfer.files ?? []));
  }
  return (
    <div className={dragging ? "modpage page--drop" : "modpage"} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(e) => void dropped(e)}>
      {header ?? <PageHeader />}
      <input ref={picker} type="file" multiple style={{ display: "none" }} aria-hidden="true" tabIndex={-1} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(files); }} />
      <div className="page page--wide modpage__body">
        <div className="frame__data">
          {dragging ? <div className="dropnote">Drop to upload to {name}</div> : null}
          {dropNote ? (
            <Notice tone={dropNote.startsWith("Couldn") ? "bad" : "ok"} onRetry={() => setDropNote(null)} retryLabel="Dismiss">
              {dropNote}
            </Notice>
          ) : null}
          {notice}
          {data(upload)}
        </div>
        <FilesSection added={added} onPick={upload} />
        {intelligence}
        {governance ?? <GovernanceCard client={client} moduleId={scope} />}
      </div>
    </div>
  );
}
