import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, EntityDetail } from "../core/client";
import { EntityPage } from "./People";

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const anna: EntityDetail = {
  id: "e_1",
  kind: "person",
  name: "Anna Lee",
  aliases: ["anna@restopros.com"],
  keys: { email: ["anna@restopros.com"], phone: ["+447700900123"] },
  facts: [],
  timeline: [],
  maybe_same: [],
  page: null,
  organisations: [{ id: "e_org", kind: "organisation", name: "RestoPros", aliases: [], keys: { domain: ["restopros.com"] }, by: ["domain:restopros.com"], ended_at: null }],
  members: [],
  sources: [{ source: "mac-contacts", ref: "c1", entity: "e_1", details: {}, updated_at: ago(0) }],
  merged: [{ id: "e_2", kind: "person", name: "A. Lee", aliases: [], keys: { phone: ["+447700900123"] } }],
  rows: [],
  contact: { days: 90, last: ago(1), channels: [{ channel: "Emails", count: 2, last: ago(1), you: 1, them: 1 }, { channel: "meeting", count: 1, last: ago(5), you: null, them: null }], total: 3, you: 1, them: 1 },
  interactions: [
    { person: "e_1", at: ago(1), channel: "Emails", title: "Re: Sept P&L", started_by: "you", ref: "record:emails/r_1" },
    { person: "e_1", at: ago(5), channel: "meeting", title: "Call with Anna", started_by: null, ref: "event:ev_1" },
  ],
};

describe("a person's page (P8)", () => {
  it("says where they belong and came from, how lately in plain numbers, and undoes a merge", async () => {
    const user = userEvent.setup();
    const client = {
      entity: vi.fn(async () => anna),
      entityFiles: vi.fn(async () => []),
      unmerge: vi.fn(async () => ({ id: "e_2" })),
    } as unknown as Client;
    const onChanged = vi.fn();
    render(<EntityPage client={client} id="e_1" version={0} onBack={vi.fn()} onOpen={vi.fn()} onChanged={onChanged} />);
    expect(await screen.findByRole("heading", { name: "Anna Lee" })).toBeInTheDocument();
    expect(screen.getByText("from your Mac's contacts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RestoPros" })).toBeInTheDocument();
    expect(screen.getByText("email at restopros.com")).toBeInTheDocument();
    expect(screen.getByText(/^2 in Emails, 1 meeting in the last 90 days · last on .* · you started 1, they started 1$/)).toBeInTheDocument();
    expect(screen.getByText("Re: Sept P&L")).toBeInTheDocument();
    const merged = screen.getByText("A. Lee").closest(".list__row") as HTMLElement;
    await user.click(within(merged).getByRole("button", { name: "Unmerge" }));
    expect(client.unmerge).toHaveBeenCalledWith("e_2");
    expect(onChanged).toHaveBeenCalled();
  });
});
