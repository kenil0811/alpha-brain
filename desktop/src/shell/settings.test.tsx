import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, ModelProvider, SettingField } from "../core/client";
import { avatarView } from "../avatar/AvatarWindow";
import { ProviderAccounts } from "./models";
import { Settings } from "./Settings";

function row(id: string, over: Partial<ModelProvider> = {}): ModelProvider {
  return { id, label: id, kind: "key", state: "needs_key", dot: { color: "grey", tooltip: "No key saved." }, error: null, key_last4: null, installing: false, who: null, default: false, ...over };
}

const access: SettingField = { id: "access.mode", group: "Access", title: "When Alpha needs your OK", description: "", kind: "choice", default: "ask", value: "ask", options: [{ value: "ask", label: "Ask for approval" }, { value: "full", label: "Full access" }], minimum: null, maximum: null, unit: null };

function fake(): Client {
  return {
    modelProviders: vi.fn().mockResolvedValue([row("claude", { kind: "sign_in", state: "connected", default: true, who: "k@example.com", dot: { color: "green", tooltip: "Connected." } }), row("groq", { transcribe_only: true })]),
    providerModels: vi.fn().mockResolvedValue({ models: [], selected: null }),
    settings: vi.fn().mockResolvedValue([access]),
    updateSettings: vi.fn().mockResolvedValue([{ ...access, value: "full" }]),
    dataInfo: vi.fn().mockResolvedValue({ folder: "/tmp/alpha", size: 2048, backups: [] }),
    runtimeInfo: vi.fn().mockResolvedValue({ ok: true, world: "", core_version: "0.1.0", python_version: "3.13.1" }),
  } as unknown as Client;
}

describe("Settings", () => {
  it("has Alpha's sections in a side nav and opens the one the address names", async () => {
    const onSection = vi.fn();
    render(<Settings client={fake()} theme="light" onTheme={() => undefined} section="data" onSection={onSection} />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect([...nav.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Models", "Appearance", "Project look", "Builds", "Desktop", "Data & runtime", "About"]);
    expect(screen.getByRole("button", { name: "Data & runtime" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("Core 0.1.0 · Python 3.13.1 · internal development build")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Builds" }));
    expect(onSection).toHaveBeenCalledWith("builds");
  });

  it("saves the access default in Builds", async () => {
    const client = fake();
    render(<Settings client={client} theme="light" onTheme={() => undefined} section="builds" onSection={() => undefined} />);
    fireEvent.change(await screen.findByLabelText("When Alpha needs your OK"), { target: { value: "full" } });
    await waitFor(() => expect(client.updateSettings).toHaveBeenCalledWith({ "access.mode": "full" }));
  });

  it("goes back to a backup only after the person confirms", async () => {
    const client = fake();
    const backups = [{ name: "world-20261002-090000.sqlite", size: 4096, at: new Date().toISOString() }];
    (client.dataInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ folder: "/tmp/alpha", size: 2048, backups });
    (client as unknown as { restoreBackup: unknown }).restoreBackup = vi.fn().mockResolvedValue({ folder: "/tmp/alpha", size: 2048, backups });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<Settings client={client} theme="light" onTheme={() => undefined} section="data" onSection={() => undefined} />);
    const goBack = await screen.findByRole("button", { name: "Go back" });
    fireEvent.click(goBack);
    expect(client.restoreBackup).not.toHaveBeenCalled();
    fireEvent.click(goBack);
    await waitFor(() => expect(client.restoreBackup).toHaveBeenCalledWith("world-20261002-090000.sqlite"));
    confirm.mockRestore();
  });

  it("badges the default, says who is signed in, and gives Groq no star", async () => {
    render(<ProviderAccounts client={fake()} />);
    expect(await screen.findByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Signed in as k@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make groq the default" })).toBeNull();
  });
});

describe("the companion's state", () => {
  const base = { busy: false, star: null, turns: [], needs: 0, threads: [], running: 0 };
  it("shows the most pressing real state first", () => {
    expect(avatarView(base).state).toBe("idle");
    expect(avatarView({ ...base, busy: true }).state).toBe("thinking");
    expect(avatarView({ ...base, needs: 2, busy: true })).toEqual({ state: "awaiting", text: "2 things need you" });
    const star = row("claude", { default: true, dot: { color: "red", tooltip: "Not signed in." } });
    expect(avatarView({ ...base, star, needs: 2 })).toEqual({ state: "disconnected", text: "Not signed in." });
    const failed = { id: "j", at: new Date().toISOString(), kind: "failed", actor: "alpha", text: "x", data: {}, module: null, thread: null, entity_ids: [], source: null };
    expect(avatarView({ ...base, turns: [failed], needs: 1 }).state).toBe("error");
    const making = { id: "t", title: "Making Jobs", kind: "build", state: "working", module: null, session_ref: null, created_at: "", updated_at: "" };
    expect(avatarView({ ...base, threads: [making] })).toEqual({ state: "building", text: "Making Jobs" });
  });
});
