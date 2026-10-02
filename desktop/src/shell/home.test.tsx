import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { ToastProvider, TooltipProvider } from "../ui";
import { Home } from "./Home";

describe("Home", () => {
  it("shows what needs the person and answers it", async () => {
    const answerAsk = vi.fn(async () => ({ answered: "j_1", turn: null }));
    const client = {
      home: async () => ({ date: "", needs_you: [{ kind: "ask", id: "j_1", text: "Which board first?", at: "2026-10-01T10:00:00+00:00", options: ["LinkedIn", "Indeed"] }], ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null }),
      answerAsk,
    } as unknown as Client;
    render(
      <TooltipProvider>
        <ToastProvider>
          <Home client={client} version={0} onGo={vi.fn()} onChanged={vi.fn()} onAsk={vi.fn()} onNew={vi.fn()} onOpenThread={vi.fn()} />
        </ToastProvider>
      </TooltipProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Which board first?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Indeed" }));
    await waitFor(() => expect(answerAsk).toHaveBeenCalledWith("j_1", "Indeed"));
  });
});
