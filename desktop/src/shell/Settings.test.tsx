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
  };
  return c as unknown as Client & typeof c;
}

function mount(c: ReturnType<typeof client>, onChanged = vi.fn()) {
  render(<Settings client={c} theme="system" onTheme={vi.fn()} claude={null} onClaude={vi.fn()} onChanged={onChanged} />);
  return onChanged;
}

describe("Settings", () => {
  it("lists its sections and switches between them", async () => {
    mount(client());
    const names = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names).toEqual(["Workspace", "Thinks with", "Appearance", "Companion", "Notifications", "Permissions", "Builder rules", "Defaults", "Your data", "Removed modules", "Help"]);
    expect(screen.getByRole("tab", { name: "Workspace", selected: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByRole("tab", { name: "Appearance", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match Mac" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Notifications" }));
    expect(screen.getByText("Nothing configured yet")).toBeInTheDocument();
  });

  it("saves the workspace's name through the preference route, then says something changed", async () => {
    const c = client();
    const onChanged = mount(c);
    const name = screen.getByLabelText("Name");
    expect(name).toHaveValue("Alpha");
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
    await userEvent.click(screen.getByRole("tab", { name: "Permissions" }));
    expect(await screen.findByText("Save drafts in my mail")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(c.revokePermission).toHaveBeenCalledWith("perm1");
  });
});
