import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { Settings } from "./Settings";

function client() {
  const c = {
    dataInfo: vi.fn(async () => ({ folder: "/Users/me/Alpha", size: 2048, backups: [] })),
    claude: vi.fn(async () => ({ installed: true, signed_in: true })),
    preference: vi.fn(async (key: string) => ({ key, value: null })),
    setPreference: vi.fn(async (key: string, value: unknown) => ({ key, value })),
    intelligence: vi.fn(async () => ({ hands: [], skills: [], automations: [], readers: [], connections: [], knowledge: { facts: [], notes: [], goals: [], permissions: [{ id: "perm1", sentence: "Save drafts in my mail", procedure: "draft", effect: "prepare", granted_at: "2026-10-01T09:00:00+00:00" }] } })),
    revokePermission: vi.fn(async () => ({})),
    browser: vi.fn(async () => ({ installed: true, installing: false, words: null, chrome: true, problem: null })),
  };
  return c as unknown as Client & typeof c;
}

function mount(c: ReturnType<typeof client>, onChanged = vi.fn(), onGo = vi.fn()) {
  render(<Settings client={c} theme="system" onTheme={vi.fn()} claude={null} onClaude={vi.fn()} onChanged={onChanged} onGo={onGo} />);
  return onChanged;
}

describe("Settings", () => {
  it("lists its sections on the left; Overview, the first, shows every section's card at once", () => {
    mount(client());
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Workspace", "Thinks with", "Reads with", "Appearance", "Notifications", "Permissions", "Builder rules", "Defaults", "Your data", "Removed projects", "Help"]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    for (const name of ["Workspace", "Thinks with", "Appearance", "Notifications", "Permissions", "Builder rules", "Defaults", "Your data", "Removed projects", "Help"]) expect(screen.getByRole("region", { name })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Companion" })).toBeNull(); // its look lives on Alpha's agent page
    expect(screen.getByRole("button", { name: "Match Mac" })).toBeInTheDocument();
    expect(screen.getAllByText(/Nothing configured yet/)).toHaveLength(3);
  });

  it("shows only a section's own card when it is picked, and Appearance's Companion opens Alpha's agent page", async () => {
    const onGo = vi.fn();
    mount(client(), vi.fn(), onGo);
    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByRole("region", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Workspace" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Companion" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "agent", id: "alpha" });
  });

  it("saves the workspace's name through the preference route, then says something changed", async () => {
    const c = client();
    const onChanged = mount(c);
    const name = screen.getByLabelText("Name");
    expect(name).toHaveValue("Kenil's workspace");
    await userEvent.clear(name);
    await userEvent.type(name, "Studio");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(c.setPreference).toHaveBeenCalledWith("workspace_name", "Studio");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows Manage Workspace and Sign out disabled, and standing permissions with Revoke", async () => {
    const c = client();
    mount(c);
    expect(screen.getByRole("button", { name: "Manage Workspace" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
    expect(await screen.findByText("Save drafts in my mail")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(c.revokePermission).toHaveBeenCalledWith("perm1");
  });
});
