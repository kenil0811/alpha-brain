/**
 * Intelligence › Connections as a table (13 Oct, Q42 section 7b; the feature from pull request #5,
 * the view main's own): every connection that is on, a row of the one data view with what it is,
 * its kind, its state, when it last read and its last problem. Its buttons (Read now or Check,
 * Remove) sit at the row's start, where a wide table never scrolls them away. What a kind can reach is the same for each connection of it, so
 * it is said once per kind under the table (`reachLines`), not in a column; the ways to add one
 * stay below that.
 */
import type { Connection, RecordRow, TableDesc } from "../../core/client";
import type { Colours } from "../../modules/views/engine";

export const CONNECTION_KIND: Record<string, string> = { files: "Folder", browser: "Site", calendar: "Calendar" };

/** What a connection is and what it can reach, in the words the cards said them. */
export const CONNECTOR: Record<string, { label: (c: Connection) => string; reach: string }> = {
  files: { label: (c) => c.target.split("/").slice(-2).join("/"), reach: "Reads the documents in this folder as they change; never changes your files" },
  browser: { label: (c) => `${c.target}, signed in as you`, reach: "Reads pages the way you would; never posts, messages or clicks" },
  calendar: { label: () => "Your calendars", reach: "Reads events and attendees; adds nothing without a yes" },
};

export const CONNECTION_STATUS: Record<Connection["status"], string> = { connected: "Connected", needs_ok: "Needs your OK", broken: "Not working", off: "Off" };

export function connectionsTable(connections: Connection[]): TableDesc {
  return {
    name: "intel_connections",
    title: "Connections",
    module: null,
    title_field: "what",
    records: connections.length,
    readonly: true,
    fields: [
      { name: "what", kind: "text", label: "What" },
      { name: "kind", kind: "choice", label: "Kind", choices: Object.values(CONNECTION_KIND) },
      { name: "status", kind: "status", label: "Status", choices: Object.values(CONNECTION_STATUS), done_choices: [CONNECTION_STATUS.connected] },
      { name: "last_read", kind: "datetime", label: "Last read" },
      // only when one has a problem: a column of dashes says nothing
      ...(connections.some((c) => c.last_error) ? [{ name: "problem", kind: "text", label: "Last problem" }] : []),
    ],
  };
}

export function connectionRow(c: Connection): RecordRow {
  const meta = CONNECTOR[c.connector];
  return {
    id: c.id,
    revision: 1,
    created_at: "",
    updated_at: c.last_sync ?? "",
    provenance: {},
    values: {
      what: meta ? meta.label(c) : c.target,
      kind: CONNECTION_KIND[c.connector] ?? c.connector,
      status: CONNECTION_STATUS[c.status],
      last_read: c.last_sync,
      problem: c.last_error,
    },
  };
}

/** What each kind present can reach, once per kind: "Sites: reads pages the way you would…". */
export function reachLines(connections: Connection[]): string[] {
  const kinds = [...new Set(connections.map((c) => c.connector))].filter((k) => CONNECTOR[k]);
  return kinds.map((k) => `${CONNECTION_KIND[k]}s: ${CONNECTOR[k].reach.charAt(0).toLowerCase()}${CONNECTOR[k].reach.slice(1)}.`);
}

export const CONNECTION_COLOURS: Colours = {
  tint: null,
  values: { status: { [CONNECTION_STATUS.connected]: "good", [CONNECTION_STATUS.needs_ok]: "warn", [CONNECTION_STATUS.broken]: "bad", [CONNECTION_STATUS.off]: "gray" } },
  rules: {},
};
