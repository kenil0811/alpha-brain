import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { AvatarWindow, HANDOFF_KEY } from "./AvatarWindow";

const needs = [{ id: "a1", kind: "ask", text: "Which list should Ann go on?", options: [] }];
const client = {
  companion: async () => ({ focus: null }),
  conversation: async () => ({ turns: [] }),
  home: async () => ({ needs_you: needs }),
  changes: async () => ({ at: "t", journal: 0 }),
} as unknown as Client;
const host = { layout: vi.fn(async () => undefined), showMain: vi.fn(async () => undefined) };

describe("the companion", () => {
  it("answers from the bubble itself: no Open button, a click loads the screen Answer opens", async () => {
    render(<AvatarWindow client={client} host={host} />);
    const bubble = await screen.findByRole("button", { name: /Which list should Ann go on/ });
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    fireEvent.click(bubble);
    expect(JSON.parse(localStorage.getItem(HANDOFF_KEY)!).surface).toEqual({ kind: "needs" });
    expect(host.showMain).toHaveBeenCalled();
  });

  it("puts Open in platform left of the arrows, which make the panel larger", async () => {
    render(<AvatarWindow client={client} host={host} />);
    await act(async () => fireEvent.keyDown(screen.getByRole("button", { name: "Ask Alpha" }), { key: "Enter" }));
    const open = screen.getByRole("button", { name: "Open in platform" });
    const larger = screen.getByRole("button", { name: "Larger" });
    expect(open.compareDocumentPosition(larger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => fireEvent.click(larger));
    expect(host.layout).toHaveBeenLastCalledWith("open", 560, 820);
    expect(screen.getByRole("button", { name: "Smaller" })).toBeTruthy();
  });
});
