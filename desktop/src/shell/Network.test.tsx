import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, Entity } from "../core/client";
import { forgetPreferences } from "../core/preferences";
import { TooltipProvider } from "../ui";
import { Network } from "./Network";

beforeEach(() => forgetPreferences());

function client(rows: Entity[]) {
  return { people: () => Promise.resolve(rows), preference: (key: string) => Promise.resolve({ key, value: null }), setPreference: vi.fn() } as unknown as Client;
}

describe("Network", () => {
  it("shows People in the one data view even when empty, then Files, Intelligence and Governance below", async () => {
    render(
      <TooltipProvider>
        <Network client={client([])} version={0} onOpen={vi.fn()} />
      </TooltipProvider>,
    );
    const view = await screen.findByLabelText("People");
    const table = await within(view).findByRole("table");
    for (const h of ["Name", "About", "Last heard"]) expect(within(table).getByRole("columnheader", { name: new RegExp(h) })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Files" })).toBeInTheDocument();
    const governance = screen.getByRole("region", { name: "Governance" });
    expect(within(governance).getByRole("tab", { name: "Allowed 0", selected: true })).toBeInTheDocument();
    expect(within(governance).getByRole("tab", { name: "Denied 0" })).toBeInTheDocument();
    expect(within(governance).getByRole("button", { name: "Add allowed action" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Intelligence" })).getByText("Nothing heard yet.")).toBeInTheDocument();
  });

  it("lists each side in its table, opens a page, and shows the latest with each in Intelligence", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const rows = [
      { id: "e1", kind: "person", name: "Ana Ruiz", aliases: [], keys: {}, last_at: "2026-10-08T08:00:00+00:00", last_text: "Sent the P&L", summary: "Owner of the bakery" },
      { id: "e2", kind: "organisation", name: "RestoPros", aliases: [], keys: {}, last_at: null, last_text: null, summary: null },
    ] as Entity[];
    render(
      <TooltipProvider>
        <Network client={client(rows)} version={0} onOpen={onOpen} />
      </TooltipProvider>,
    );
    const people = await screen.findByLabelText("People");
    expect(await within(people).findByText("Owner of the bakery")).toBeInTheDocument();
    expect(within(people).queryByText("RestoPros")).toBeNull();
    const intel = screen.getByRole("region", { name: "Intelligence" });
    expect(await within(intel).findByText("Sent the P&L")).toBeInTheDocument();
    await user.click(within(intel).getByRole("button", { name: "Ana Ruiz" }));
    expect(onOpen).toHaveBeenCalledWith("e1");
    await user.click(screen.getByRole("tab", { name: "Organizations" }));
    expect(await within(await screen.findByLabelText("Organizations")).findByText("RestoPros")).toBeInTheDocument();
  });
});
