import type { RecordRow, TableDesc } from "../core/client";
import type { FieldInfo } from "../modules/fields";
import type { Link, Relations } from "./cells";
import type { DataRow, ViewConfig } from "./engine";

/** What every registered view is handed by the shell. Filtering, searching and sorting are
 * done once, by the shell, with the field kinds; a view only draws `rows`. */
export interface ViewProps {
  table: TableDesc;
  /** The fields shown, in the person's order. */
  fields: FieldInfo[];
  /** Every field, shown or not (a board groups by a hidden field just as well). */
  allFields: FieldInfo[];
  titleField: string | undefined;
  view: ViewConfig;
  /** The rows to draw: this page of them for a paged view, all of them otherwise. */
  rows: DataRow[];
  /** Every row that matches, for footers that summarise past the page. */
  matching: DataRow[];
  record: (id: string) => RecordRow | undefined;
  /** A table fed by readers: show when each row was first seen and when it went. */
  seen?: boolean;
  relations: Relations;
  onViewChange: (next: ViewConfig) => void;
  onOpen: (id: string) => void;
  onOpenLink: (link: Link) => void;
  /** Save values on one row; resolves false when the core refused (the shell says why). */
  onEdit: (id: string, values: Record<string, unknown>) => Promise<boolean>;
  onAdd: (values: Record<string, unknown>) => Promise<boolean>;
  /** Open the new-row form, with some values already filled in. */
  onNew: (initial?: Record<string, string>) => void;
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], on: boolean) => void;
  empty: string | null;
  /** Delete one row. */
  onRemove: (id: string) => void;
}
