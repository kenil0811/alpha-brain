import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { SoonProvider, TooltipProvider } from "../ui";
import { Settings } from "./Settings";
import { bindingOf, comboLabel } from "./shortcuts";

function fake(): Client {
  return {
    claude: vi.fn().mockResolvedValue({ installed: true, signed_in: true, email: "k@example.com", plan: "Max" }),
    dataInfo: vi.fn().mockResolvedValue({ folder: "/tmp/alpha", size: 2048, backups: [{ name: "b1", size: 1024, at: "2026-10-01T10:00:00Z" }] }),
    preference: vi.fn().mockResolvedValue({ key: "companion_look", value: { animal: "fox" } }),
    setThinking: vi.fn().mockResolvedValue({ route: "codex", claude: { installed: true, signed_in: true }, codex: { installed: true, signed_in: true } }),
  } as unknown as Client;
}

function open(section: string, client = fake(), onSection = vi.fn(), extra: Partial<Parameters<typeof Settings>[0]> = {}) {
  render(
    <TooltipProvider>
      <SoonProvider>
        <Settings client={client} theme="system" onTheme={() => undefined} claude={null} onClaude={() => undefined} section={section} onSection={onSection} {...extra} />
      </SoonProvider>
    </TooltipProvider>,
  );
  return onSection;
}

describe("Settings", () => {
  beforeEach(() => localStorage.clear());

  it("has its sections in a side nav and opens the one the address names", async () => {
    const onSection = open("data");
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect([...nav.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Models", "Appearance", "Companion", "Project look", "Builds", "Desktop", "Permissions", "Shortcuts", "Data"]);
    expect(screen.getByRole("button", { name: "Data" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("/tmp/alpha · 2 KB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("Going back to a backup is coming soon.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(onSection).toHaveBeenCalledWith("appearance");
  });

  it("stars a connected way to think as the default, and says the others are coming soon", async () => {
    const client = fake();
    const thinking = { route: "claude" as const, claude: { installed: true, signed_in: true }, codex: { installed: true, signed_in: true } };
    open("models", client, vi.fn(), { thinking, onThinking: vi.fn() });
    expect(screen.getByRole("button", { name: "Claude is the default" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Make ChatGPT the default" }));
    expect(client.setThinking).toHaveBeenCalledWith("codex");
    fireEvent.click(screen.getByRole("button", { name: "Make Grok the default" }));
    expect(screen.getByText("Choosing the default model is coming soon.")).toBeInTheDocument();
  });

  it("records a shortcut, shows a clash, cancels with Esc and resets", () => {
    open("shortcuts");
    const row = () => screen.getByRole("button", { name: /^Search everything, or ask Zazoo:/ });
    fireEvent.click(row());
    expect(row()).toHaveTextContent("Press keys…");
    fireEvent.keyDown(window, { key: "w", code: "KeyW", metaKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent("⌘W already does");
    fireEvent.keyDown(window, { key: "j", code: "KeyJ", metaKey: true });
    expect(comboLabel(bindingOf("command-menu"))).toBe("⌘J");
    expect(row()).toHaveTextContent("⌘J");
    fireEvent.click(row());
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(row()).toHaveTextContent("⌘J");
    fireEvent.click(screen.getByRole("button", { name: "Reset “Search everything, or ask Zazoo” to ⌘K" }));
    expect(comboLabel(bindingOf("command-menu"))).toBe("⌘K");
    fireEvent.click(screen.getByRole("button", { name: /^Quit Alpha/ }));
    expect(screen.getByText("Changing ⌘Q is coming soon.")).toBeInTheDocument();
  });

  it("asks for a permission only to say it's coming soon", () => {
    open("permissions");
    fireEvent.click(screen.getAllByRole("button", { name: "Allow" })[0]);
    expect(screen.getByText("Screen recording access is coming soon.")).toBeInTheDocument();
  });

  it("offers the companion's colours, named for the animal it is", async () => {
    open("appearance");
    await vi.waitFor(() => expect(localStorage.getItem("alpha.appearance.animal")).toBe("fox"));
    fireEvent.click(screen.getByRole("button", { name: "On" }));
    expect(JSON.parse(localStorage.getItem("alpha.appearance")!)).toMatchObject({ companion: true, accent: "companion" });
    expect(document.getElementById("alpha-palette")?.textContent).toContain("--primary: #a8521d;");
  });
});
