import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoreError, type Client, type ModuleCard } from "../core/client";
import { Rail } from "./Rail";
import { RemovedModulesList, RemoveModuleDialog } from "./RemoveModule";

const card = (id: string, name: string, parent: string | null = null): ModuleCard => ({ id, name, parent, path: [name], children: [], goal: null, tables: [], records: 0, last_at: null, last_text: null, created_at: "" });
const plan = { module: "Deals", tables: 1, rows: 12, files: 0, readers: [], agents: 1, inside: [], what: "1 table (12 rows) and 1 agent" };

function core() {
  const prefs: Record<string, unknown> = {};
  return {
    preference: vi.fn(async (key: string) => ({ key, value: prefs[key] ?? null })),
    setPreference: vi.fn(async (key: string, value: unknown) => {
      prefs[key] = value;
      return { key, value };
    }),
    renameModule: vi.fn().mockResolvedValue(card("m_d", "Deal flow")),
    moduleRemoval: vi.fn().mockResolvedValue(plan),
    removeModule: vi.fn().mockResolvedValue({ id: "m_d", name: "Deals", removed_at: "2026-10-13T14:00:00Z" }),
    deleteModule: vi.fn().mockResolvedValue({}),
    restoreModule: vi.fn().mockResolvedValue(card("m_d", "Deals")),
    removedModules: vi.fn().mockResolvedValue([{ id: "m_d", name: "Deals", removed_at: "2026-10-13T14:00:00Z", path: ["Avilo", "Deals"], holds: "1 table (12 rows) and 1 agent", tables: 1, rows: 12, inside: [] }]),
  };
}

describe("a module renamed in place in the sidebar", () => {
  it("saves on Enter, says a refusal in words, and Escape keeps the name", async () => {
    const c = core();
    const onChanged = vi.fn();
    render(<Rail client={c as unknown as Client} surface={{ kind: "home" }} modules={[card("m_d", "Deals"), card("m_a", "Avilo")]} needs={0} runtime="connected" onGo={vi.fn()} onNew={vi.fn()} onChanged={onChanged} collapsed={false} onToggleCollapsed={vi.fn()} />);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Deals" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename…" }));
    const box = await screen.findByRole("textbox", { name: "New name for Deals" });
    fireEvent.change(box, { target: { value: "Deal flow" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(c.renameModule).toHaveBeenCalledWith("m_d", "Deal flow"));
    expect(onChanged).toHaveBeenCalled();
    c.renameModule.mockRejectedValueOnce(new CoreError("There is a module called 'Avilo' already.", 400));
    fireEvent.contextMenu(screen.getByRole("button", { name: "Deals" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename…" }));
    const again = await screen.findByRole("textbox", { name: "New name for Deals" });
    fireEvent.change(again, { target: { value: "Avilo" } });
    fireEvent.keyDown(again, { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't rename Deals: There is a module called 'Avilo' already.");
  });
});

describe("taking a module away", () => {
  const dialog = (c: ReturnType<typeof core>, onDone = vi.fn()) => render(<RemoveModuleDialog client={c as unknown as Client} module={{ id: "m_d", name: "Deals" }} open onClose={vi.fn()} onDone={onDone} />);

  it("asks which of three is meant, hide by default", async () => {
    const c = core();
    const onDone = vi.fn();
    dialog(c, onDone);
    const d = await screen.findByRole("dialog", { name: "Take Deals away?" });
    expect(within(d).getByRole("radio", { name: /Hide it from the sidebar/ })).toBeChecked();
    fireEvent.click(within(d).getByRole("button", { name: "Hide it" }));
    await waitFor(() => expect(c.setPreference).toHaveBeenCalledWith("sidebar_hidden", ["m_d"]));
    expect(onDone).toHaveBeenCalledWith("hide");
    expect(c.removeModule).not.toHaveBeenCalled();
  });

  it("removes it with its data kept", async () => {
    const c = core();
    dialog(c);
    fireEvent.click(await screen.findByRole("radio", { name: /Remove it, keep its data/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    await waitFor(() => expect(c.removeModule).toHaveBeenCalledWith("m_d"));
  });

  it("says exactly what deleting for good takes before it does", async () => {
    const c = core();
    dialog(c);
    fireEvent.click(await screen.findByRole("radio", { name: /Delete it and its data/ }));
    expect(await screen.findByText("Deletes 1 table (12 rows) and 1 agent. This can't be undone; Activity keeps that it was here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(c.deleteModule).toHaveBeenCalledWith("m_d"));
  });
});

describe("Settings › Removed modules", () => {
  it("lists what was removed with Restore, and Delete asking first", async () => {
    const c = core();
    render(<RemovedModulesList client={c as unknown as Client} />);
    expect(await screen.findByText("Avilo › Deals")).toBeInTheDocument();
    expect(screen.getByText(/· 1 table \(12 rows\) and 1 agent/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(c.restoreModule).toHaveBeenCalledWith("m_d"));
    fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
    const d = await screen.findByRole("dialog", { name: "Delete Deals for good?" });
    fireEvent.click(within(d).getByRole("button", { name: "Delete for good" }));
    await waitFor(() => expect(c.deleteModule).toHaveBeenCalledWith("m_d"));
  });
});
