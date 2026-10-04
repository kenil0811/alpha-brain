/**
 * The interview engine's thinking, kept apart from its screen (shell/Interview): what a tool is,
 * the words Alpha is given to prepare and to close an interview, and how the questions that fit
 * the person's time are picked and put in an order that flows.
 *
 * Picking: questions are taken by return on time (value per minute, a new topic costing a
 * little extra), so a short interview spends its minutes where the answers matter most. Order:
 * topics by their most valuable question, questions by value inside a topic, the topic being
 * talked about now staying first, so it never hops between subjects.
 */

/** A tool: a spoken interview with a purpose. The Interviewer is built in; others are person skills of kind "tool". */
export interface Tool {
  id: string;
  title: string;
  description: string;
  /** What it is for: what to find out and what should come of it. */
  instructions: string;
}

export const INTERVIEWER: Tool = {
  id: "interviewer",
  title: "Interview me",
  description: "Zazoo reads what it holds, finds what's missing, and asks what would help most, in the time you have.",
  instructions:
    "Understand the person's present: what they are working on, why it matters, what is in the way, who is involved and what is next. " +
    "Look for what is missing, stale or contradictory across their projects, goals, facts and notes, and for what you wished you had known " +
    "the last times you helped them. Ask what would make you most useful from here.",
};

export interface Question {
  id: string;
  topic: string;
  question: string;
  /** Why Alpha wants to know: shown under the question, never spoken. */
  why: string;
  /** 1–10: how much the answer changes what Alpha can do for the person. */
  value: number;
  /** Alpha's estimate of the spoken answer, in minutes. */
  minutes: number;
}

export interface Prepared {
  context: string;
  gaps: string[];
  questions: Question[];
}

export interface Draft {
  kind: "fact" | "note";
  /** "person" or a project's id. */
  about: string;
  /** A fact's short name (snake_case) or a note's title. */
  label: string;
  text: string;
  /** The question it came from. */
  from?: string;
}

export interface Answered {
  question: Question;
  answer: string;
  skipped: boolean;
}

/** What a new topic costs on top of its first question's minutes: the turn of saying "next, ...". */
const TOPIC_MINUTES = 0.25; // ponytail: one flat cost; measure real transitions if the plans run long

export interface Plan {
  /** The questions that fit, in the order they will be asked. */
  order: Question[];
  minutes: number;
  /** Share of the questions left that fit, 0–1. */
  questionShare: number;
  /** Share of the value left that fits, 0–1. */
  valueShare: number;
}

/** The minutes that cover every question left. */
export function fullMinutes(questions: Question[]): number {
  return questions.reduce((sum, q) => sum + q.minutes, 0) + new Set(questions.map((q) => q.topic)).size * TOPIC_MINUTES;
}

/** The questions to ask in `budget` minutes, in the order to ask them; `current` is the topic being talked about. */
export function plan(questions: Question[], budget: number, current?: string): Plan {
  const picked: Question[] = [];
  const topics = new Set<string>(current ? [current] : []);
  let used = 0;
  for (;;) {
    let best: Question | null = null;
    let bestCost = 0;
    let bestScore = -1;
    for (const q of questions) {
      if (picked.includes(q)) continue;
      const cost = q.minutes + (topics.has(q.topic) ? 0 : TOPIC_MINUTES);
      if (used + cost > budget + 1e-9) continue;
      const score = q.value / cost;
      if (score > bestScore) [best, bestCost, bestScore] = [q, cost, score];
    }
    if (!best) break;
    picked.push(best);
    topics.add(best.topic);
    used += bestCost;
  }
  const top = new Map<string, number>();
  for (const q of picked) top.set(q.topic, Math.max(top.get(q.topic) ?? 0, q.value));
  const rank = (t: string) => (t === current ? Infinity : (top.get(t) ?? 0));
  const order = [...picked].sort((a, b) => (a.topic === b.topic ? b.value - a.value : rank(b.topic) - rank(a.topic) || a.topic.localeCompare(b.topic)));
  const total = questions.reduce((s, q) => s + q.value, 0);
  return {
    order,
    minutes: used,
    questionShare: questions.length ? picked.length / questions.length : 1,
    valueShare: total ? picked.reduce((s, q) => s + q.value, 0) / total : 1,
  };
}

/** The first JSON object in a reply that has `key` (the outermost one when they nest), or null. */
function lastJson(reply: string, key: string): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  for (let start = reply.indexOf("{"); start !== -1; start = reply.indexOf("{", start + 1)) {
    for (let end = reply.lastIndexOf("}"); end > start; end = reply.lastIndexOf("}", end - 1)) {
      try {
        const obj = JSON.parse(reply.slice(start, end + 1)) as unknown;
        if (obj && typeof obj === "object" && key in obj) found = obj as Record<string, unknown>;
        break;
      } catch {
        /* a shorter span may parse */
      }
    }
    if (found) return found;
  }
  return null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function parsePrepared(reply: string): Prepared | null {
  const obj = lastJson(reply, "questions");
  if (!obj || !Array.isArray(obj.questions)) return null;
  const questions = (obj.questions as Record<string, unknown>[])
    .map((q, i) => ({
      id: text(q.id) || `q${i + 1}`,
      topic: text(q.topic) || "General",
      question: text(q.question),
      why: text(q.why),
      value: clamp(q.value, 1, 10, 5),
      minutes: clamp(q.minutes, 0.25, 10, 1.5),
    }))
    .filter((q) => q.question);
  if (!questions.length) return null;
  return { context: text(obj.context), gaps: Array.isArray(obj.gaps) ? obj.gaps.map(text).filter(Boolean) : [], questions };
}

export function parseDrafts(reply: string): { summary: string; items: Draft[] } {
  const obj = lastJson(reply, "items");
  const items = Array.isArray(obj?.items)
    ? (obj.items as Record<string, unknown>[])
        .map((d) => ({ kind: d.kind === "fact" ? ("fact" as const) : ("note" as const), about: text(d.about) || "person", label: text(d.label), text: text(d.text), from: text(d.from) || undefined }))
        .filter((d) => d.label && d.text)
    : [];
  return { summary: text(obj?.summary) || (obj ? "" : reply.trim()), items };
}

export function preparePrompt(tool: Tool, project?: { id: string; name: string } | null): string {
  return (
    `You are preparing a spoken interview with the person: "${tool.title}". ${tool.description}\n\n` +
    `WHAT IT IS FOR\n${tool.instructions}\n\n` +
    (project ? `Keep to the project ${project.name} (module:${project.id}).\n\n` : "") +
    "First read what you hold: the person, their projects and goals, facts and notes, the recent journal and the questions still open. " +
    "Work out the present context, what is missing, stale or contradictory, and what you wished you had known when you last helped. " +
    "This is reading only: save nothing and propose nothing.\n\n" +
    "Then write the questions that would close those gaps, as many as there are real gaps and never padding. Each is one spoken sentence " +
    "the person answers by talking (never yes or no, never two questions in one). value is 1 to 10: how much the answer would change what you " +
    "can do for them. minutes is your honest estimate of the spoken answer. topic is a short label, the same words for every question on one subject.\n" +
    "End your reply with one JSON object and nothing after it: " +
    '{"context": "<two or three sentences>", "gaps": ["<one line each>"], "questions": [{"id": "q1", "topic": "...", "question": "...", "why": "...", "value": 8, "minutes": 1.5}]}'
  );
}

export function closePrompt(tool: Tool, answered: Answered[]): string {
  const said = answered
    .filter((a) => !a.skipped && a.answer.trim())
    .map((a) => `[${a.question.id}] Q: ${a.question.question}\nA: ${a.answer.trim()}`)
    .join("\n\n");
  return (
    `The interview "${tool.title}" has ended. What was asked and what the person said (speech to text, so words may be misheard):\n\n${said}\n\n` +
    "Turn the answers into what is worth keeping: a fact for one short, lasting thing about the person (label in snake_case, like current_role), " +
    "a note for anything longer or about a project (label is its title; about is the project's id, or person). Only what they said, nothing guessed past it. " +
    "Save nothing yourself: the person approves each item first.\n" +
    'End your reply with one JSON object and nothing after it: {"summary": "<one sentence>", "items": [{"kind": "fact", "about": "person", "label": "...", "text": "...", "from": "q1"}]}'
  );
}

export function draftToolPrompt(description: string): string {
  return (
    "The person wants a new voice tool: a spoken interview Alpha runs with them, in the time they give it. Each tool reads what Alpha holds, " +
    "finds what is missing for its purpose, asks the most valuable questions first, and ends with facts and notes the person approves.\n\n" +
    `WHAT THEY DESCRIBED\n${description}\n\n` +
    "Draft it. Save nothing. End your reply with one JSON object and nothing after it: " +
    '{"title": "<a short name>", "description": "<one sentence the person reads>", "instructions": "<what it is for: what to find out, what to look for in what you hold, what should come of it>"}'
  );
}

export function parseToolDraft(reply: string): Omit<Tool, "id"> | null {
  const obj = lastJson(reply, "instructions");
  if (!obj || !text(obj.title) || !text(obj.instructions)) return null;
  return { title: text(obj.title), description: text(obj.description), instructions: text(obj.instructions) };
}

/** Words that end an answer early instead of being one. */
export function command(answer: string): "skip" | "stop" | null {
  const a = answer.trim().toLowerCase().replace(/[.!?,]/g, "");
  if (/^(skip|next|pass|next question)( (it|this|that|one))?$/.test(a)) return "skip";
  if (/^(stop|end|finish|that's all|thats all|i'm done|im done|end the interview|stop the interview)$/.test(a)) return "stop";
  return null;
}
