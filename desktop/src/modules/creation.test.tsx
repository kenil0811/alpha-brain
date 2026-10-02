import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Creation, ModuleDetail } from "../core/client";
import { TooltipProvider } from "../ui";
import { CreationOnPage } from "./CreationOnPage";

function page(creation: Partial<Creation>, client: Partial<Client> = {}) {
  const detail = { id: "m_1", name: "Untitled project", creation: { thread: "t_1", ...creation }, running: [] } as unknown as ModuleDetail;
  render(
    <TooltipProvider>
      <CreationOnPage client={client as Client} detail={detail} onChanged={vi.fn()} onDescribe={vi.fn()} onImport={vi.fn()} />
    </TooltipProvider>,
  );
}

describe("making a project on its page", () => {
  it("starts blank with Describe your project and Import", () => {
    page({ stage: "new" });
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText(/Import a project/)).toBeInTheDocument();
  });

  it("asks its questions with defaults", () => {
    page({ stage: "asking", questions: [{ id: "role", question: "What is your role?", options: ["Teacher", "Student", "Admin"] }] });
    expect(screen.getByText("What is your role?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use these defaults for now" })).toBeInTheDocument();
  });

  it("marks Alpha's pick among the options", () => {
    page({ stage: "proposing", proposal: { intro: "Two ways.", findings: [], default: "a", options: [{ id: "a", title: "Simple", summary: "One table" }, { id: "b", title: "Full", summary: "Three tables" }] } as never });
    expect(screen.getByText("Alpha's pick")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Go with/ })).toHaveLength(2);
  });

  it("offers Create it once planned, and sends build", () => {
    const answerCreation = vi.fn().mockResolvedValue({});
    page({ stage: "planned" }, { answerCreation });
    fireEvent.click(screen.getByRole("button", { name: "Create it" }));
    expect(answerCreation).toHaveBeenCalledWith("m_1", { build: true });
  });

  it("offers Try again and Start over on failure, Carry on after a timeout", () => {
    page({ stage: "asking", error: "the model didn't answer" });
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument();
  });

  it("carries on after running out of time", () => {
    page({ stage: "building", error: "Alpha stopped partway.", timed_out: true });
    expect(screen.getByRole("button", { name: "Carry on" })).toBeInTheDocument();
  });
});
