import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, PendingAction } from "../core/client";
import { ToastProvider, TooltipProvider } from "../ui";
import { Home } from "./Home";

const action: PendingAction = { id: "pa_1", kind: "send_message", connector: "browser", summary: "Message Dana on LinkedIn", payload: { to: "Dana" }, module: null, asked: "j_1", state: "pending", created_at: "2026-10-01T10:00:00+00:00", expires_at: null, result: null };

describe("Home", () => {
  it("shows a pending action once and the result after deciding", async () => {
    const approvePending = vi.fn(async () => ({ ...action, state: "unavailable" as const, result: { error: "nothing in Alpha can do send_message yet" } }));
    const client = {
      home: async () => ({ date: "", needs_you: [{ kind: "ask", id: "j_1", text: "Message Dana on LinkedIn", at: action.created_at, options: ["Approve", "Reject"] }], ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null }),
      pending: async () => [action],
      approvePending,
    } as unknown as Client;
    render(
      <TooltipProvider>
        <ToastProvider>
          <Home client={client} version={0} onGo={vi.fn()} onChanged={vi.fn()} onAsk={vi.fn()} onNew={vi.fn()} />
        </ToastProvider>
      </TooltipProvider>,
    );
    expect(await screen.findAllByRole("heading", { name: "Message Dana on LinkedIn" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved, but it can't be done: nothing in Alpha can do send_message yet.")).toBeInTheDocument();
    expect(approvePending).toHaveBeenCalledWith("pa_1");
  });
});
