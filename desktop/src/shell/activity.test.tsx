import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Automation, Client } from "../core/client";
import { ToastProvider, TooltipProvider } from "../ui";
import { Activity, failedAutomations } from "./Activity";

const auto = (id: string, more: Partial<Automation>) => ({ id, title: id, module: null, thread: null, schedule: "", when: "", procedure: "", enabled: true, next_run_at: null, last_run_at: null, last_result: null, last_error: null, ...more }) as Automation;

describe("Activity", () => {
  it("keeps only automations whose last run failed and that aren't running again", () => {
    const all = [auto("ok", {}), auto("bad", { last_error: "Site changed" }), auto("retrying", { last_error: "x", running: true })];
    expect(failedAutomations(all).map((a) => a.id)).toEqual(["bad"]);
  });

  it("runs a failed automation again", async () => {
    const runAutomation = vi.fn(async () => auto("bad", {}));
    const client = {
      home: async () => ({ needs_you: [] }),
      automations: async () => [auto("bad", { title: "Read the job board", last_error: "Site changed" })],
      activity: async () => [],
      runAutomation,
    } as unknown as Client;
    render(
      <TooltipProvider>
        <ToastProvider>
          <Activity client={client} version={0} onChanged={vi.fn()} />
        </ToastProvider>
      </TooltipProvider>,
    );
    expect(await screen.findByText("Read the job board")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run it again" }));
    await waitFor(() => expect(runAutomation).toHaveBeenCalledWith("bad"));
  });
});
