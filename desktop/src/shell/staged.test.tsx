import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, NeedItem } from "../core/client";
import { StagedCard } from "./CardBits";

const item = (offers = false): NeedItem => ({
  kind: "staged",
  id: "j_1",
  text: "Add 2 rows to Contacts",
  at: "2026-10-19T09:00:00Z",
  by: "Intake",
  staged: {
    id: "stg_1",
    kind: "rows",
    target: "contacts",
    place: "Contacts",
    state: "held",
    offers_always: offers,
    fields: [{ name: "name", label: "Name", kind: "text" }, { name: "email", label: "Email", kind: "text" }],
    rows: [{ values: { name: "Anna", email: "anna@x.test" } }, { values: { name: "Ben", email: "ben@x.test" } }],
  },
});

describe("what an agent brought in (P3)", () => {
  it("lands only what is ticked, with the person's changes, and offers Always only when the card does", async () => {
    const user = userEvent.setup();
    const client = { decideStaged: vi.fn(async () => ({ staged: {}, landed: [] })) } as unknown as Client;
    const onDone = vi.fn();
    const { rerender } = render(<StagedCard item={item()} client={client} onDone={onDone} />);
    expect(screen.getByText("Intake brought in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Always" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep row 2" }));
    await user.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name, row 1" }), { target: { value: "Anna Park" } });
    await user.click(screen.getByRole("button", { name: "Yes, keep 1" }));
    expect(client.decideStaged).toHaveBeenCalledWith("stg_1", { accept: true, ticks: [0], edits: { 0: { name: "Anna Park" } }, always: false });
    expect(onDone).toHaveBeenCalledWith("Kept.");
    rerender(<StagedCard item={item(true)} client={client} onDone={onDone} />);
    expect(screen.getByRole("button", { name: "Always" })).toBeInTheDocument();
  });
});
