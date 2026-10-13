import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserRow, Settings } from "./Settings";
import type { BrowserStatus, Client } from "../core/client";

const absent: BrowserStatus = { installed: false, installing: false, words: null, chrome: false, problem: null };

describe("the browser Alpha reads with (first run)", () => {
  it("offers Install when absent and shows the installer's words once it runs", async () => {
    const installing: BrowserStatus = { ...absent, installing: true, words: "Downloading Chromium 151.0.7922.34… 40% of 160.4 MiB" };
    const client = { browser: vi.fn().mockResolvedValue(installing), installBrowser: vi.fn().mockResolvedValue(installing) } as unknown as Client;
    const onStatus = vi.fn();
    render(<BrowserRow client={client} status={absent} onStatus={onStatus} />);
    expect(screen.getByText(/downloads about 250 MB, once/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith(installing));
    expect(client.installBrowser).toHaveBeenCalledTimes(1);
  });

  it("says where sign-in windows open once installed, and Try again after a failure", () => {
    const client = {} as Client;
    const { rerender } = render(<BrowserRow client={client} status={{ ...absent, installed: true, chrome: true }} onStatus={vi.fn()} />);
    expect(screen.getByText("Installed · sign-in windows open in your Chrome")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<BrowserRow client={client} status={{ ...absent, problem: "The browser didn't install: Error: getaddrinfo ENOTFOUND cdn" }} onStatus={vi.fn()} />);
    expect(screen.getByText(/didn't install/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("Settings as cards", () => {
  function fake() {
    const prefs: Record<string, unknown> = {};
    const client = {
      browser: vi.fn().mockResolvedValue({ ...absent, installed: true }),
      dataInfo: vi.fn().mockResolvedValue({ folder: "/Users/k/Library/Alpha", size: 4 * 1024 * 1024, backups: [] }),
      claude: vi.fn().mockResolvedValue({ installed: true, signed_in: true }),
      companion: vi.fn().mockResolvedValue(null),
      preference: vi.fn(async (key: string) => ({ key, value: prefs[key] ?? null })),
      setPreference: vi.fn(async (key: string, value: unknown) => {
        prefs[key] = value;
        return { key, value };
      }),
    };
    return { client: client as unknown as Client, calls: client };
  }

  it("shows each part as its own card, Removed modules empty for now, and the keys in Help", async () => {
    const { client } = fake();
    render(<Settings client={client} theme="system" onTheme={vi.fn()} claude={null} onClaude={vi.fn()} />);
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["Workspace", "Thinks with", "Reads with", "Appearance", "Your data", "Removed modules", "Defaults", "Help"]);
    expect(screen.getByRole("region", { name: "Removed modules" })).toHaveTextContent("Nothing here. Removing a module today deletes it for good");
    const help = screen.getByRole("region", { name: "Help" });
    expect(within(help).getByText("⌘K")).toBeInTheDocument();
    expect(within(help).getByText("Shift+F10")).toBeInTheDocument();
    expect(within(help).getByText("Unknown")).toBeInTheDocument(); // no Mac app in a test: no version
    expect(await screen.findByText(/\/Users\/k\/Library\/Alpha · 4.0 MB/)).toBeInTheDocument();
  });

  it("renames the workspace, the same name the sidebar shows", async () => {
    const { client, calls } = fake();
    render(<Settings client={client} theme="system" onTheme={vi.fn()} claude={null} onClaude={vi.fn()} />);
    const card = screen.getByRole("region", { name: "Workspace" });
    expect(within(card).getByText("Alpha")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(card).getByRole("textbox", { name: "The workspace's name" }), { target: { value: "Kenil's brain" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    expect(await within(card).findByText("Kenil's brain")).toBeInTheDocument();
    expect(calls.setPreference).toHaveBeenCalledWith("workspace_name", "Kenil's brain");
  });
});
