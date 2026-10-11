import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Ask, Client } from "../core/client";
import { AskGroup, groupAsks } from "./AssistantPanel";

const asks: Ask[] = [
  { id: "a1", text: "What should it do?", at: "", options: ["A program", "Logging", "Both"], thread: null, module: null, turn: "t1" },
  { id: "a2", text: "Where do you train?", at: "", options: ["Gym", "Home"], thread: null, module: null, turn: "t1" },
  { id: "a3", text: "Any program already?", at: "", options: [], thread: null, module: null, turn: "t1" },
];

describe("questions asked together", () => {
  it("are one form: taps and words gathered, one Answer sends them all", async () => {
    const client = { answerAsks: vi.fn().mockResolvedValue({ answered: ["a1", "a2", "a3"], turn: null }) } as unknown as Client;
    const onAnswered = vi.fn();
    render(<AskGroup asks={asks} client={client} onAnswered={onAnswered} />);
    const answer = screen.getByRole("button", { name: "Answer" });
    expect(answer).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Both" }));
    expect(client.answerAsks).not.toHaveBeenCalled(); // a tap sends nothing yet
    expect(screen.getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Answer 1 of 3" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Gym" }));
    fireEvent.change(screen.getByLabelText("Your answer: Any program already?"), { target: { value: "No" } });
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    await screen.findByRole("button", { name: "Answer" });
    expect(client.answerAsks).toHaveBeenCalledWith({ a1: "Both", a2: "Gym", a3: "No" });
    expect(onAnswered).toHaveBeenCalled();
  });

  it("groups by the turn that asked; a derived card and a lone question stand alone", () => {
    const lone: Ask = { id: "b1", text: "Which folder?", at: "", options: [], thread: null, module: null, turn: "t2" };
    const derived: Ask = { id: "d1", text: "Salad or soup?", at: "", options: ["Salad", "Soup"], thread: null, module: null, turn: "t1", derived: true };
    expect(groupAsks([...asks, lone, derived]).map((g) => g.map((a) => a.id))).toEqual([["a1", "a2", "a3"], ["b1"], ["d1"]]);
  });
});
