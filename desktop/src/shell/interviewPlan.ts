/**
 * The interview engine's thinking, kept apart from its screen (shell/Interview): what a tool is,
 * the words Alpha is given to prepare and to close an interview, and how the questions that fit
 * the person's time are picked and put in an order that flows.
 *
 * Shape: topics, each with a goal (what Zazoo is trying to find out), open with a gate question;
 * follow-ups hang under the question they depend on. A "no" drops a question's follow-ups, and
 * "let's move on" drops the rest of its topic (afterAnswer), so nothing is asked that an earlier
 * answer made meaningless.
 *
 * Picking: questions are taken by return on time (value per second, answers assumed short, a new
 * topic costing a little extra). Order: the topic being talked about stays first, then the
 * opening topic ("About you"), then the others in an order drawn once per interview.
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

export interface Topic {
  name: string;
  /** What Zazoo is trying to find out on this subject. */
  goal: string;
  /** The topic that opens the interview ("About you" when Zazoo holds little about the person). */
  opening: boolean;
}

export interface Question {
  id: string;
  topic: string;
  question: string;
  /** Why Zazoo wants to know: never spoken. */
  why: string;
  /** 1–10: how much the answer changes what Zazoo can do for the person. */
  value: number;
  /** Zazoo's estimate of the spoken answer, in seconds (answers are assumed short). */
  seconds: number;
  /** The question this one follows up: asked only after it, and dropped when its answer is "no". */
  parent?: string;
  /** What the parent's answer has to be for this one to make sense, e.g. "they are working on something". */
  when?: string;
}

export interface Prepared {
  context: string;
  gaps: string[];
  topics: Topic[];
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

/** Zazoo's speaking pace, the quiet that ends an answer, and the turn of saying "next, ..." between topics. */
const WORDS_PER_SECOND = 2.5;
const QUIET_SECONDS = 2;
const TOPIC_SECONDS = 5; // ponytail: one flat cost; measure real transitions if the plans run long

/** A question's whole turn, in seconds: Zazoo saying it, the answer, and the quiet that ends it. */
export function askSeconds(q: Question): number {
  return q.question.split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND + q.seconds + QUIET_SECONDS;
}

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
  return (questions.reduce((sum, q) => sum + askSeconds(q), 0) + new Set(questions.map((q) => q.topic)).size * TOPIC_SECONDS) / 60;
}

/** A topic's place for one interview's seed: the same every time it is asked, so re-planning never reshuffles. */
function shuffleRank(seed: number, topic: string): number {
  let h = 2166136261 ^ seed;
  for (const c of topic) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export interface Order {
  /** The topic being talked about: it stays first. */
  current?: string;
  /** The opening topic: next after the current one. */
  opening?: string;
  /** Fixes the random order of the other topics for one interview. */
  seed?: number;
}

/**
 * The questions to ask in `budget` minutes, in the order to ask them. Picked by value per second
 * (a new topic costing a little extra), a follow-up only once its parent is picked; ordered by
 * topic (current, opening, then the rest at random) and inside a topic each question before its
 * follow-ups, the most valuable first.
 */
export function plan(questions: Question[], budget: number, { current, opening, seed = 0 }: Order = {}): Plan {
  const ids = new Set(questions.map((q) => q.id));
  const picked: Question[] = [];
  const pickedIds = new Set<string>();
  const topics = new Set<string>(current ? [current] : []);
  let used = 0;
  for (;;) {
    let best: Question | null = null;
    let bestCost = 0;
    let bestScore = -1;
    for (const q of questions) {
      if (pickedIds.has(q.id) || (q.parent && ids.has(q.parent) && !pickedIds.has(q.parent))) continue;
      const cost = askSeconds(q) + (topics.has(q.topic) ? 0 : TOPIC_SECONDS);
      if (used + cost > budget * 60 + 1e-9) continue;
      const score = q.value / cost;
      if (score > bestScore) [best, bestCost, bestScore] = [q, cost, score];
    }
    if (!best) break;
    picked.push(best);
    pickedIds.add(best.id);
    topics.add(best.topic);
    used += bestCost;
  }
  const rank = (t: string) => (t === current ? -2 : t === opening ? -1 : shuffleRank(seed, t));
  const order: Question[] = [];
  for (const t of [...new Set(picked.map((q) => q.topic))].sort((a, b) => rank(a) - rank(b))) {
    const inTopic = picked.filter((q) => q.topic === t);
    const visit = (parent?: string) => {
      const next = inTopic.filter((q) => (parent ? q.parent === parent : !q.parent || !pickedIds.has(q.parent)));
      for (const q of next.sort((a, b) => b.value - a.value)) {
        order.push(q);
        visit(q.id);
      }
    };
    visit();
  }
  const total = questions.reduce((s, q) => s + q.value, 0);
  return {
    order,
    minutes: used / 60,
    questionShare: questions.length ? picked.length / questions.length : 1,
    valueShare: total ? picked.reduce((s, q) => s + q.value, 0) / total : 1,
  };
}

// ponytail: word patterns, not understanding. A model judgement per answer would catch more ("we shelved it"),
// but costs a turn of latency in a spoken conversation; swap in if the patterns miss too often.
const NEGATION = /^(no|nope|nah|not really|not at all|nothing|none|never|i don't|i do not|i'm not|i am not|i haven't|i have not)\b/;
const NOTHING = /\b(not working on anything|nothing right now|nothing at the moment|nothing really)\b/;
const MOVE_ON = /\b(move on|moving on|different topic|next topic|another topic|change the subject|(talk about|ask me( about)?|ask about|on to|go to) something else)\b/;

/**
 * What an answer leaves of the questions: the answered one goes; a "no" (or a skip) takes its
 * follow-ups with it; asking to move on takes the rest of its topic. `left` keeps every parent
 * before its follow-ups (parsePrepared makes it so).
 */
export function afterAnswer(left: Question[], q: Question, answer: string): { left: Question[]; moveOn: boolean } {
  const a = answer.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const moveOn = MOVE_ON.test(a);
  const negated = !a || NOTHING.test(a) || (NEGATION.test(a) && a.split(" ").length <= 12);
  const gone = new Set([q.id]);
  for (const x of left) if ((moveOn && x.topic === q.topic) || (negated && x.parent && gone.has(x.parent))) gone.add(x.id);
  return { left: left.filter((x) => !gone.has(x.id)), moveOn };
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
  const questions: Question[] = [];
  (obj.questions as Record<string, unknown>[]).forEach((q, i) => {
    const question = text(q.question);
    if (!question) return;
    const topic = text(q.topic) || "General";
    // A parent must come earlier, on the same topic; anything else is a question of its own.
    const parent = questions.find((p) => p.id === text(q.parent) && p.topic === topic)?.id;
    questions.push({
      id: text(q.id) || `q${i + 1}`,
      topic,
      question,
      why: text(q.why),
      value: clamp(q.value, 1, 10, 5),
      seconds: clamp(q.seconds, 5, 60, 12),
      ...(parent ? { parent, when: text(q.when) || undefined } : {}),
    });
  });
  if (!questions.length) return null;
  const given = Array.isArray(obj.topics) ? (obj.topics as Record<string, unknown>[]).map((t) => ({ name: text(t.name), goal: text(t.goal), opening: t.opening === true })) : [];
  const topics = [...new Set(questions.map((q) => q.topic))].map((name) => given.find((t) => t.name === name) ?? { name, goal: "", opening: false });
  return { context: text(obj.context), gaps: Array.isArray(obj.gaps) ? obj.gaps.map(text).filter(Boolean) : [], topics, questions };
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
    "Then plan topics, each with a goal: what you are trying to find out on that subject. Only real gaps, never padding.\n" +
    '- If you hold little or nothing about the person, the first topic is "About you" with opening true: who they are, what they do, ' +
    "what they care about, how they like to work. Then topics on their work and projects. At most one topic is opening.\n" +
    "- Each topic opens with its gate question, which finds out whether the rest applies (for example whether they are working on " +
    "something). Follow-ups hang under it: parent is the id of the question they depend on, when is a few words on what that answer " +
    "must be for the follow-up to make sense. If the person says no or asks to move on, the follow-ups are dropped, so never write a " +
    "follow-up that assumes an answer without a parent.\n" +
    "- Each question is one short spoken sentence (never two questions in one, never yes-or-no except a gate).\n" +
    "- Answers are spoken and short: assume 10 to 15 seconds each, not long stories. seconds is your estimate of the answer (usually 10 to 15).\n" +
    "- value is 1 to 10: how much the answer would change what you can do for them. topic is the topic's name, word for word.\n" +
    "End your reply with one JSON object and nothing after it: " +
    '{"context": "<two or three sentences>", "gaps": ["<one line each>"], ' +
    '"topics": [{"name": "About you", "goal": "...", "opening": true}, {"name": "...", "goal": "...", "opening": false}], ' +
    '"questions": [{"id": "q1", "topic": "About you", "question": "...", "why": "...", "value": 8, "seconds": 12}, ' +
    '{"id": "q2", "topic": "...", "question": "...", "why": "...", "value": 9, "seconds": 12}, ' +
    '{"id": "q3", "topic": "...", "question": "...", "why": "...", "value": 7, "seconds": 12, "parent": "q2", "when": "they are working on something"}]}'
  );
}

export function closePrompt(tool: Tool, answered: Answered[]): string {
  const said = answered
    .filter((a) => !a.skipped && a.answer.trim())
    .map((a) => `[${a.question.id}] Q: ${a.question.question}\nA: ${a.answer.trim()}`)
    .join("\n\n");
  return (
    `The interview "${tool.title}" has ended. What was asked and what the person said (speech to text, so words may be misheard):\n\n${said}\n\n` +
    "Answers are short and spoken; a plain no or nothing is an answer too, worth keeping only when it says something lasting " +
    "(not working on anything right now). Turn the answers into what is worth keeping: a fact for one short, lasting thing about the person (label in snake_case, like current_role), " +
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
