import { describe, expect, it } from "vitest";
import { afterAnswer, askSeconds, command, fullMinutes, parseDrafts, parsePrepared, plan, type Question } from "./interviewPlan";

// Questions of one word ("a1?"): each turn is 0.4 s of speaking + the answer + 2 s of quiet.
const q = (id: string, topic: string, value: number, seconds: number, parent?: string): Question => ({ id, topic, question: `${id}?`, why: "", value, seconds, ...(parent ? { parent } : {}) });
const QS = [q("a1", "Work", 9, 12), q("a2", "Work", 4, 30, "a1"), q("b1", "Health", 8, 12), q("c1", "Money", 2, 40), q("a3", "Work", 7, 12, "a1")];

describe("time", () => {
  it("counts saying the question, the answer and the quiet", () => {
    expect(askSeconds({ ...q("x", "T", 5, 12), question: "What are you working on right now?" })).toBeCloseTo(7 / 2.5 + 12 + 2);
    expect(fullMinutes([q("a", "T", 5, 12), q("b", "U", 5, 12)])).toBeCloseTo((2 * 14.4 + 2 * 5) / 60);
  });
});

describe("plan", () => {
  it("covers everything at full minutes", () => {
    const p = plan(QS, fullMinutes(QS));
    expect(p.order).toHaveLength(5);
    expect(p.questionShare).toBe(1);
    expect(p.valueShare).toBe(1);
  });

  it("never plans a follow-up without its parent, and asks it after", () => {
    const qs = [q("gate", "Work", 2, 12), q("deep", "Work", 10, 12, "gate")];
    expect(plan(qs, (14.4 + 5) / 60).order.map((x) => x.id)).toEqual(["gate"]); // room for one: the gate, not the richer follow-up
    expect(plan(qs, 1).order.map((x) => x.id)).toEqual(["gate", "deep"]);
    // Once the gate is answered, the follow-up stands alone.
    expect(plan([qs[1]], 1).order.map((x) => x.id)).toEqual(["deep"]);
  });

  it("spends a short budget on the highest return and keeps topics together", () => {
    const p = plan(QS, 1);
    expect(new Set(p.order.map((x) => x.id))).toEqual(new Set(["a1", "a3", "b1"]));
    expect(p.order.findIndex((x) => x.id === "a1")).toBe(p.order.findIndex((x) => x.id === "a3") - 1);
    expect(p.minutes).toBeLessThanOrEqual(1);
  });

  it("opens with the opening topic, draws the rest once per seed, and keeps the current topic first", () => {
    const qs = ["You", "A", "B", "C", "D", "E"].map((t, i) => q(`t${i}`, t, 5, 12));
    const topics = (seed: number, current?: string) => [...new Set(plan(qs, 10, { opening: "You", seed, current }).order.map((x) => x.topic))];
    expect(topics(1)[0]).toBe("You");
    expect(topics(1)).toEqual(topics(1)); // re-planning never reshuffles
    expect(new Set(Array.from({ length: 8 }, (_, s) => topics(s).join())).size).toBeGreaterThan(1); // seeds differ
    expect(topics(1, "C")[0]).toBe("C");
  });

  it("fits nothing into no time", () => {
    expect(plan(QS, 0).order).toEqual([]);
  });
});

describe("afterAnswer", () => {
  const WORK = [q("w1", "Work", 9, 12), q("w2", "Work", 8, 12, "w1"), q("w3", "Work", 6, 12, "w2"), q("w4", "Work", 5, 12), q("y1", "You", 7, 12)];
  const ids = (r: { left: Question[] }) => r.left.map((x) => x.id);

  it("moves on to the next topic on Vikas's sentence", () => {
    const r = afterAnswer(WORK, WORK[0], "I'm not working on anything, let's move on to a different topic");
    expect(r).toEqual({ left: [WORK[4]], moveOn: true });
  });

  it("drops a question's whole subtree on a no, and keeps the rest of the topic", () => {
    for (const no of ["No.", "Nope", "not really", "Nothing right now", "I don't", "I’m not", "never", "None"]) expect(ids(afterAnswer(WORK, WORK[0], no))).toEqual(["w4", "y1"]);
    expect(ids(afterAnswer(WORK, WORK[0], ""))).toEqual(["w4", "y1"]); // a skip counts as no
  });

  it("keeps the follow-ups after a real answer", () => {
    expect(ids(afterAnswer(WORK, WORK[0], "A pricing page for the beta"))).toEqual(["w2", "w3", "w4", "y1"]);
    expect(ids(afterAnswer(WORK, WORK[0], "Nothing beats the launch next week, it's all hands for the pricing page and the beta and the onboarding"))).toContain("w2");
  });

  it("hears a change of subject", () => {
    for (const a of ["Let's move on", "next topic please", "Can we talk about something else?"]) expect(afterAnswer(WORK, WORK[1], a).moveOn).toBe(true);
    expect(afterAnswer(WORK, WORK[1], "I'm working on something else now").moveOn).toBe(false);
  });
});

describe("replies", () => {
  it("reads topics and the question tree after the prose, and clamps what's out of range", () => {
    const p = parsePrepared(
      'I read {a few} things.\n{"context": "c", "gaps": ["g"], "topics": [{"name": "About you", "goal": "Who they are", "opening": true}], "questions": [' +
        '{"id": "w1", "topic": "Work", "question": "What are you working on?", "value": 40, "seconds": "200"}, ' +
        '{"id": "w2", "topic": "Work", "question": "What is in the way?", "parent": "w1", "when": "they are working on something"}, ' +
        '{"id": "w3", "topic": "Work", "question": "Who helps?", "parent": "nope"}, ' +
        '{"id": "y1", "topic": "About you", "question": "What do you do?", "parent": "w1"}, {"question": ""}]}',
    );
    expect(p?.questions).toEqual([
      { id: "w1", topic: "Work", question: "What are you working on?", why: "", value: 10, seconds: 60 },
      { id: "w2", topic: "Work", question: "What is in the way?", why: "", value: 5, seconds: 12, parent: "w1", when: "they are working on something" },
      { id: "w3", topic: "Work", question: "Who helps?", why: "", value: 5, seconds: 12 }, // unknown parent: top-level
      { id: "y1", topic: "About you", question: "What do you do?", why: "", value: 5, seconds: 12 }, // parent on another topic: top-level
    ]);
    expect(p?.topics).toEqual([
      { name: "Work", goal: "", opening: false },
      { name: "About you", goal: "Who they are", opening: true },
    ]);
  });

  it("has no plan without questions", () => {
    expect(parsePrepared("Nothing to ask.")).toBeNull();
  });

  it("reads drafts and drops empty ones", () => {
    const d = parseDrafts('{"summary": "s", "items": [{"kind": "fact", "label": "role", "text": "PM"}, {"kind": "note", "label": "", "text": "x"}]}');
    expect(d.items).toEqual([{ kind: "fact", about: "person", label: "role", text: "PM", from: undefined }]);
  });
});

describe("command", () => {
  it("knows skip and stop, and nothing else", () => {
    expect(command("Skip.")).toBe("skip");
    expect(command("next question")).toBe("skip");
    expect(command("That's all")).toBe("stop");
    expect(command("I'd skip the gym this week")).toBeNull();
  });
});
