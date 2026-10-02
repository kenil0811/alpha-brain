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
}

export interface TableSummary {
  name: string;
  title: string;
  module: string | null;
  records: number;
}

export interface Provenance {
  by?: string;
  turn?: string | null;
  /** true: the row's numbers are estimates; a list names the estimated fields. */
  estimated?: boolean | string[];
}

export interface RecordRow {
  id: string;
  revision: number;
  values: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  provenance: Provenance;
}

export interface SavedView {
  id: string;
  collection: string;
  title: string;
  config: Record<string, unknown>;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LastEdit {
  text: string;
  at: string;
  actor: string;
}

export interface TableData {
  table: TableDesc;
  records: RecordRow[];
  views: SavedView[];
  last_edit: LastEdit | null;
}

/** One journal entry that touched a record: who, when, and what the person said in that turn. */
export interface HistoryEntry {
  id: string;
  at: string;
  kind: string;
  actor: string;
  text: string;
  turn: string | null;
  said: string | null;
}

export interface FieldChange {
  kind?: string;
  label?: string;
  choices?: string[];
  relation?: string;
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
}

export interface ModuleCard {
  id: string;
  name: string;
  goal: string | null;
  /** A lucide icon name the person picked (shell/projectIcons.ts); null until they pick one. */
  icon?: string | null;
  tables: TableSummary[];
  records: number;
  last_at: string | null;
  last_text: string | null;
  threads: Thread[];
  created_at: string;
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
  updated_at: string;
}

export interface ModuleDetail extends Omit<ModuleCard, "tables"> {
  tables: TableDesc[];
  activity: JournalEntry[];
  note: Note | null;
  goals: Goal[];
  automations: Automation[];
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

export interface NeedItem {
  kind: "ask" | "proposal" | "fact";
  id: string;
  text: string;
  why?: string | null;
  at: string;
  options?: string[];
  module?: string | null;
}

/** Something Alpha wants to do outside its own space, waiting for the person's yes (core
 *  world/actions.py). `result` is set once it has been decided and, if approved, run. */
export interface PendingAction {
  id: string;
  kind: string;
  connector: string;
  summary: string;
  payload: Record<string, unknown>;
  module: string | null;
  asked: string | null;
  state: "pending" | "approved" | "rejected" | "expired" | "unavailable";
  created_at: string;
  expires_at: string | null;
  result: { error?: string } | null;
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
}

export interface EntityDetail extends Entity {
  facts: Fact[];
  timeline: JournalEntry[];
  maybe_same: Entity[];
}

/** Whether Alpha can think: Claude Code on this Mac, signed in to the person's Claude. */
/** Settings -> Models: one way of reaching a model (a sign-in, a key, or Ollama on this Mac). */
export interface ModelProvider {
  id: string;
  label: string;
  kind: "sign_in" | "key" | "local";
  state: "connected" | "needs_sign_in" | "cli_missing" | "needs_key" | "not_running";
  dot: { color: "green" | "grey" | "red"; tooltip: string };
  /** One line: why the last call or check failed. */
  error: string | null;
  key_last4: string | null;
  installing: boolean;
  who: string | null;
  default: boolean;
  needs_code?: boolean;
}

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ModelRoute {
  provider: string;
  model: string | null;
  chosen: boolean;
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

export interface Skill {
  name: string;
  title: string;
  description: string | null;
  tools: { name: string; effect: string; description?: string }[];
  origin: string | null;
}

export interface Intelligence {
  skills: Skill[];
  automations: Automation[];
  readers: Reader[];
  connections: Connection[];
  knowledge: { facts: Fact[]; notes: Note[]; goals: Goal[] };
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

export interface Turn {
  id: string;
  state: "running" | "done" | "failed" | "needs_connect";
  text: string;
  /** The model it went (or would go) to. */
  provider?: string | null;
  steps?: { at: string; kind: string; text: string }[];
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

type Raw = Record<string, unknown> & { id: string; revision: number; created_at: string; updated_at: string; _provenance?: Provenance };

export function toRow(raw: Raw): RecordRow {
  const { id, revision, created_at, updated_at, _provenance, ...values } = raw;
  return { id, revision, created_at, updated_at, values, provenance: _provenance ?? {} };
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
      throw new CoreError(`Alpha's core isn't answering (${e instanceof Error ? e.message : String(e)}).`, 0);
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
    if (!response.ok) throw new CoreError(data.error ?? data.detail ?? `The core answered ${response.status}.`, response.status);
    return data as T;
  }

  health = () => this.call<{ ok: boolean; world: string }>("GET", "/api/health");
  modelProviders = async () => (await this.call<{ providers: ModelProvider[] }>("GET", "/api/models")).providers;
  providerModels = (id: string) => this.call<{ models: ProviderModel[]; selected: string | null }>("GET", `/api/models/${id}/models`);
  setProviderModel = (id: string, model: string) => this.call<{ models: ProviderModel[]; selected: string | null }>("PUT", `/api/models/${id}/model`, { model });
  starProvider = async (id: string) => (await this.call<{ providers: ModelProvider[] }>("POST", `/api/models/${id}/star`)).providers;
  saveProviderKey = async (id: string, key: string) => (await this.call<{ provider: ModelProvider }>("PUT", `/api/models/${id}/key`, { key })).provider;
  removeProviderKey = async (id: string) => (await this.call<{ provider: ModelProvider }>("DELETE", `/api/models/${id}/key`)).provider;
  testProvider = async (id: string) => (await this.call<{ provider: ModelProvider }>("POST", `/api/models/${id}/test`)).provider;
  reconnectProvider = async (id: string) => (await this.call<{ provider: ModelProvider }>("POST", `/api/models/${id}/reconnect`)).provider;
  signInProvider = async (id: string) => (await this.call<{ provider: ModelProvider }>("POST", `/api/models/${id}/sign-in`)).provider;
  finishProviderSignIn = async (id: string, code: string) => (await this.call<{ provider: ModelProvider }>("POST", `/api/models/${id}/sign-in/finish`, { code })).provider;
  installProvider = async (id: string) => (await this.call<{ provider: ModelProvider }>("POST", `/api/models/${id}/install`)).provider;
  route = (thread?: string | null) => this.call<ModelRoute>("GET", `/api/route${thread ? `?thread=${encodeURIComponent(thread)}` : ""}`);
  setRoute = (thread: string | null, provider: string | null, model: string | null = null) => this.call<ModelRoute>("PUT", "/api/route", { thread, provider, model });
  dataInfo = () => this.call<DataInfo>("GET", "/api/data");
  backUp = () => this.call<DataInfo>("POST", "/api/data/backup");
  home = () => this.call<Home>("GET", "/api/home");
  modules = () => this.call<ModuleCard[]>("GET", "/api/modules");
  module = (ref: string) => this.call<ModuleDetail>("GET", `/api/modules/${encodeURIComponent(ref)}`);
  updateModule = (ref: string, patch: { name?: string; icon?: string }) => this.call<ModuleCard>("PATCH", `/api/modules/${encodeURIComponent(ref)}`, patch);
  removeModule = (ref: string) => this.call<{ module: string; tables: number; rows: number }>("DELETE", `/api/modules/${encodeURIComponent(ref)}`);
  /** A project as a file: its tables and rows, note, goals and automations. */
  exportModule = (ref: string) => this.call<Record<string, unknown>>("GET", `/api/modules/${encodeURIComponent(ref)}/export`);
  importModule = (bundle: unknown) => this.call<ModuleCard>("POST", "/api/modules/import", bundle);
  moduleSummary = (ref: string) => this.call<ModuleSummary>("GET", `/api/modules/${encodeURIComponent(ref)}/summary`);

  async table(name: string): Promise<TableData> {
    const data = await this.call<Omit<TableData, "records"> & { records: Raw[] }>("GET", `/api/tables/${encodeURIComponent(name)}`);
    return { ...data, views: data.views ?? [], last_edit: data.last_edit ?? null, records: data.records.map(toRow) };
  }
  bulkRecords = (table: string, action: "set" | "delete", items: { id: string; revision: number }[], values?: Record<string, unknown>) =>
    this.call<{ done: number; skipped: string[] }>("POST", `/api/tables/${encodeURIComponent(table)}/records/bulk`, { action, items, values });
  undo = (table: string) => this.call<{ undone: string; text: string }>("POST", `/api/tables/${encodeURIComponent(table)}/undo`);
  history = (table: string, id: string) => this.call<HistoryEntry[]>("GET", `/api/tables/${encodeURIComponent(table)}/records/${id}/history`);
  changeField = (table: string, field: string, change: FieldChange) =>
    this.call<{ before: Field; after: Field; rewritten: number; table: TableDesc }>("PATCH", `/api/tables/${encodeURIComponent(table)}/fields/${encodeURIComponent(field)}`, change);
  addFields = (table: string, fields: Field[]) => this.call<TableDesc>("POST", `/api/tables/${encodeURIComponent(table)}/fields`, { fields });
  views = (table: string) => this.call<SavedView[]>("GET", `/api/tables/${encodeURIComponent(table)}/views`);
  saveView = (table: string, title: string, config: object, isDefault = false) =>
    this.call<SavedView>("POST", `/api/tables/${encodeURIComponent(table)}/views`, { title, config, is_default: isDefault });
  updateView = (id: string, patch: { title?: string; config?: object; is_default?: boolean }) => this.call<SavedView>("PATCH", `/api/views/${id}`, patch);
  deleteView = (id: string) => this.call<{ deleted: string }>("DELETE", `/api/views/${id}`);
  addRecord = async (table: string, values: Record<string, unknown>) => toRow(await this.call<Raw>("POST", `/api/tables/${encodeURIComponent(table)}/records`, { values }));
  editRecord = async (table: string, id: string, values: Record<string, unknown>, revision: number) =>
    toRow(await this.call<Raw>("PATCH", `/api/tables/${encodeURIComponent(table)}/records/${id}`, { values, revision }));
  deleteRecord = (table: string, id: string, revision: number) => this.call<{ removed: string }>("DELETE", `/api/tables/${encodeURIComponent(table)}/records/${id}?revision=${revision}`);

  people = (q?: string) => this.call<Entity[]>("GET", `/api/people${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  entity = (id: string) => this.call<EntityDetail>("GET", `/api/entities/${id}`);
  merge = (keep: string, other: string) => this.call<Entity>("POST", `/api/entities/${keep}/merge/${other}`);

  intelligence = () => this.call<Intelligence>("GET", "/api/intelligence");
  writeNote = (scope: string, title: string, body: string) => this.call<Note>("POST", "/api/notes", { scope, title, body });
  connectFolder = (path: string) => this.call<Connection>("POST", "/api/connections/folder", { path });
  connectSite = (site: string) => this.call<Connection>("POST", "/api/connections/site", { site });
  connectCalendar = () => this.call<Connection>("POST", "/api/connections/calendar");
  syncConnection = (id: string) => this.call<Record<string, unknown>>("POST", `/api/connections/${id}/sync`);
  connectionRemoval = (id: string) => this.call<ConnectionRemoval>("GET", `/api/connections/${id}/removal`);
  removeConnection = (id: string) => this.call<ConnectionRemoval>("DELETE", `/api/connections/${id}`);

  activity = (params: { q?: string; module?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
    return this.call<JournalEntry[]>("GET", `/api/activity?${qs}`);
  };
  search = (q: string) => this.call<SearchResult>("GET", `/api/search?q=${encodeURIComponent(q)}`);

  conversation = (module?: string | null) => this.call<Conversation>("GET", `/api/conversation${module ? `?module=${encodeURIComponent(module)}` : ""}`);
  ask = (text: string, opts: { module?: string | null; thread?: string | null } = {}) => this.call<Turn>("POST", "/api/ask", { text, module: opts.module ?? null, thread: opts.thread ?? null });
  turn = (id: string) => this.call<Turn>("GET", `/api/turns/${id}`);
  thread = (id: string) => this.call<Thread & { journal: JournalEntry[] }>("GET", `/api/threads/${id}`);

  /** Ask and wait for the answer, polling once a second. */
  async askAndWait(text: string, opts: { module?: string | null; thread?: string | null } = {}, onTick?: (t: Turn) => void): Promise<Turn> {
    let turn = await this.ask(text, opts);
    while (turn.state === "running") {
      await new Promise((r) => setTimeout(r, 1000));
      turn = await this.turn(turn.id);
      onTick?.(turn);
    }
    return turn;
  }

  switchAutomation = (id: string, enabled: boolean) => this.call<Automation>("PATCH", `/api/automations/${id}`, { enabled });
  runAutomation = (id: string) => this.call<Automation>("POST", `/api/automations/${id}/run`);

  answerAsk = (id: string, text: string) => this.call<{ answered: string; turn: Turn | null }>("POST", `/api/asks/${id}/answer`, { text });
  dismissAsk = (id: string) => this.call<{ dismissed: string }>("POST", `/api/asks/${id}/dismiss`);
  pending = () => this.call<PendingAction[]>("GET", "/api/pending");
  approvePending = (id: string) => this.call<PendingAction>("POST", `/api/pending/${id}/approve`);
  rejectPending = (id: string) => this.call<PendingAction>("POST", `/api/pending/${id}/reject`);
  decideProposal = (id: string, accept: boolean) => this.call<{ decided: string; turn: Turn | null }>("POST", `/api/proposals/${id}/decide`, { accept });
  decideFact = (id: string, accept: boolean) => this.call<Fact>("POST", `/api/facts/${id}/decide`, { accept });
}
