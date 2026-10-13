import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Fact, Goal, Intelligence as Data } from "../../core/client";
import { Intelligence } from "../Intelligence";

const fact: Fact = { id: "f1", subject: "person", predicate: "city", value: "Londn", valid_from: "2026-10-02T17:13:16Z", valid_to: null, recorded_at: "2026-10-02T17:13:16Z", source: "turn:j_1", why: null, confidence: 0.95, state: "accepted" };
const goal: Goal = { id: "g1", text: "An offer by December", state: "active", module: null, since: "2026-10-01T09:00:00Z" };
const data = (): Data => ({ hands: [], skills: [], automations: [], readers: [], connections: [], knowledge: { facts: [fact], notes: [], goals: [goal], permissions: [] } });

function core() {
  return {
    intelligence: vi.fn().mockResolvedValue(data()),
    modules: vi.fn().mockResolvedValue([]),
    preference: vi.fn().mockRejectedValue(new Error("none")),
    correctFact: vi.fn().mockResolvedValue({}),
    forgetFact: vi.fn().mockResolvedValue({}),
    addGoal: vi.fn().mockResolvedValue({}),
    changeGoal: vi.fn().mockResolvedValue({}),
    exportMemory: vi.fn().mockResolvedValue({ markdown: "/x/exports/What Alpha remembers 2026-10-13 18.00.md", json: "/x/exports/What Alpha remembers 2026-10-13 18.00.json", items: 12 }),
  };
}
const page = (c: ReturnType<typeof core>) => render(<Intelligence client={c as unknown as Client} tab="knowledge" version={0} onTab={vi.fn()} onChanged={vi.fn()} />);

describe("what Alpha knows, changed by hand (slice 2)", () => {
  it("corrects a known fact and forgets one, asking first", async () => {
    const c = core();
    page(c);
    const row = (await screen.findByText("City")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Correct…" }));
    const d = await screen.findByRole("dialog", { name: "Correct city" });
    fireEvent.change(within(d).getByRole("textbox", { name: "The right value" }), { target: { value: "London" } });
    fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(c.correctFact).toHaveBeenCalledWith("f1", "London"));
    fireEvent.click(within(row).getByRole("button", { name: "Forget…" }));
    const f = await screen.findByRole("dialog", { name: "Forget city?" });
    expect(f).toHaveTextContent("Alpha forgets that city is Londn. The journal keeps what was said, but Alpha no longer knows it.");
    fireEvent.click(within(f).getByRole("button", { name: "Forget it" }));
    await waitFor(() => expect(c.forgetFact).toHaveBeenCalledWith("f1"));
  });

  it("adds a goal, rewrites one and marks it done", async () => {
    const c = core();
    page(c);
    fireEvent.change(await screen.findByRole("textbox", { name: "A new goal" }), { target: { value: "Run twice a week" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(c.addGoal).toHaveBeenCalledWith("Run twice a week"));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "New words for An offer by December" });
    fireEvent.change(box, { target: { value: "An offer by November" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(c.changeGoal).toHaveBeenCalledWith("g1", { text: "An offer by November" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(c.changeGoal).toHaveBeenCalledWith("g1", { state: "done" }));
  });

  it("exports everything Alpha remembers and says where", async () => {
    const c = core();
    page(c);
    fireEvent.click(await screen.findByRole("button", { name: "Export everything Alpha remembers" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Exported 12 items to What Alpha remembers 2026-10-13 18.00.md and its JSON copy");
  });
});
