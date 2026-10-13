/**
 * The window's only way to the core: typed calls over its loopback HTTP API, with the token
 * the host handed over. Problems come back as plain sentences (the core's `error` field).
 */

export interface CoreSession {
  baseUrl: string;
  token: string;
}

export interface Field {
  name: string;
  kind: string;
  label?: string;
  unit?: string;
  required?: boolean;
  choices?: string[];
  done_choices?: string[];
  relation?: string;
}

export interface TableDesc {
  name: string;
  title: string;
  module: string | null;
  title_field: string | null;
  fields: Field[];
  records: number;
  created_at?: string;
  /** A program module's own table (Q38): read from its module.duckdb, never edited here. */
  readonly?: boolean;
}

/** The map of Alpha's own work (`/api/graph`): what Intelligence lists, as nodes, and how
 * each feeds the other, as edges with their source in the world. */
export type GraphKind = "work" | "world";
export interface GraphNode {
  id: string;
  kind: "module" | "table" | "skill" | "automation" | "source" | "connection" | "you" | "person" | "organisation" | "document" | "page" | "goal";
  title: string;
  subtitle?: string;
  /** A skill's role: read, act or run. */
  role?: "read" | "act" | "run";
  /** ok, broken, untried (skills); on, off, problem (automations); a source's status; a connection's. */
  state?: string;
  detail?: string;
  module?: string | null;
  name?: string;
  description?: string;
  rows?: number;
  runs?: number;
  failed?: number;
  /** A source's site (its subtitle is its address). */
  site?: string;
  /** The brain's map: how much happened here in 30 days; what Alpha knows about the person. */
  activity?: number;
  facts?: { predicate: string; value: string }[];
  entity?: string;
}
export interface GraphEdge {
  from: string;
  to: string;
  kind: "in" | "runs" | "reads into" | "tells" | "read by" | "signed in at" | "feeds" | "about" | "row in" | "named in" | "related" | "of";
  order?: number;
  count?: number;
  source?: string;
  /** A `related` edge is a fact: suggested by Alpha until the person decides, then accepted. */
  state?: "suggested" | "accepted";
  fact?: string;
  why?: string;
}
export interface WorkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  at: string;
}

/** For each relation field into another table, the titles of the records the rows point at, by id. */
export type Relations = Record<string, Record<string, string>>;

export interface TableSummary {
  name: string;
  title: string;
  module: string | null;
  records: number;
}

/** What a row's values rest on: "stated" by the person, "estimated" by Alpha, or where Alpha
 * looked them up (a URL or a few words naming the page); `assumed` is what Alpha had to assume. */
export interface Provenance {
  by?: string;
  turn?: string | null;
  estimated?: boolean;
  source?: string;
  assumed?: string;
  /** The reader that wrote these values, when one did. */
  reader?: string;
  /** Per value, what a part wrote (§12): where it came from and when, or why it could not. */
  fields?: Record<string, { source?: string; fetched_at?: string; problem?: string; part?: string; attempts?: number }>;
}

/** A saved list: a named way of looking at a table, kept in the world (the person's or Alpha's). */
export interface SavedList {
  id: string;
  collection: string;
  title: string;
  config: { search?: string; filters?: Record<string, string>; hide_done?: boolean; show_gone?: boolean; hidden?: string[]; footers?: Record<string, string>; sort?: { field: string; direction: "asc" | "desc" } | null; sorts?: { field: string; direction: "asc" | "desc" }[]; rules?: { match: "all" | "any"; rules: { field: string; op: "is" | "is_not" | "contains" | "not_contains" | "starts" | "ends" | "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "between" | "before" | "after" | "on_before" | "on_after" | "within" | "in" | "checked" | "unchecked" | "empty" | "not_empty"; value: string; value2?: string; values?: string[] }[] }; view?: string; group_by?: string; date_by?: string; measure?: string };
  is_default: boolean;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordRow {
  id: string;
  revision: number;
  values: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  provenance: Provenance;
  /** Rows a reader keeps: when it last returned the row, and when it stopped returning it. */
  seen_at?: string | null;
  gone_at?: string | null;
  entity?: string | null;
}

export interface JournalEntry {
  id: string;
  at: string;
  kind: string;
  actor: string;
  text: string;
  data: Record<string, unknown>;
  module: string | null;
  thread: string | null;
  entity_ids: string[];
  source: string | null;
  snippet?: string;
}

export interface Thread {
  id: string;
  title: string;
  kind: string;
  state: string;
  module: string | null;
  session_ref: string | null;
  created_at: string;
  updated_at: string;
  steps?: { at: string; kind: string; text: string }[];
  step_count?: number;
  last_at?: string;
  live?: Live | null;
}

/** What deleting a module for good would take, in numbers and in words. */
export interface RemovalPlan {
  module: string;
  tables: number;
  rows: number;
  files: number;
  readers: string[];
  automations: number;
  inside: string[];
  what: string;
}

/** A module removed with its data kept (Settings › Removed modules). */
export interface RemovedModule {
  id: string;
  name: string;
  removed_at: string;
  path: string[];
  holds: string;
  tables: number;
  rows: number;
  inside: string[];
}

export interface ModuleCard {
  id: string;
  name: string;
  goal: string | null;
  /** The module this one sits inside, if any (Q31: modules nest, any depth). */
  parent?: string | null;
  /** Names from the top down: ["Job", "Search"]. */
  path?: string[];
  /** The ids of the modules inside this one. */
  children?: string[];
  tables: TableSummary[];
  records: number;
  last_at: string | null;
  last_text: string | null;
  threads: Thread[];
  created_at: string;
}

/** A module's place in words: "Job › Search". */
export function moduleWords(m: Pick<ModuleCard, "name" | "path">): string {
  return m.path?.length ? m.path.join(" › ") : m.name;
}

export interface Goal {
  id: string;
  text: string;
  state: string;
  module: string | null;
  since: string;
}

export interface Note {
  id: string;
  scope: string;
  title: string;
  body: string;
  summary?: string | null;
  updated_at: string;
}

/** One change to a record (its page's History): the fields that differ from the revision
 *  before, what they were and became, when, and the provenance of the new values. */
export interface RecordChange {
  revision: number;
  at: string | null;
  by: Provenance;
  fields: { field: string; before: unknown; after: unknown }[];
}

/** A page of a record's changes, newest first; `more` says an older page is there. */
export interface RecordHistory {
  changes: RecordChange[];
  more: boolean;
  added: { at: string; by: Provenance } | null;
}

export interface ModuleDetail extends Omit<ModuleCard, "tables"> {
  tables: TableDesc[];
  /** The modules inside this one, as cards. */
  inside?: ModuleCard[];
  activity: JournalEntry[];
  note: Note | null;
  goals: Goal[];
  automations: Automation[];
  sources: Source[];
}

export interface Part {
  id: string;
  step: string;
  title: string;
  reads: { thing: string; fields: string[] };
  fills: { thing: string; fields: string[] };
  when: string;
  reaches: string[];
}

/** A place a module reads from, and whether it works (kept by the platform from what happened). */
export interface Source {
  id: string;
  module: string | null;
  title: string;
  url: string;
  site: string;
  reader: string | null;
  status: "working" | "needs_signin" | "blocked" | "broken" | "not_built" | "unavailable" | "skipped";
  detail: string | null;
  last_checked: string | null;
  last_rows: number | null;
}

/** A question the workflow page asks before its build: its choices and the one Alpha would
 *  take. */
export interface Question {
  text: string;
  options: string[];
  default: string | null;
  answer: string | null;
  /** The core read it out of the reply; the model didn't put it on the page itself. */
  derived?: boolean;
}

/** A module as the person's workflow (§12, Q39): the page Alpha drafts from the interview and
 *  changes only through the conversation; the person says yes to it. */
export interface WorkflowStep {
  id: string;
  title: string;
  what: string;
  who: "alpha" | "you" | "both";
  takes: string | null;
  gives: string | null;
  reaches: string[];
  outward: boolean;
  when: string;
}
export interface WorkflowBody {
  purpose: string;
  steps: WorkflowStep[];
  keeps: { key: string; thing: string; what: string | null; fields: { name: string; label: string; kind: string; unit: string | null }[]; relates_to: string[] }[];
  documents: { name: string; from: string; for: string | null; what: string | null }[];
  settings: { key: string; label: string; value: unknown; unit: string | null; origin: string; why: string | null }[];
  assumptions: string[];
  suggestions: { id: string; title: string; what: string; why: string | null; sources: string[]; decision: "accept" | "skip" | null }[];
  questions: Question[];
}
export interface Workflow {
  id: string;
  title: string;
  body: WorkflowBody;
  words: string | null;
  state: "drafted" | "agreed" | "building" | "built" | "stopped" | "declined" | "removed";
  version: number;
  conversation: string | null;
  module: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableSummaryData {
  name: string;
  title: string;
  rows: number;
  added_this_week: number;
  amounts?: { field: string; label: string; unit: string | null; how: "total" | "average"; today: number | null; this_week: number | null }[];
  split?: { field: string; label: string; counts: Record<string, number>; done: string[] };
}

export interface ModuleSummary {
  tables: TableSummaryData[];
  goals: Goal[];
  next_run: string | null;
  automations: number;
}

export interface Action {
  id: string;
  procedure: string;
  title: string;
  payload: Record<string, string>;
  evidence: string | null;
  undo: string;
  effect: "prepare" | "send";
  site: string;
  state: "proposed" | "approved" | "running" | "done" | "failed" | "declined";
  module: string | null;
  preview: string | null;
  preview_note: string | null;
  shots: Record<string, string>;
  files?: Record<string, { id: string; name: string; size: number }>;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  kind: string;
  /** When it was added (slice 2 G6). */
  added_at?: string;
}

export interface DocumentInfo {
  id: string;
  path: string;
  title: string;
  kind: string;
  size: number;
  module: string | null;
  origin: string | null;
  /** When Alpha took or first read it (slice 2 G6). */
  added_at?: string;
  /** A connected folder's own file: never deleted here. */
  from_folder?: boolean;
  /** The person or company it is kept about (B11). */
  about?: string | null;
}

/** A file as a module or a person's page lists it (B8, B11): with the records that hold it. */
export interface FileItem extends DocumentInfo {
  used_by: { collection: string; table: string; record: string; title: string; field: string }[];
}

export interface Permission {
  id: string;
  sentence: string;
  procedure: string;
  effect: string;
  granted_at: string;
}

export interface NeedItem {
  kind: "ask" | "proposal" | "fact" | "action" | "workflow";
  id: string;
  text: string;
  why?: string | null;
  at: string;
  options?: string[];
  /** The turn that asked it: questions asked together are answered together. */
  turn?: string | null;
  module?: string | null;
  action?: Action;
  workflow?: Workflow;
}

export interface CalendarItem {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  calendar: string | null;
  attendees: { name: string | null; email: string; entity_id: string }[];
}

export interface Home {
  date: string;
  needs_you: NeedItem[];
  ran_today: number;
  failed_today: number;
  modules: ModuleCard[];
  loose_tables: TableSummary[];
  coming_up: CalendarItem[];
  threads: Thread[];
  brief: null | Record<string, unknown>;
}

export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  valid_from: string;
  valid_to: string | null;
  recorded_at: string;
  source: string;
  why: string | null;
  confidence: number;
  state: string;
}

export interface Entity {
  id: string;
  kind: string;
  name: string;
  aliases: string[];
  keys: Record<string, string[]>;
  last_at?: string | null;
  last_text?: string | null;
  /** The one line of the entity's wiki page, when Alpha has written one. */
  summary?: string | null;
}

export interface EntityDetail extends Entity {
  facts: Fact[];
  timeline: JournalEntry[];
  maybe_same: Entity[];
  /** The entity's page of Alpha's wiki: who they are to the person, what is going on. */
  page: Note | null;
}

/** Whether Alpha can think: Claude Code on this Mac, signed in to the person's Claude. */
export interface ClaudeStatus {
  installed: boolean;
  signed_in: boolean;
  email?: string | null;
  plan?: string | null;
  via?: "subscription" | "console" | "chatgpt" | "api_key" | "unknown";
}

/** Alpha's own browser (Playwright's Chromium) on this Mac, with which it reads pages: installed
 * once, by Alpha, on first run; `words` is the installer's progress while it runs. */
export interface BrowserStatus {
  installed: boolean;
  installing: boolean;
  words: string | null;
  /** Sign-in windows open in the person's own Chrome when it is there. */
  chrome: boolean;
  problem: string | null;
}

/** Which way Alpha thinks (Q32): Claude through Claude Code, or ChatGPT through the Codex
 * CLI, each on the person's own subscription; the choice and both states. */
export type ThinkRoute = "claude" | "codex";
export interface Thinking {
  route: ThinkRoute;
  claude: ClaudeStatus;
  codex: ClaudeStatus;
}

export interface DataInfo {
  folder: string;
  size: number;
  backups: { name: string; size: number; at: string }[];
}

export interface ConnectionRemoval {
  connector: string;
  target: string;
  /** What goes, in words: "Alpha's sign-in, 1 reader and 1 automation". */
  what: string;
  readers: string[];
  automations: string[];
}

export interface Connection {
  id: string;
  connector: string;
  target: string;
  status: "connected" | "needs_ok" | "broken" | "off";
  config: Record<string, unknown>;
  last_sync: string | null;
  last_error: string | null;
}

/** A hand: a built-in connector (browser, files, calendar) and the tools it gives Alpha. */
export interface Hand {
  name: string;
  title: string;
  description: string | null;
  tools: { name: string; effect: string; description?: string }[];
  origin: string | null;
}

/** Know-how Alpha wrote: a reader (read), a procedure (act) or a pipeline (run). */
export interface Skill {
  name: string;
  kind: "read" | "act" | "run";
  site: string | null;
  module: string | null;
  url: string | null;
  description: string;
  when_to_use: string | null;
  effect: string | null;
  fields: string[];
  version: number;
  health: "ok" | "broken" | "untried";
  last_problem: string | null;
  last_run_at: string | null;
  last_count: number | null;
  last_ok_count: number | null;
  source: string | null;
  updated_at: string;
  notes: string | null;
}

export interface SkillDetail extends Omit<Skill, "notes"> {
  script?: string | null;
  steps?: Record<string, unknown>[];
  verify?: Record<string, unknown>[];
  to_end?: boolean;
  whole?: boolean;
  notes: Note | null;
  runs: { at: string; kind: string; text: string }[];
}

export interface AutomationDetail extends Automation {
  skill?: string | null;
  /** A pipeline's saved steps (its run skill's), or none for a procedure. */
  pipeline?: Record<string, unknown>[] | null;
  runs: Run[];
  /** The agent's page: what it is for, what a good run looks like, what to do; Alpha writes it, the person edits it. */
  guidelines?: Note | null;
  /** What counts as a good run, in words, judged by code. */
  good_run?: string;
}

export interface Intelligence {
  hands: Hand[];
  skills: Skill[];
  automations: Automation[];
  readers: Reader[];
  connections: Connection[];
  knowledge: { facts: Fact[]; notes: Note[]; goals: Goal[]; permissions?: Permission[] };
}

export interface Automation {
  id: string;
  title: string;
  module: string | null;
  thread: string | null;
  schedule: string;
  when: string;
  procedure: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_result: string | null;
  last_error: string | null;
  running?: boolean;
  steps?: { at: string; kind: string; text: string }[];
  /** What it is for, in the person's words (Q33). */
  goal?: string | null;
  /** The last run's verdict, judged by code, and why. */
  last_verdict?: Verdict | null;
  last_why?: string | null;
}

export type Verdict = "succeeded" | "partial" | "failed";

/** One run of an agent, as the runs table keeps it. */
export interface Run {
  id: string;
  started_at: string;
  ended_at: string | null;
  verdict: Verdict | null;
  why: string | null;
  line: string | null;
  model_ms: number;
  repairs: number;
  read: number | null;
  sources: number | null;
  lines: { at: string; kind: string; text: string }[];
}

export interface Reader {
  name: string;
  site: string;
  url: string;
  description: string;
  version: number;
  health: "ok" | "broken";
  last_problem: string | null;
  last_run_at: string | null;
  last_count: number | null;
}

export interface Convo {
  id: string;
  title: string;
  kind: string;
  state: string;
  module: string | null;
  scope: string;
  question: string | null;
  last: string | null;
  last_at: string;
  updated_at: string;
  live?: Live | null;
}

export interface Live {
  thought: string | null;
  doing: string | null;
  tools: number;
  at: number | null;
  /** The reply's text as the model writes it (Q35); the whole reply lands when the turn ends. */
  partial?: string | null;
  first_text_at?: number | null;
}

export interface Ask {
  id: string;
  text: string;
  at: string;
  options: string[];
  thread: string | null;
  module: string | null;
  /** The turn whose reply asked it; `derived` when the core made the card from a question
   * the model left in prose (Q35). */
  turn?: string | null;
  derived?: boolean;
}

export interface Turn {
  id: string | null;
  /** "routing": the companion's sentence is being placed in a conversation (a judge may run). */
  state: "routing" | "running" | "done" | "failed" | "asked";
  text: string;
  conversation?: Convo | null;
  /** When the sentence had to be routed and Alpha wasn't sure: the question to answer. */
  ask?: string;
  options?: string[];
  steps?: { at: string; kind: string; text: string }[];
  live?: Live | null;
  reply?: string;
  said?: string;
  replied?: string;
  duration_ms?: number | null;
  started_at: string;
}

export interface Conversation {
  turns: JournalEntry[];
  threads: Thread[];
  running: Turn[];
  workflows?: Workflow[];
  actions?: Action[];
  asks?: Ask[];
  conversation?: Convo | null;
  conversations?: Convo[];
}

/** What changed since a stamp (`/api/changes`): the window's one poll. */
export interface Changed {
  at: string;
  journal: number;
  kinds: string[];
  tables: string[];
  modules: string[];
  entities: string[];
  threads: boolean;
  workflows: boolean;
  actions: boolean;
  working: boolean;
}

/** A run that went wrong in the last day: the companion says so (8 Oct). */
export interface Trouble {
  id: string;
  title: string;
  at: string;
  words: string;
  module: string | null;
}

export interface Companion {
  focus: Convo | null;
  conversations: Convo[];
  needs_you: NeedItem[];
  troubles?: Trouble[];
  /** The look the person chose for the companion (`avatar/looks.ts` reads it), or null. */
  look?: unknown;
}

export interface SearchResult {
  records: { collection: string; id: string; snippet: string }[];
  documents: { id: string; title: string; path: string; snippet: string }[];
  people: Entity[];
  journal: JournalEntry[];
}

export class CoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** What the window says when the core can't be reached at all. */
export const NOT_ANSWERING = "Alpha's core isn't answering. It restarts on its own; try again in a moment.";

/** The core's answer to a request it refused, in words a person reads (13 Oct, Q42 section 9a):
 *  its own words when it gave some (a refusal from the world, a sign-in), else what the status
 *  means; the technical detail goes to the console, never to the screen. */
export function plainError(status: number, data: { error?: unknown; detail?: unknown }): string {
  const words = typeof data.error === "string" ? data.error : typeof data.detail === "string" && data.detail !== "Not Found" ? data.detail : null;
  if (words) return words;
  if (data.detail !== undefined || data.error !== undefined) console.error("Alpha's core answered", status, data);
  if (status === 404) return "That isn't there any more; it may have been removed.";
  if (status === 422 || status === 400) return "Alpha's core couldn't take that. Try again.";
  return "Something went wrong in Alpha's core. Try again.";
}

/** Any error in words for the screen: the core's own words as they are; a fault in the window
 *  itself as one plain sentence, its detail to the console. The host answers in words of its
 *  own (strings), which pass through. */
export function say(e: unknown): string {
  if (e instanceof CoreError) return e.message;
  if (typeof e === "string" && e.trim()) return e; // the Mac host's own words (a Tauri command's refusal)
  console.error(e);
  return "Something went wrong here. Try again.";
}

type Raw = Record<string, unknown> & { id: string; revision: number; created_at: string; updated_at: string; _provenance?: Provenance; _seen_at?: string; _gone_at?: string; _entity?: string };

export function toRow(raw: Raw): RecordRow {
  const { id, revision, created_at, updated_at, _provenance, _seen_at, _gone_at, _entity, ...values } = raw;
  return { id, revision, created_at, updated_at, values, provenance: _provenance ?? {}, seen_at: _seen_at ?? null, gone_at: _gone_at ?? null, entity: _entity ?? null };
}

export class Client {
  constructor(readonly session: CoreSession) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.session.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.session.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      console.error("Alpha's core isn't answering", e);
      throw new CoreError(NOT_ANSWERING, 0);
    }
    const data = (await response.json().catch(() => ({}))) as { error?: unknown; detail?: unknown };
    if (!response.ok) throw new CoreError(plainError(response.status, data), response.status);
    return data as T;
  }

  health = () => this.call<{ ok: boolean; world: string }>("GET", "/api/health");
  /** What changed since `since`; without one, the stamp to start from. */
  changes = (since: string | null) => this.call<Changed>("GET", `/api/changes${since ? `?since=${encodeURIComponent(since)}` : ""}`);
  claude = () => this.call<ClaudeStatus>("GET", "/api/claude");
  browser = () => this.call<BrowserStatus>("GET", "/api/browser");
  installBrowser = () => this.call<BrowserStatus>("POST", "/api/browser/install");
  thinking = () => this.call<Thinking>("GET", "/api/thinking");
  setThinking = (route: ThinkRoute) => this.call<Thinking>("PUT", "/api/thinking", { route });
  installCodex = () => this.call<{ started: boolean }>("POST", "/api/codex/install");
  signInCodex = () => this.call<{ started: boolean }>("POST", "/api/codex/signin");
  signOutCodex = () => this.call<ClaudeStatus>("POST", "/api/codex/signout");
  installClaude = () => this.call<{ started: boolean }>("POST", "/api/claude/install");
  signInClaude = () => this.call<{ started: boolean }>("POST", "/api/claude/signin");
  signOutClaude = () => this.call<ClaudeStatus>("POST", "/api/claude/signout");
  dataInfo = () => this.call<DataInfo>("GET", "/api/data");
  backUp = () => this.call<DataInfo>("POST", "/api/data/backup");
  home = () => this.call<Home>("GET", "/api/home");
  modules = () => this.call<ModuleCard[]>("GET", "/api/modules");
  module = (ref: string) => this.call<ModuleDetail>("GET", `/api/modules/${encodeURIComponent(ref)}`);
  /** The parts a program module declared (§12): the steps Alpha does, each with when it runs. */
  parts = (module: string) => this.call<Part[]>("GET", `/api/modules/${encodeURIComponent(module)}/parts`);
  runPart = (module: string, part: string, row: string) =>
    this.call<{ ok: boolean; exit: number; values?: Record<string, unknown>; problems?: Record<string, string>; output: string }>("POST", `/api/modules/${encodeURIComponent(module)}/parts/${encodeURIComponent(part)}/run`, { row });
  moduleSummary = (ref: string) => this.call<ModuleSummary>("GET", `/api/modules/${encodeURIComponent(ref)}/summary`);
  /** Put a module inside another (or at the top with null); everything in it moves with it. */
  moveModule = (ref: string, parent: string | null) => this.call<ModuleCard>("POST", `/api/modules/${encodeURIComponent(ref)}/move`, { parent });
  /** A module's lifecycle (13 Oct, slice 2 A1–A4): a new name; what deleting it for good would
   *  take; removed with its data kept (restorable); restored; deleted for good; the removed ones. */
  renameModule = (ref: string, name: string) => this.call<ModuleCard>("POST", `/api/modules/${encodeURIComponent(ref)}/rename`, { name });
  moduleRemoval = (ref: string) => this.call<RemovalPlan>("GET", `/api/modules/${encodeURIComponent(ref)}/removal`);
  removeModule = (ref: string) => this.call<{ id: string; name: string; removed_at: string }>("POST", `/api/modules/${encodeURIComponent(ref)}/remove`);
  restoreModule = (ref: string) => this.call<ModuleCard>("POST", `/api/modules/${encodeURIComponent(ref)}/restore`);
  deleteModule = (ref: string) => this.call<Record<string, unknown>>("DELETE", `/api/modules/${encodeURIComponent(ref)}`);
  removedModules = () => this.call<RemovedModule[]>("GET", "/api/modules/removed");
  /** A module the person makes here: a place to hold others. Nothing is built. */
  createModule = (name: string, goal: string | null, parent: string | null) => this.call<ModuleCard>("POST", "/api/modules", { name, goal, parent });
  /** The module's page of Alpha's wiki, or none yet. */
  modulePage = (ref: string) => this.call<{ name: string; scope: string; page: Note | null }>("GET", `/api/modules/${encodeURIComponent(ref)}/page`);

  async table(name: string): Promise<{ table: TableDesc; records: RecordRow[]; files: Record<string, FileInfo>; lists: SavedList[]; relations: Relations }> {
    const data = await this.call<{ table: TableDesc; records: Raw[]; files?: Record<string, FileInfo>; lists?: SavedList[]; relations?: Relations }>("GET", `/api/tables/${encodeURIComponent(name)}`);
    return { table: data.table, records: data.records.map(toRow), files: data.files ?? {}, lists: data.lists ?? [], relations: data.relations ?? {} };
  }
  /** One record of a table, for a relation followed into another table. */
  async record(table: string, id: string): Promise<{ table: TableDesc; record: RecordRow; relations: Relations; note: Note | null }> {
    const data = await this.call<{ table: TableDesc; record: Raw; relations?: Relations; note?: Note | null }>("GET", `/api/tables/${encodeURIComponent(table)}/records/${encodeURIComponent(id)}`);
    return { table: data.table, record: toRow(data.record), relations: data.relations ?? {}, note: data.note ?? null };
  }
  /** A record's changes, newest first, a page at a time; `before` asks for the ones older than a revision. */
  recordHistory = (table: string, id: string, before?: number) =>
    this.call<RecordHistory>("GET", `/api/tables/${encodeURIComponent(table)}/records/${encodeURIComponent(id)}/history${before === undefined ? "" : `?before=${before}`}`);
  /** A field the person adds, and a field's name changed (13 Oct, slice 2 B1, B2). */
  addField = (table: string, field: { label: string; kind: string; choices?: string[]; done_choices?: string[]; unit?: string }) => this.call<TableDesc>("POST", `/api/tables/${encodeURIComponent(table)}/fields`, field);
  renameField = (table: string, field: string, label: string) => this.call<TableDesc>("POST", `/api/tables/${encodeURIComponent(table)}/fields/${encodeURIComponent(field)}/rename`, { label });
  addRecord = async (table: string, values: Record<string, unknown>) => toRow(await this.call<Raw>("POST", `/api/tables/${encodeURIComponent(table)}/records`, { values }));
  editRecord = async (table: string, id: string, values: Record<string, unknown>, revision: number) =>
    toRow(await this.call<Raw>("PATCH", `/api/tables/${encodeURIComponent(table)}/records/${id}`, { values, revision }));
  deleteRecord = (table: string, id: string, revision: number) => this.call<{ removed: string }>("DELETE", `/api/tables/${encodeURIComponent(table)}/records/${id}?revision=${revision}`);

  people = (q?: string) => this.call<Entity[]>("GET", `/api/people${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  entity = (id: string) => this.call<EntityDetail>("GET", `/api/entities/${id}`);
  merge = (keep: string, other: string) => this.call<Entity>("POST", `/api/entities/${keep}/merge/${other}`);

  intelligence = () => this.call<Intelligence>("GET", "/api/intelligence");
  graph = (kind: GraphKind = "work") => this.call<WorkGraph>("GET", `/api/graph?kind=${kind}`);
  /** Alpha looks over the map of the brain for links and keeps the grounded ones as suggestions. */
  connectGraph = () => this.call<{ proposed: { fact: string; from: string; to: string; relation: string; why: string }[]; why: string | null }>("POST", "/api/graph/connect");
  writeNote = (scope: string, title: string, body: string, summary?: string) => this.call<Note>("POST", "/api/notes", { scope, title, body, summary });
  connectFolder = (path: string) => this.call<Connection>("POST", "/api/connections/folder", { path });
  connectSite = (site: string) => this.call<Connection>("POST", "/api/connections/site", { site });
  connectCalendar = () => this.call<Connection>("POST", "/api/connections/calendar");
  syncConnection = (id: string) => this.call<Record<string, unknown>>("POST", `/api/connections/${id}/sync`);
  connectionRemoval = (id: string) => this.call<ConnectionRemoval>("GET", `/api/connections/${id}/removal`);
  removeConnection = (id: string) => this.call<ConnectionRemoval>("DELETE", `/api/connections/${id}`);

  activity = (params: { q?: string; module?: string; limit?: number; kind?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
    return this.call<JournalEntry[]>("GET", `/api/activity?${qs}`);
  };
  search = (q: string) => this.call<SearchResult>("GET", `/api/search?q=${encodeURIComponent(q)}`);

  /** Files the person dropped: kept for the module and read by Alpha. */
  /** Files (13 Oct, slice 2 B8, B11, G4): a module's, a person's or company's; what deleting
   *  one would do; deleting it. */
  moduleFiles = (ref: string) => this.call<FileItem[]>("GET", `/api/modules/${encodeURIComponent(ref)}/files`);
  entityFiles = (eid: string) => this.call<FileItem[]>("GET", `/api/entities/${encodeURIComponent(eid)}/files`);
  documentRemoval = (did: string) => this.call<{ document: string; title: string; what: string; used_by: FileItem["used_by"] }>("GET", `/api/documents/${encodeURIComponent(did)}/removal`);
  deleteDocument = (did: string) => this.call<Record<string, unknown>>("DELETE", `/api/documents/${encodeURIComponent(did)}`);
  addFiles = async (files: File[], where: { module?: string | null; table?: string; record?: string; field?: string; about?: string }): Promise<{ documents: DocumentInfo[]; turn: Turn | null }> => {
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    if (where.module) form.append("module", where.module);
    if (where.table) form.append("table", where.table);
    if (where.record) form.append("record", where.record);
    if (where.field) form.append("field", where.field);
    if (where.about) form.append("about", where.about);
    let response: Response;
    try {
      response = await fetch(`${this.session.baseUrl}/api/files`, { method: "POST", headers: { Authorization: `Bearer ${this.session.token}` }, body: form });
    } catch (e) {
      console.error("Alpha's core isn't answering", e);
      throw new CoreError(NOT_ANSWERING, 0);
    }
    const data = (await response.json().catch(() => ({}))) as { error?: unknown; detail?: unknown; documents?: DocumentInfo[]; turn?: Turn | null };
    if (!response.ok) throw new CoreError(plainError(response.status, data), response.status);
    return { documents: data.documents ?? [], turn: data.turn ?? null };
  };
  exportTable = (name: string, format: "csv" | "xlsx") => this.call<{ path: string; name: string; rows: number }>("POST", `/api/tables/${name}/export`, { format });
  document = (id: string) => this.call<DocumentInfo>("GET", `/api/documents/${id}`);
  conversation = (module?: string | null, conversation?: string | null) => {
    const qs = new URLSearchParams();
    if (module) qs.set("module", module);
    if (conversation) qs.set("conversation", conversation);
    const q = qs.toString();
    return this.call<Conversation>("GET", `/api/conversation${q ? `?${q}` : ""}`);
  };
  /** Live conversations and work items; `done` adds the finished ones (the Assistant page's history). */
  conversations = (module?: string | null, done = false) => {
    const qs = new URLSearchParams();
    if (module) qs.set("module", module);
    if (done) qs.set("done", "true");
    const q = qs.toString();
    return this.call<Convo[]>("GET", `/api/conversations${q ? `?${q}` : ""}`);
  };
  newConversation = (module?: string | null, title?: string) => this.call<Convo>("POST", "/api/conversations", { module: module ?? null, title: title ?? null });
  closeConversation = (id: string) => this.call<Convo>("POST", `/api/conversations/${id}/close`);
  focusConversation = (id: string) => this.call<{ focus: string }>("POST", `/api/conversations/${id}/focus`);
  companion = () => this.call<Companion>("GET", "/api/companion");
  /** A choice of look the person made, kept in the world; the window owns its shape. */
  preference = (key: string) => this.call<{ key: string; value: unknown }>("GET", `/api/preferences/${encodeURIComponent(key)}`);
  setPreference = (key: string, value: unknown) => this.call<{ key: string; value: unknown }>("PUT", `/api/preferences/${encodeURIComponent(key)}`, { value });
  moveTurn = (key: string, conversation: string) => this.call<Turn>("POST", `/api/turns/${key}/move`, { conversation });
  ask = (text: string, opts: { module?: string | null; thread?: string | null; conversation?: string | null } = {}) => this.call<Turn>("POST", "/api/ask", { text, module: opts.module ?? null, thread: opts.thread ?? null, conversation: opts.conversation ?? null });
  turn = (id: string) => this.call<Turn>("GET", `/api/turns/${id}`);
  thread = (id: string) => this.call<Thread & { journal: JournalEntry[] }>("GET", `/api/threads/${id}`);

  /** Ask and wait for the answer, polling every `every` ms (a second; the conversation asks
   * twice a second so the reply's text shows as it is written). */
  async askAndWait(text: string, opts: { module?: string | null; thread?: string | null; conversation?: string | null } = {}, onTick?: (t: Turn) => void, every = 1000): Promise<Turn> {
    const turn = await this.ask(text, opts);
    return this.waitTurn(turn, onTick, 8, every);
  }
  /** Follow a started turn to its end (a routing question comes back as is). A poll the core
   * does not answer is tried again for a while before the turn counts as lost: one missed poll
   * used to end the turn in the window while the core kept working (3 Oct). A core that says
   * it knows no such turn (it restarted) ends the wait at once. */
  async waitTurn(turn: Turn, onTick?: (t: Turn) => void, patience = 8, every = 1000): Promise<Turn> {
    let current = turn;
    let misses = 0;
    while ((current.state === "running" || current.state === "routing") && current.id) {
      await new Promise((r) => setTimeout(r, every));
      try {
        current = await this.turn(current.id);
        misses = 0;
      } catch (e) {
        const transient = e instanceof CoreError && (e.status === 0 || e.status >= 500);
        if (!transient || ++misses >= patience) throw e;
        continue;
      }
      onTick?.(current);
    }
    return current;
  }

  saveList = (table: string, title: string, config: SavedList["config"], isDefault = false) => this.call<SavedList>("POST", `/api/tables/${encodeURIComponent(table)}/lists`, { title, config, default: isDefault });
  updateList = (id: string, change: { title?: string; config?: SavedList["config"]; default?: boolean }) => this.call<SavedList>("PATCH", `/api/lists/${id}`, change);
  deleteList = (id: string) => this.call<SavedList>("DELETE", `/api/lists/${id}`);
  skillPage = (name: string) => this.call<SkillDetail>("GET", `/api/skills/${encodeURIComponent(name)}`);
  automationPage = (id: string) => this.call<AutomationDetail>("GET", `/api/automations/${encodeURIComponent(id)}`);
  switchAutomation = (id: string, enabled: boolean) => this.call<Automation>("PATCH", `/api/automations/${id}`, { enabled });
  runAutomation = (id: string) => this.call<Automation>("POST", `/api/automations/${id}/run`);

  answerAsk = (id: string, text: string) => this.call<{ answered: string; turn: Turn | null }>("POST", `/api/asks/${id}/answer`, { text });
  /** Questions asked together, answered together: ask id → words; one turn carries them. */
  answerAsks = (answers: Record<string, string>) => this.call<{ answered: string[]; turn: Turn | null }>("POST", "/api/asks/answer", { answers });
  dismissAsk = (id: string) => this.call<{ dismissed: string }>("POST", `/api/asks/${id}/dismiss`);
  approveAction = (id: string, always: boolean) => this.call<Action>("POST", `/api/actions/${id}/approve`, { always });
  declineAction = (id: string) => this.call<Action>("POST", `/api/actions/${id}/decline`);
  editAction = (id: string, payload: Record<string, string>) => this.call<Action>("PATCH", `/api/actions/${id}`, { payload });
  actions = (state?: string) => this.call<Action[]>("GET", `/api/actions${state ? `?state=${state}` : ""}`);
  revokePermission = (id: string) => this.call<Permission>("POST", `/api/permissions/${id}/revoke`);
  /** A screenshot of an action, as an object URL the caller revokes. */
  actionShot = async (id: string, name: string): Promise<string> => {
    const response = await fetch(`${this.session.baseUrl}/api/actions/${id}/shots/${name}`, { headers: { Authorization: `Bearer ${this.session.token}` } });
    if (!response.ok) throw new CoreError(`No screenshot (${response.status}).`, response.status);
    return URL.createObjectURL(await response.blob());
  };
  agreeWorkflow = (id: string, suggestions?: Record<string, string>, answers?: Record<string, string>) =>
    this.call<Workflow>("POST", `/api/workflows/${id}/agree`, suggestions || answers ? { suggestions, answers } : undefined);
  declineWorkflow = (id: string) => this.call<Workflow>("POST", `/api/workflows/${id}/decline`);
  resumeWorkflow = (id: string) => this.call<Workflow>("POST", `/api/workflows/${id}/resume`);
  stopTurn = (key: string) => this.call<Turn>("POST", `/api/turns/${key}/stop`);
  decideProposal = (id: string, accept: boolean) => this.call<{ decided: string; turn: Turn | null }>("POST", `/api/proposals/${id}/decide`, { accept });
  decideFact = (id: string, accept: boolean) => this.call<Fact>("POST", `/api/facts/${id}/decide`, { accept });
}
