import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Fact } from "../core/client";
import { TooltipProvider } from "../ui";
import { AboutYou, sourceWords } from "./AboutYou";

const fact = (over: Partial<Fact>): Fact => ({ id: "f_1", subject: "person", predicate: "degree", value: "MSc", valid_from: "", valid_to: null, recorded_at: "2026-10-01T10:00:00+00:00", source: "person", why: null, confidence: 1, state: "accepted", ...over });

describe("About you", () => {
  it("says where each fact came from", () => {
    expect(["person", "module:m_1", "turn:j_1", "alpha"].map(sourceWords)).toEqual(["You said so", "From a project", "From a conversation", "Alpha worked it out"]);
  });

  it("lists what is known and waits for a yes on suggestions", async () => {
    const client = { decideFact: vi.fn(async () => fact({})) } as unknown as Client;
    const facts = [fact({}), fact({ id: "f_2", predicate: "target_roles", value: "PM", state: "suggested", source: "turn:j_1", why: "You said so on Monday" })];
    render(
      <TooltipProvider>
        <AboutYou client={client} facts={facts} modules={[]} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByText("1 known")).toBeInTheDocument();
    expect(screen.getByText("MSc")).toBeInTheDocument();
    expect(screen.getByText("From a conversation · You said so on Monday")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's right" }));
    await waitFor(() => expect(client.decideFact).toHaveBeenCalledWith("f_2", true));
  });
});
