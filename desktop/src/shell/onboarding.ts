/**
 * First steps: Bridge's onboarding question set (Bridge's onboarding/questions.ts, decisions
 * E1-E4), kept apart from its pop-up (shell/OnboardingDialog) so the branching is testable.
 *
 * Adaptive: later questions depend on earlier answers. The profession picks a template, and the
 * workday picks, the one contextual question and the "where does your work live" list come from
 * it. The order is Bridge's: the companion's name, profession and hobbies, up to three workday
 * picks, the contextual question, where the work lives, where to begin. The six are shown on
 * three screens (E4); a screen's questions are only built once the screens before it are
 * answered, so a template never sees an unanswered profession.
 *
 * What Bridge did with the answers (an organization blueprint) doesn't exist on this core: here
 * they become one note about the person, and each "where to begin" pick becomes a request
 * drafted into Zazoo, which sets up the project.
 */
import { SPECIES, type ZazooSpecies } from "../avatar/zazoo/species";

export type QuestionKind = "single" | "multi" | "text";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** Why it's asked and what it changes (Bridge's why and consequence), behind (i). */
  why: string;
  options?: QuestionOption[];
  placeholder?: string;
  /** Multi only: how many may be picked. */
  max?: number;
}

export type Answers = Record<string, string | string[] | undefined>;

export type ProfessionKind = "sales" | "recruiting" | "support" | "investing" | "teaching" | "building" | "operating";

/** A bounded keyword match on the typed profession, with a generic fallback (Bridge's). */
export function professionKind(profession: string | undefined): ProfessionKind {
  const text = (profession ?? "").toLowerCase();
  if (/(sales|account exec|business development|revenue|quota|seller)/.test(text)) return "sales";
  if (/(recruit|talent|hiring|people ops|\bhr\b|candidate|job search|job hunt)/.test(text)) return "recruiting";
  if (/(support|helpdesk|help desk|customer success|service desk|success manager)/.test(text)) return "support";
  if (/(investor|investing|venture|\bvc\b|private equity|search fund|acquisition|analyst)/.test(text)) return "investing";
  if (/(teach|professor|lecturer|educat|tutor|school|faculty)/.test(text)) return "teaching";
  if (/(engineer|developer|programmer|designer|scientist|architect|researcher)/.test(text)) return "building";
  return "operating";
}

interface Template {
  /** What this profession keeps track of, for the project Zazoo is asked to set up. */
  things: string;
  workday: QuestionOption[];
  context: { prompt: string; options: QuestionOption[] };
  workLives: QuestionOption[];
}

const o = (value: string, label: string): QuestionOption => ({ value, label });

/** The contextual answer becomes a starting column (Bridge's CONTEXT_FIELD). */
export const CONTEXT_COLUMN: Record<string, string> = { next_step_date: "next step date", owner: "owner", amount: "value", priority: "priority" };

const GENERIC_WORK_LIVES = [o("email", "Email"), o("calendar", "Calendar"), o("chat", "Chat / messaging"), o("docs", "Documents"), o("notebook", "A paper notebook"), o("in_person", "In-person conversations")];

const TEMPLATES: Record<ProfessionKind, Template> = {
  sales: {
    things: "deals",
    workday: [o("pipeline", "Moving deals forward"), o("people", "Talking to buyers"), o("research", "Researching accounts"), o("planning", "Forecasting and planning"), o("admin", "Updating the CRM")],
    context: { prompt: "On a live deal, what do you need in front of you first?", options: [o("next_step_date", "The next step and when it's due"), o("amount", "The value on the table"), o("owner", "Who owns it")] },
    workLives: [o("email", "Email"), o("crm", "A CRM"), o("calendar", "Calendar"), o("chat", "Chat / messaging"), o("phone", "Calls"), o("in_person", "In-person meetings")],
  },
  recruiting: {
    things: "candidates",
    workday: [o("people", "Talking to candidates"), o("pipeline", "Moving people through stages"), o("research", "Sourcing and research"), o("planning", "Coordinating interviews"), o("admin", "Writing up notes")],
    context: { prompt: "When you open someone's record, what do you need to see first?", options: [o("next_step_date", "The next conversation and when"), o("owner", "Who's running the process"), o("priority", "How strong a fit they are")] },
    workLives: [o("email", "Email"), o("calendar", "Calendar"), o("crm", "An ATS or CRM"), o("chat", "Chat / messaging"), o("docs", "Documents"), o("in_person", "In-person interviews")],
  },
  support: {
    things: "cases",
    workday: [o("requests", "Answering incoming requests"), o("people", "Following up with customers"), o("research", "Digging into causes"), o("planning", "Triaging the queue"), o("admin", "Documenting fixes")],
    context: { prompt: "On an open case, what matters most at a glance?", options: [o("priority", "How urgent it is"), o("next_step_date", "When it's due back"), o("owner", "Who's handling it")] },
    workLives: [o("email", "Email"), o("chat", "Chat / messaging"), o("docs", "A help centre or docs"), o("crm", "A ticketing tool"), o("phone", "Calls"), o("in_person", "In-person conversations")],
  },
  investing: {
    things: "opportunities",
    workday: [o("research", "Researching companies and markets"), o("people", "Talking to founders and operators"), o("pipeline", "Working live opportunities"), o("planning", "Diligence and decisions"), o("admin", "Writing memos")],
    context: { prompt: "On an opportunity you're tracking, what do you check first?", options: [o("next_step_date", "The next step and when it's due"), o("amount", "The size of the opportunity"), o("priority", "How much conviction you have")] },
    workLives: [o("email", "Email"), o("calendar", "Calendar"), o("docs", "Documents and memos"), o("crm", "A pipeline tool"), o("notebook", "A paper notebook"), o("in_person", "In-person meetings")],
  },
  teaching: {
    things: "students",
    workday: [o("people", "Time with students"), o("planning", "Preparing sessions"), o("making", "Building materials"), o("requests", "Answering questions"), o("admin", "Marking and admin")],
    context: { prompt: "When you look someone up, what do you need to remember?", options: [o("next_step_date", "When you next see them"), o("priority", "How much support they need"), o("owner", "Which group they're in")] },
    workLives: [o("email", "Email"), o("calendar", "Calendar"), o("docs", "Documents and slides"), o("chat", "Chat / messaging"), o("notebook", "A paper notebook"), o("in_person", "In the room")],
  },
  building: {
    things: "work",
    workday: [o("making", "Building things"), o("research", "Investigating problems"), o("people", "Working with other people"), o("planning", "Planning what's next"), o("requests", "Responding to requests")],
    context: { prompt: "When something needs picking back up, what tells you where you were?", options: [o("next_step_date", "The date it's due"), o("priority", "How important it is"), o("owner", "Who else is involved")] },
    workLives: [o("docs", "Documents and code"), o("chat", "Chat / messaging"), o("email", "Email"), o("calendar", "Calendar"), o("notebook", "A paper notebook"), o("in_person", "In-person conversations")],
  },
  operating: {
    things: "work",
    workday: [o("people", "Time with people"), o("planning", "Planning and prioritising"), o("requests", "Handling incoming requests"), o("research", "Finding things out"), o("making", "Producing work")],
    context: { prompt: "When you come back to something, what do you need to see first?", options: [o("next_step_date", "When the next step is due"), o("priority", "How important it is"), o("owner", "Who else is involved")] },
    workLives: GENERIC_WORK_LIVES,
  },
};

const templateFor = (answers: Answers) => TEMPLATES[professionKind(answers.profession as string | undefined)];

/** Longest kind first, so "red panda" wins over "panda". */
const BY_KIND = [...SPECIES].sort((a, b) => b.kind.length - a.kind.length);

/** The animal named as a whole word in what was typed ("Rex the Fox"), or undefined: only the
 *  animals the companion can be drawn as, never a guess (Bridge's resolveAvatarStyleFromText). */
export function speciesFromText(text: string): ZazooSpecies | undefined {
  const lower = text.toLowerCase();
  return BY_KIND.find((s) => new RegExp(`\\b${s.kind}\\b`).test(lower));
}

const Q_NAME: Question = {
  id: "companion_name",
  kind: "text",
  prompt: "What would you like to call your companion?",
  why: "Type any name. Name an animal it can be (a fox, an owl, a red panda) and it takes that look; otherwise it keeps its own. You can change both later in Settings.",
  placeholder: 'e.g. Luna, or "Rex the Fox"',
};

const Q_PROFESSION: Question = {
  id: "profession",
  kind: "text",
  prompt: "What do you do, and what do you do for fun?",
  why: "Your role keeps Zazoo's suggestions relevant, and what you enjoy keeps them human. It shapes the next questions.",
  placeholder: "e.g. Sales lead at a startup; I run and cook",
};

const Q_BEGIN: Question = {
  id: "begin",
  kind: "multi",
  prompt: "Where would you like me to begin?",
  why: "Starting where you want help beats starting where a template says. Each pick becomes a request you can send to Zazoo; nothing starts until you do.",
  options: [o("track_stage", "Keep track of where things stand"), o("surface_signals", "Surface what needs a response"), o("calendar", "Keep an eye on what's coming up")],
};

function question(id: string, answers: Answers): Question {
  const t = templateFor(answers);
  switch (id) {
    case "companion_name":
      return Q_NAME;
    case "profession":
      return Q_PROFESSION;
    case "workday":
      return { id, kind: "multi", prompt: "What fills most of your workday? Pick up to three.", why: "The shape of your day is a better guide than a job title alone.", options: t.workday, max: 3 };
    case "work_context":
      return { id, kind: "single", prompt: t.context.prompt, why: "One well-chosen column is worth more than a form of fields you never fill in. It becomes a column in the project Zazoo sets up for you.", options: t.context.options };
    case "work_lives":
      return { id, kind: "multi", prompt: "Where does most of your work live?", why: "Tells Zazoo what would be worth connecting later. It connects nothing by itself.", options: t.workLives };
    case "begin":
      return Q_BEGIN;
    default:
      throw new Error(`No first-steps question ${id}`);
  }
}

/** Bridge's three screens (E4). */
export const GROUPS: { title: string; ids: string[] }[] = [
  { title: "Companion", ids: ["companion_name", "profession"] },
  { title: "Your work", ids: ["workday", "work_context"] },
  { title: "Getting started", ids: ["work_lives", "begin"] },
];

/** The first screen with an unanswered question, built from the answers so far; null when done. */
export function nextGroup(answers: Answers): { index: number; title: string; questions: Question[] } | null {
  const index = GROUPS.findIndex((g) => g.ids.some((id) => answers[id] === undefined));
  if (index < 0) return null;
  return { index, title: GROUPS[index].title, questions: GROUPS[index].ids.map((id) => question(id, answers)) };
}

/** Back: the screen before `index` becomes unanswered again (its answers go back to drafts). */
export function back(answers: Answers, index: number): { answers: Answers; drafts: Answers } {
  const ids = GROUPS[Math.max(0, index - 1)].ids;
  const rest = { ...answers };
  const drafts: Answers = {};
  for (const id of ids) {
    drafts[id] = rest[id];
    delete rest[id];
  }
  return { answers: rest, drafts };
}

/** A screen's answers from its drafts: text trimmed, picks kept only if still offered (a
 *  changed profession changes the options). Empty means "skipped", which still counts. */
export function commit(questions: Question[], drafts: Answers): Answers {
  const out: Answers = {};
  for (const q of questions) {
    const raw = drafts[q.id];
    const offered = new Set(q.options?.map((x) => x.value));
    if (q.kind === "text") out[q.id] = typeof raw === "string" ? raw.trim() : "";
    else if (q.kind === "multi") out[q.id] = (Array.isArray(raw) ? raw : []).filter((v) => offered.has(v)).slice(0, q.max);
    else out[q.id] = typeof raw === "string" && offered.has(raw) ? raw : "";
  }
  return out;
}

/** The questions that must be answered before a screen continues: the typed ones (Bridge's). */
export function ready(questions: Question[], drafts: Answers): boolean {
  return questions.every((q) => q.kind !== "text" || (typeof drafts[q.id] === "string" && (drafts[q.id] as string).trim() !== ""));
}

export const TOTAL = 6;

/** Answers given, for the progress bar (an empty pick doesn't count). */
export function answered(answers: Answers): number {
  return Object.values(answers).filter((v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)).length;
}

function labels(q: Question, value: string | string[] | undefined): string {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((v) => q.options?.find((x) => x.value === v)?.label ?? v).join(", ");
}

export const NOTE_TITLE = "About you (first steps)";

/** The note Zazoo (and the interviewer) reads: each answer in words, unanswered ones left out. */
export function noteBody(answers: Answers): string {
  const lines: [string, string][] = [
    ["Companion's name", (answers.companion_name as string) ?? ""],
    ["Work and life", (answers.profession as string) ?? ""],
    ["What fills the workday", labels(question("workday", answers), answers.workday)],
    [question("work_context", answers).prompt, labels(question("work_context", answers), answers.work_context)],
    ["Where the work lives", labels(question("work_lives", answers), answers.work_lives)],
    ["Where to begin", labels(Q_BEGIN, answers.begin)],
  ];
  return lines
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}${k.endsWith("?") ? "" : ":"} ${v}`)
    .join("\n");
}

/** Each "where to begin" pick as a request to Zazoo: on this core a project is made by asking. */
export function beginRequests(answers: Answers): { id: string; label: string; text: string }[] {
  const t = templateFor(answers);
  const column = CONTEXT_COLUMN[answers.work_context as string];
  const lives = (answers.work_lives as string[] | undefined) ?? [];
  const where = lives.includes("email") ? " in my email" : lives.includes("chat") ? " in my messages" : "";
  const text: Record<string, string> = {
    track_stage: `Set up a project for my ${t.things}, with where each one stands${column ? ` and its ${column}` : ""}`,
    surface_signals: `Tell me each morning what needs a response from me${where}`,
    calendar: "Connect my calendar and keep an eye on what's coming up",
  };
  const picked = (answers.begin as string[] | undefined) ?? [];
  return picked.filter((id) => text[id]).map((id) => ({ id, label: labels(Q_BEGIN, id), text: text[id] }));
}
