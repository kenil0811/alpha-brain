import { describe, expect, it } from "vitest";
import { command, fullMinutes, parseDrafts, parsePrepared, plan, type Question } from "./interviewPlan";

const q = (id: string, topic: string, value: number, minutes: number): Question => ({ id, topic, question: `${id}?`, why: "", value, minutes });
const QS = [q("a1", "Work", 9, 1), q("a2", "Work", 4, 2), q("b1", "Health", 8, 1), q("c1", "Money", 2, 3), q("a3", "Work", 7, 1)];

describe("plan", () => {
  it("covers everything at full minutes", () => {
    const p = plan(QS, fullMinutes(QS));
    expect(p.order).toHaveLength(5);
    expect(p.questionShare).toBe(1);
    expect(p.valueShare).toBe(1);
  });

  it("spends a short budget on the highest return and keeps topics together", () => {
    const p = plan(QS, 3.5);
    expect(p.order.map((x) => x.id)).toEqual(["a1", "a3", "b1"]); // Work's best (9) leads, then Health
    expect(p.minutes).toBeLessThanOrEqual(3.5);
    expect(p.questionShare).toBeCloseTo(3 / 5);
    expect(p.valueShare).toBeCloseTo(24 / 30);
  });

  it("keeps the topic being talked about first", () => {
    expect(plan(QS, 10, "Health").order[0].topic).toBe("Health");
  });

  it("fits nothing into no time", () => {
    expect(plan(QS, 0).order).toEqual([]);
  });
});

describe("replies", () => {
  it("reads the questions after the prose and clamps what's out of range", () => {
    const p = parsePrepared('I read {a few} things.\n{"context": "c", "gaps": ["g"], "questions": [{"topic": "Work", "question": "What next?", "value": 40, "minutes": "2"}, {"question": ""}]}');
    expect(p?.questions).toEqual([{ id: "q1", topic: "Work", question: "What next?", why: "", value: 10, minutes: 2 }]);
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
