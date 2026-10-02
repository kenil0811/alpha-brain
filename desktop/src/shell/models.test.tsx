import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoreError, type Client, type ModelProvider } from "../core/client";
import { ProviderAccounts, byStatus } from "./models";

function row(id: string, over: Partial<ModelProvider> = {}): ModelProvider {
  return { id, label: id, kind: "key", state: "needs_key", dot: { color: "grey", tooltip: "No key saved." }, error: null, key_last4: null, installing: false, who: null, default: false, ...over };
}

const rows = [
  row("claude", { kind: "sign_in", state: "needs_sign_in", default: true }),
  row("grok", { state: "connected", key_last4: "1234", dot: { color: "red", tooltip: "Refused" }, error: "The provider said 402: no credits" }),
  row("deepseek", { state: "connected", key_last4: "9876", dot: { color: "green", tooltip: "Connected." } }),
  row("ollama", { kind: "local", state: "not_running", dot: { color: "grey", tooltip: "Ollama isn't running on this Mac." } }),
];

function fake(): Client {
  return {
    modelProviders: vi.fn().mockResolvedValue(rows),
    providerModels: vi.fn().mockResolvedValue({ models: [], selected: null }),
    starProvider: vi.fn().mockImplementation(async (id: string) => rows.map((r) => ({ ...r, default: r.id === id }))),
    saveProviderKey: vi.fn().mockRejectedValue(new CoreError("Grok refused that key.", 400)),
  } as unknown as Client;
}

describe("Settings -> Models", () => {
  it("puts problems first, then connected rows, then the rest", () => {
    expect(byStatus(rows).map((r) => r.id)).toEqual(["grok", "deepseek", "claude", "ollama"]);
  });

  it("moves the star, and says in one line why a key was refused", async () => {
    const client = fake();
    render(<ProviderAccounts client={client} />);
    expect(await screen.findByRole("button", { name: "claude is the default" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("The provider said 402: no credits");

    fireEvent.click(screen.getByRole("button", { name: "Make deepseek the default" }));
    expect(await screen.findByRole("button", { name: "deepseek is the default" })).toBeInTheDocument();
    expect(client.starProvider).toHaveBeenCalledWith("deepseek");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("deepseek key"), { target: { value: "sk-fake" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain("Grok refused that key."));
  });
});
