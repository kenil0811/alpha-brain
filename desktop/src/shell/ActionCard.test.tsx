import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Action, Client } from "../core/client";
import { ActionCard } from "./ActionCard";

const action: Action = {
  id: "act_1", procedure: "gmail_draft", title: "Draft to Sania about the bakery",
  payload: { to: "sania@example.com", subject: "Bakery", body: "It lists at £300,000." },
  evidence: "the listing you saved", undo: "the draft can be deleted", effect: "prepare",
  site: "mail.google.com", state: "proposed", module: null, preview: "preview.png", preview_note: null,
  checked: "Checked against an independent answer: it agrees; against your world: it differs on price: Alpha £300,000, world £320,000 (record r_x in listings).",
  shots: {}, result: null, error: null, created_at: "2026-10-16T10:00:00Z", updated_at: "2026-10-16T10:00:00Z",
};

describe("an outward card carries Columbo's line (Q47)", () => {
  it("says what its numbers were checked against and still lets the person decide", () => {
    const client = { actionShot: vi.fn().mockRejectedValue(new Error("no shot")) } as unknown as Client;
    render(<ActionCard action={action} client={client} onDecided={vi.fn()} />);
    expect(screen.getByText(/Columbo: checked against an independent answer: it agrees; against your world: it differs on price/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do it" })).not.toBeDisabled();
  });
});
