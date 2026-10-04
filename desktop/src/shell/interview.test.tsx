import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, ModuleCard } from "../core/client";
import { TooltipProvider } from "../ui";
import { Interview } from "./Interview";
import { INTERVIEWER } from "./interviewPlan";

const PLAN = '{"context": "Busy term.", "gaps": ["No targets"], "questions": [{"id": "q1", "topic": "Work", "question": "What matters most this month?", "value": 9, "minutes": 1}, {"id": "q2", "topic": "Alpha", "question": "What does done look like?", "value": 7, "minutes": 1}]}';
const DRAFTS = '{"summary": "Two things to keep.", "items": [{"kind": "fact", "about": "person", "label": "focus", "text": "Recruiting"}, {"kind": "note", "about": "alpha", "label": "Done means", "text": "A beta with ten users"}]}';

describe("Interview", () => {
  it("prepares, asks in order, drafts and keeps only what was ticked", async () => {
    localStorage.clear();
    const asked: string[] = [];
    const client = {
      newConversation: vi.fn(async () => ({ id: "c_1" })),
      askAndWait: vi.fn(async (text: string) => {
        asked.push(text);
        return { id: "t", state: "done", text, reply: asked.length === 1 ? PLAN : asked.length === 2 ? DRAFTS : "Recorded." };
      }),
      writeNote: vi.fn(async () => ({})),
    } as unknown as Client;
    const modules = [{ id: "alpha", name: "Alpha" }] as ModuleCard[];
    render(
      <TooltipProvider>
        <Interview client={client} tool={INTERVIEWER} modules={modules} onGo={vi.fn()} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Busy term.")).toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(2); // the default 10 minutes covers every question and all their value
    fireEvent.click(screen.getByRole("button", { name: "Start the interview" }));
    expect(screen.getByRole("heading", { name: "What matters most this month?" })).toBeInTheDocument();
    const box = screen.getByLabelText("Type your answer instead");
    fireEvent.change(box, { target: { value: "Recruiting" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("heading", { name: "What does done look like?" })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "A beta with ten users" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Two things to keep.")).toBeInTheDocument();
    expect(asked[1]).toContain("A: Recruiting");
    fireEvent.click(screen.getByLabelText("Keep focus"));
    fireEvent.click(screen.getByRole("button", { name: "Keep 1" }));
    expect(await screen.findByText(/Kept 1 thing/)).toBeInTheDocument();
    expect(asked).toHaveLength(2); // the unticked fact never reaches Alpha
    expect(client.writeNote).toHaveBeenCalledWith("module:alpha", expect.stringMatching(/^Done means \(Interview me, /), "A beta with ten users");
  });

  it("hands ticked facts to Alpha to record, exactly as approved", async () => {
    localStorage.clear();
    const asked: string[] = [];
    const client = {
      newConversation: vi.fn(async () => ({ id: "c_1" })),
      askAndWait: vi.fn(async (text: string, opts: { conversation?: string }) => {
        asked.push(`${opts.conversation}|${text}`);
        return { id: "t", state: "done", text, reply: asked.length === 1 ? PLAN : asked.length === 2 ? DRAFTS : "Recorded." };
      }),
      writeNote: vi.fn(async () => ({})),
    } as unknown as Client;
    render(
      <TooltipProvider>
        <Interview client={client} tool={INTERVIEWER} modules={[{ id: "alpha", name: "Alpha" }] as ModuleCard[]} onGo={vi.fn()} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Start the interview" }));
    fireEvent.change(screen.getByLabelText("Type your answer instead"), { target: { value: "Recruiting" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep 2" }));
    expect(await screen.findByText(/Kept 2 things/)).toBeInTheDocument();
    expect(asked[2]).toMatch(/^c_1\|.*fact_record[\s\S]*- focus: Recruiting$/);
  });
});
