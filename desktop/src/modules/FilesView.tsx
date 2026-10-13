/**
 * The files a module holds, or those kept about a person or company (13 Oct, slice 2 B8, B11, G4,
 * G6): the one data view (`DataPage` with rows it is handed), so search, sorting and the column
 * menus work as on any table. Each file says when it was added and which records hold it; its
 * buttons open it with the Mac's own app, show it in Finder, and delete it, which asks first with
 * what goes. A connected folder's own file is the person's: it is never deleted here.
 */
import { useMemo, useState } from "react";
import { say, type Client, type FileItem, type RecordRow, type TableDesc } from "../core/client";
import { host } from "../core/host";
import { Button, Confirm } from "../ui";
import { DataPage, type HeldRows } from "./DataPage";

const FROM = { here: "Added here", folder: "Your folder" };

function filesTable(key: string, files: FileItem[]): TableDesc {
  const kinds = [...new Set(files.map((f) => f.kind.toUpperCase() || "File"))].sort();
  return {
    name: key,
    title: "Files",
    module: null,
    title_field: "file",
    records: files.length,
    readonly: true,
    fields: [
      { name: "file", kind: "text", label: "Name" },
      { name: "kind", kind: "choice", label: "Kind", choices: kinds },
      { name: "size", kind: "number", label: "Size", unit: "KB" },
      { name: "added", kind: "datetime", label: "Added" },
      { name: "used_by", kind: "text", label: "Used by" },
      { name: "from", kind: "choice", label: "From", choices: Object.values(FROM) },
    ],
  };
}

/** Which records hold a file, in words: "Statements: March" and how many more. */
export function usedByWords(f: FileItem): string | null {
  if (!f.used_by.length) return null;
  const first = f.used_by[0];
  return `${first.table}: ${first.title}${f.used_by.length > 1 ? `, and ${f.used_by.length - 1} more` : ""}`;
}

function fileRow(f: FileItem): RecordRow {
  return {
    id: f.id,
    revision: 1,
    created_at: f.added_at ?? "",
    updated_at: f.added_at ?? "",
    provenance: {},
    values: {
      file: f.title,
      kind: f.kind.toUpperCase() || "File",
      size: Math.max(1, Math.round(f.size / 1024)),
      added: f.added_at ?? null,
      used_by: usedByWords(f),
      from: f.from_folder ? FROM.folder : FROM.here,
    },
  };
}

export function FilesView({ client, files, tableKey, onChanged }: { client: Client; files: FileItem[]; tableKey: string; onChanged: () => void }) {
  const [deleting, setDeleting] = useState<{ file: FileItem; what: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const table = useMemo(() => filesTable(tableKey, files), [tableKey, files]);
  const load = useMemo(() => () => Promise.resolve(files.map(fileRow)), [files]);
  const byId = new Map(files.map((f) => [f.id, f]));
  const askDelete = (f: FileItem) => {
    setProblem(null);
    client
      .documentRemoval(f.id)
      .then((plan) => setDeleting({ file: f, what: plan.what }))
      .catch((e: unknown) => setProblem(say(e)));
  };
  const held: HeldRows = {
    load,
    words: "Add files with the button above, or drop them on the page",
    actions: (row) => {
      const f = byId.get(row.id);
      if (!f) return null;
      return (
        <>
          {host.available() ? (
            <>
              <Button size="sm" onClick={() => void host.openPath(f.path)}>
                Open
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void host.revealPath(f.path)}>
                Show in Finder
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" disabled={f.from_folder} title={f.from_folder ? "Your own file in a folder you connected: remove it there, or disconnect the folder" : undefined} onClick={() => askDelete(f)}>
            Delete…
          </Button>
        </>
      );
    },
  };
  return (
    <>
      {problem ? (
        <p className="notice" role="alert">
          {problem}
        </p>
      ) : null}
      <DataPage client={client} table={table} held={held} version={0} onChanged={onChanged} />
      <Confirm
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.file.title}?` : ""}
        action="Delete"
        onConfirm={() => {
          const d = deleting;
          setDeleting(null);
          if (d) client.deleteDocument(d.file.id).then(onChanged).catch((e: unknown) => setProblem(`Couldn't delete it: ${say(e)}`));
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting ? `Deletes ${deleting.file.title}: ${deleting.what}. Rows Alpha read from it stay; their source still names the file. The journal keeps that it was here.` : null}
      </Confirm>
    </>
  );
}
