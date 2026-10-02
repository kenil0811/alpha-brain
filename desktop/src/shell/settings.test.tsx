import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { avatarView } from "../avatar/AvatarWindow";
import { Settings } from "./Settings";

function fake(): Client {
  return {
    claude: vi.fn().mockResolvedValue({ installed: true, signed_in: true, email: "k@example.com", plan: "Max" }),
    dataInfo: vi.fn().mockResolvedValue({ folder: "/tmp/alpha", size: 2048, backups: [] }),
  } as unknown as Client;
}

describe("Settings", () => {
  it("has its sections in a side nav and opens the one the address names", async () => {
    const onSection = vi.fn();
    render(<Settings client={fake()} theme="light" onTheme={() => undefined} claude={null} onClaude={() => undefined} section="data" onSection={onSection} />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect([...nav.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Claude", "Appearance", "Desktop", "Data", "About"]);
    expect(screen.getByRole("button", { name: "Data" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("/tmp/alpha · 2 KB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(onSection).toHaveBeenCalledWith("appearance");
  });

  it("says who Claude is signed in as", () => {
    render(<Settings client={fake()} theme="light" onTheme={() => undefined} claude={{ installed: true, signed_in: true, email: "k@example.com", plan: "Max" }} onClaude={() => undefined} section="claude" onSection={() => undefined} />);
    expect(screen.getByText("k@example.com · Max plan · through Claude Code on this Mac")).toBeInTheDocument();
  });
});

describe("the companion's state", () => {
  const base = { busy: false, claude: null, turns: [], needs: 0, threads: [], running: 0 };
  it("shows the most pressing real state first", () => {
    expect(avatarView(base).state).toBe("idle");
    expect(avatarView({ ...base, busy: true }).state).toBe("thinking");
    expect(avatarView({ ...base, needs: 2, busy: true })).toEqual({ state: "awaiting", text: "2 things need you" });
    expect(avatarView({ ...base, claude: { installed: true, signed_in: false }, needs: 2 }).state).toBe("disconnected");
    const failed = { id: "j", at: new Date().toISOString(), kind: "failed", actor: "alpha", text: "x", data: {}, module: null, thread: null, entity_ids: [], source: null };
    expect(avatarView({ ...base, turns: [failed], needs: 1 }).state).toBe("error");
    const making = { id: "t", title: "Making Jobs", kind: "build", state: "working", module: null, session_ref: null, created_at: "", updated_at: "" };
    expect(avatarView({ ...base, threads: [making] })).toEqual({ state: "building", text: "Making Jobs" });
  });
});
