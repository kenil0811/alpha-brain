import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The five chip tones (rulebook §1). Every status in every project maps onto one of these. */
export type Tone = "green" | "yellow" | "red" | "blue" | "gray";

export type FieldType =
  | "text" | "longtext" | "number" | "money" | "percent" | "date" | "datetime"
  | "status" | "choice" | "relation" | "person" | "file" | "check";

export interface Option { value: string; tone: Tone; done?: boolean }

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: Option[];
  /** For relation fields: where the related record lives. */
  to?: { project: string; collection: string };
  width?: number;
  /** Hidden in the table by default, still on the record page. */
  hidden?: boolean;
  /** Computed by the platform; edits are forced edits. */
  computed?: boolean;
}

/** Where a value came from (rulebook §6 provenance marks, §7 Governance). */
export interface Provenance { kind: "estimated" | "assumed" | "source"; note: string }

export type Value = string | number | boolean | null | string[];

export interface Rec {
  id: string;
  [key: string]: Value | Record<string, Provenance> | undefined;
  _prov?: Record<string, Provenance>;
}

export interface Metric {
  label: string;
  value: (rows: Rec[]) => number | string | null;
  basis: (rows: Rec[]) => string;
  attention?: (rows: Rec[]) => boolean;
  icon: LucideIcon;
  /** The saved-list filter a click opens, when the tile is actionable. */
  filter?: (r: Rec) => boolean;
}

export interface SavedList { id: string; name: string; filter: (r: Rec) => boolean; star?: boolean }

export type ViewType = "table" | "board" | "calendar" | "timeline" | "gallery" | "chart" | "form" | "dashboard" | "list";

export interface Collection {
  id: string;
  label: string;
  /** The project's own word for a record ("Lead", "Request"). */
  word: string;
  icon: LucideIcon;
  /** The field that names a record. */
  titleKey: string;
  fields: Field[];
  records: Rec[];
  view?: ViewType;
  boardBy?: string;
  dateKey?: string;
  metrics?: Metric[];
  lists?: SavedList[];
  /** A slim notice above the table (rulebook §8 custom content). */
  notice?: string;
  /** Extra section cards on the record page (rulebook §8 custom content). */
  sections?: (r: Rec) => ReactNode;
  /** Adding is not possible here: the add row stays, disabled, with this reason. */
  noAdd?: string;
}

export interface Rule { text: string; why: string }

export interface Agent {
  id: string;
  name: string;
  does: string;
  skills: string[];
  runs: { when: string; what: string; result: string; tone: Tone }[];
  may: string[];
  mayNot: string[];
}

export interface Automation { id: string; sentence: string; trigger: string; next: string; on: boolean; agent?: string }

export interface Project {
  id: string;
  name: string;
  icon: LucideIcon;
  summary: string;
  collections: Collection[];
  agents: Agent[];
  automations: Automation[];
  allowed: Rule[];
  denied: Rule[];
  /** Where things are kept and read from (Governance). */
  kept: { what: string; where: string }[];
  files: { name: string; by: string; when: string; size: string }[];
  /** Alpha's page about the project (Intelligence section). */
  about: string;
  parent?: string;
}

/** Roles the workspace can be viewed as — the platform is multi-role; Alpha is one more worker. */
export type Role = "assistant" | "attorney" | "owner" | "intake" | "finance";

export interface Proposal {
  id: string;
  project: string;
  task: string;
  outcome: string;
  judged: string;
  /** For actions that leave the workspace. */
  payload?: string;
  reaches?: string;
  undo?: string;
  roles: Role[];
  recordLink?: string;
  state: "open" | "approved" | "declined";
}

export interface Due { id: string; title: string; when: string; bucket: "overdue" | "today" | "upcoming"; link: string; roles: Role[] }

export interface Activity { id: string; when: string; who: string; what: string; link?: string; failed?: boolean }
