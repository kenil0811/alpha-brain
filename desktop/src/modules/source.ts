/**
 * Where a data view's rows come from, and what may be done to them (9 Oct). The one data view
 * (`DataPage`: every view, filter, sort, list, footer and column menu) draws any source: a table
 * the core keeps (`tableSource`), or rows the window already holds, such as Intelligence's agents,
 * skills, automations, facts and connections (`memorySource`). Each ability is optional; where a
 * source has none, the view keeps the control, disabled, with the source's reason (or a plain
 * default), never hidden.
 */
import type { Client, FileInfo, RecordRow, Relations, SavedList, TableDesc } from "../core/client";
import { host } from "../core/host";
import { PREF } from "../core/preferences";
import { downloadText, toCsv } from "./csv";
import { showValue, type FieldInfo } from "./fields";
import { humanize } from "./format";

export type SourceAbility = "edit" | "add" | "remove" | "lists" | "download" | "upload";

/** What a source hands the view when it loads: the rows, and what goes with them. */
export interface SourceData {
  records: RecordRow[];
  /** File fields' documents, by id. */
  files?: Record<string, FileInfo>;
  lists?: SavedList[];
  /** Relation fields' titles: field → id → title. */
  relations?: Relations;
}

/** A data view's source. `key` names everything the view remembers about it (layout, pins,
 *  footers, lists); for a table it is the table's name. Every ability is optional; without one,
 *  its controls stay visible, disabled, with `reasons[ability]` on hover. */
export interface DataSource {
  key: string;
  title: string;
  fields: FieldInfo[];
  /** The field that names a record; the first text field when absent. */
  titleField?: string | null;
  load(): Promise<SourceData>;
  /** Change some values of a row; resolves to the row as saved (its new revision). */
  edit?(row: RecordRow, values: Record<string, unknown>): Promise<RecordRow>;
  add?(values: Record<string, unknown>): Promise<RecordRow>;
  remove?(row: RecordRow): Promise<unknown>;
  duplicate?(row: RecordRow): Promise<unknown>;
  saveList?(title: string, config: SavedList["config"]): Promise<SavedList>;
  updateList?(id: string, change: { config?: SavedList["config"]; default?: boolean }): Promise<SavedList>;
  deleteList?(id: string): Promise<unknown>;
  /** Download the rows; resolves to the words that say what was downloaded and where. */
  exportAs?(format: "csv" | "xlsx"): Promise<string>;
  /** Put a file on a row's file field. */
  addFile?(row: RecordRow, field: FieldInfo, file: File): Promise<unknown>;
  reasons?: Partial<Record<SourceAbility, string>>;
}

const DEFAULT_REASON: Record<SourceAbility, string> = {
  edit: "These can't be changed here.",
  add: "Nothing can be added here.",
  remove: "These can't be deleted here.",
  lists: "Lists can't be kept here.",
  download: "This can't be downloaded.",
  upload: "Files can't be added here.",
};

/** Why a source can't do something, in its own words or a plain default. */
export function reasonFor(source: DataSource, ability: SourceAbility): string {
  return source.reasons?.[ability] ?? DEFAULT_REASON[ability];
}

const word = (n: number) => (n === 1 ? "record" : "records");

/** A table the core keeps: everything the data view did before sources (the core's routes). */
export function tableSource(client: Client, table: TableDesc): DataSource {
  const name = table.name;
  return {
    key: name,
    title: table.title,
    fields: table.fields as FieldInfo[],
    titleField: table.title_field,
    load: async () => {
      const r = await client.table(name);
      return { records: r.records, files: r.files, relations: r.relations, lists: await withOldLists(client, name, r.lists) };
    },
    edit: (row, values) => client.editRecord(name, row.id, values, row.revision),
    add: (values) => client.addRecord(name, values),
    duplicate: (row) => client.addRecord(name, { ...row.values }),
    remove: (row) => client.deleteRecord(name, row.id, row.revision),
    saveList: (title, config) => client.saveList(name, title, config),
    updateList: (id, change) => client.updateList(id, change),
    deleteList: (id) => client.deleteList(id),
    exportAs: async (format) => {
      const out = await client.exportTable(name, format);
      if (host.available()) await host.revealPath(out.path);
      return `Downloaded ${out.rows} ${word(out.rows)} to ${out.name}${host.available() ? "" : ` (${out.path})`}.`;
    },
    addFile: (row, field, file) => client.addFiles([file], { table: name, record: row.id, field: field.name }),
  };
}

/** The shape saved lists had in the window before they lived in the world (before 3 Oct). */
interface OldSavedList {
  title: string;
  filters: Record<string, string>;
  search: string;
  hideDone: boolean;
  hidden: string[];
}

/** Lists the window kept before 3 Oct move into the world once, then the key goes. */
async function withOldLists(client: Client, name: string, lists: SavedList[]): Promise<SavedList[]> {
  const key = `alpha.page.${name}.lists`;
  let old: OldSavedList[] = [];
  try {
    old = JSON.parse(localStorage.getItem(key) ?? "[]") as OldSavedList[];
  } catch {
    return lists;
  }
  if (!old.length) return lists;
  let kept = lists;
  for (const l of old) {
    try {
      kept = [...kept, await client.saveList(name, l.title, { search: l.search, filters: l.filters, hide_done: l.hideDone, hidden: l.hidden })];
    } catch {
      /* a list the table no longer fits is dropped */
    }
  }
  localStorage.removeItem(key);
  return kept;
}

/** Rows the window already holds, drawn by the same data view. Lists are kept for the person in
 *  `PREF.windowLists[key]`; Download writes a CSV of what is loaded. What the rows can have done
 *  to them comes from the caller (`edit`, `add`, …, each optional, with `reasons`). */
export function memorySource(o: Omit<DataSource, "load" | "saveList" | "updateList" | "deleteList" | "exportAs"> & { client: Client | null; rows: () => RecordRow[] | Promise<RecordRow[]> }): DataSource {
  const { client, rows, ...rest } = o;
  // ponytail: read, change, write the whole preference; two windows changing lists at once keep the last
  const read = async (): Promise<Record<string, SavedList[]>> => ((await client!.preference(PREF.windowLists)).value ?? {}) as Record<string, SavedList[]>;
  const write = async (change: (mine: SavedList[]) => SavedList[]) => {
    const all = await read();
    const next = change(all[o.key] ?? []);
    await client!.setPreference(PREF.windowLists, { ...all, [o.key]: next });
    return next;
  };
  const lists = client
    ? {
        saveList: async (title: string, config: SavedList["config"]) => {
          const now = new Date().toISOString();
          const made: SavedList = { id: `wl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, collection: o.key, title, config, is_default: false, source: null, created_at: now, updated_at: now };
          await write((mine) => [...mine, made]);
          return made;
        },
        updateList: async (id: string, change: { config?: SavedList["config"]; default?: boolean }) => {
          const now = new Date().toISOString();
          const next = await write((mine) => mine.map((l) => (l.id === id ? { ...l, config: change.config ?? l.config, is_default: change.default ?? l.is_default, updated_at: now } : change.default ? { ...l, is_default: false } : l)));
          const changed = next.find((l) => l.id === id);
          if (!changed) throw new Error("That list is gone.");
          return changed;
        },
        deleteList: (id: string) => write((mine) => mine.filter((l) => l.id !== id)),
      }
    : {};
  let loaded: RecordRow[] = [];
  return {
    ...rest,
    ...lists,
    reasons: { ...(client ? {} : { lists: "Alpha's core isn't running." }), ...rest.reasons },
    load: async () => {
      loaded = await rows();
      return { records: loaded, lists: client ? ((await read())[o.key] ?? []) : [] };
    },
    exportAs: async (format) => {
      if (format !== "csv") throw new Error("Excel needs Alpha's core here; download as CSV instead.");
      const head = o.fields.map((f) => f.label ?? humanize(f.name));
      downloadText(`${o.title}.csv`, toCsv([head, ...loaded.map((r) => o.fields.map((f) => showValue(r.values[f.name], f.kind, f.unit)))]));
      return `Downloaded ${loaded.length} ${word(loaded.length)} as ${o.title}.csv.`;
    },
  };
}
