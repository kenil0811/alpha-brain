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
  it("shows People's table even when empty: a header row, blank rows and + New, with Governance below", async () => {
    render(
      <TooltipProvider>
        <Network client={client([])} version={0} onOpen={vi.fn()} />
      </TooltipProvider>,
    );
    const table = await screen.findByRole("table", { name: "People" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "About", "Last heard"]);
    expect(within(table).getByRole("button", { name: "New" })).toBeDisabled();
    expect(table.querySelectorAll("tr.row--blank").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Governance" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Intelligence" })).toBeNull(); // nothing to show yet
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
    const people = await screen.findByRole("table", { name: "People" });
    expect(within(people).getByText("Owner of the bakery")).toBeInTheDocument();
    expect(within(people).queryByText("RestoPros")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Intelligence" })).getByText("Sent the P&L")).toBeInTheDocument();
    await user.click(within(people).getByRole("button", { name: /Ana Ruiz/ }));
    expect(onOpen).toHaveBeenCalledWith("e1");
    await user.click(screen.getByRole("tab", { name: "Organizations" }));
    expect(within(screen.getByRole("table", { name: "Organizations" })).getByText("RestoPros")).toBeInTheDocument();
  });
});
