import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoreError, type Client, type ModuleCard } from "../core/client";
import { iconFromName } from "./moduleIcons";
import { Rail } from "./Rail";
import { dropZone, isInside, siblingsOf, treeOf, withPlace } from "./sidebarOrder";

const card = (id: string, name: string, parent: string | null = null): ModuleCard => ({ id, name, parent, path: [name], children: [], goal: null, tables: [], records: 0, last_at: null, last_text: null, created_at: "" });

/** A core that keeps preferences and moves modules, as the real one does. */
function fakeCore(kept: Record<string, unknown> = {}) {
  const prefs: Record<string, unknown> = { ...kept };
  const client = {
    preference: vi.fn(async (key: string) => {
      if (!(key in prefs)) throw new Error("Not kept");
      return { key, value: prefs[key] };
    }),
    setPreference: vi.fn(async (key: string, value: unknown) => {
      prefs[key] = value;
      return { key, value };
    }),
    moveModule: vi.fn(async (ref: string, parent: string | null) => ({ ...card(ref, ref), parent })),
  };
  return { client: client as unknown as Client, calls: client, prefs };
}

function rail(client: Client, modules: ModuleCard[], extra: { onChanged?: () => void; onGo?: () => void } = {}) {
  return render(<Rail client={client} surface={{ kind: "home" }} modules={modules} needs={0} runtime="connected" onGo={extra.onGo ?? vi.fn()} onNew={vi.fn()} onChanged={extra.onChanged} collapsed={false} onToggleCollapsed={vi.fn()} />);
}
const names = () => Array.from(document.querySelectorAll("[data-module]")).map((b) => b.getAttribute("aria-label"));

describe("a module's icon from its name", () => {
  it("is picked from the first word that suggests one, else the table", () => {
    expect(iconFromName("Job Search")).toBe("briefcase");
    expect(iconFromName("Deal Tracker")).toBe("briefcase");
    expect(iconFromName("Nutrition")).toBe("food");
    expect(iconFromName("Network")).toBe("people");
    expect(iconFromName("Notes")).toBe("notes");
    expect(iconFromName("Car Wash Site Scorecard — Austin")).toBe("car");
    expect(iconFromName("Trips")).toBe("plane");
    expect(iconFromName("Avilo")).toBeNull();
  });
});

describe("the sidebar's order", () => {
  const mods = [card("a", "Alpha"), card("b", "Beta"), card("c", "Gamma"), card("d", "Delta", "b")];
  it("follows the person's order, then the rest by name; hidden modules go with what is inside", () => {
    expect(siblingsOf(mods, ["c", "a"], null).map((m) => m.id)).toEqual(["c", "a", "b"]);
    expect(treeOf(mods, [], ["b"]).map((b) => b.module.id)).toEqual(["a", "c"]);
    expect(treeOf(mods, ["d"]).find((b) => b.module.id === "b")?.inside.map((b) => b.module.id)).toEqual(["d"]);
  });
  it("places a module before or after another, or at the end", () => {
    expect(withPlace([], ["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(withPlace(["x"], ["a", "b", "c"], "a", "b", true)).toEqual(["x", "b", "a", "c"]);
    expect(withPlace([], ["a", "b"], "d", null)).toEqual(["a", "b", "d"]);
  });
  it("never lets a module into itself, and reads a drop by where on the row it lands", () => {
    expect(isInside(mods, "d", "b")).toBe(true);
    expect(isInside(mods, "a", "b")).toBe(false);
    expect([dropZone(2, 32), dropZone(16, 32), dropZone(30, 32)]).toEqual(["before", "inside", "after"]);
  });
});

describe("the sidebar's own arrangement", () => {
  it("shows the kept order and the icons, and keeps a reorder from the keyboard", async () => {
    const { client, calls } = fakeCore({ sidebar_order: ["m_n", "m_j"] });
    rail(client, [card("m_j", "Job Search"), card("m_n", "Nutrition"), card("m_a", "Avilo")]);
    await waitFor(() => expect(names()).toEqual(["Nutrition", "Job Search", "Avilo"]));
    fireEvent.keyDown(screen.getByRole("button", { name: "Avilo" }), { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(names()).toEqual(["Nutrition", "Avilo", "Job Search"]));
    expect(calls.setPreference).toHaveBeenCalledWith("sidebar_order", ["m_n", "m_a", "m_j"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Avilo" }));
  });

  it("moves a module inside the one above with Alt+→, by the core's move", async () => {
    const onChanged = vi.fn();
    const { client, calls } = fakeCore();
    rail(client, [card("m_a", "Avilo"), card("m_d", "Deals")], { onChanged });
    fireEvent.keyDown(screen.getByRole("button", { name: "Deals" }), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(calls.moveModule).toHaveBeenCalledWith("m_d", "m_a"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("drops a dragged module inside another", async () => {
    const { client, calls } = fakeCore();
    rail(client, [card("m_a", "Avilo"), card("m_d", "Deals")]);
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(screen.getByRole("button", { name: "Deals" }), { dataTransfer });
    const target = screen.getByRole("button", { name: "Avilo" }).parentElement!;
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer, clientY: 0 }); // a row of no height in a test: its middle
    expect(target).toHaveClass("navrow--drop-inside");
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(calls.moveModule).toHaveBeenCalledWith("m_d", "m_a"));
  });

  it("opens a module's menu on a right-click: hide it, then show it again", async () => {
    const { client, calls } = fakeCore();
    rail(client, [card("m_j", "Job Search"), card("m_n", "Nutrition")]);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Nutrition" }), { clientX: 40, clientY: 200 });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent?.trim())).toEqual(["Open", "Rename…", "Change icon", "Move to", "Hide from the sidebar", "Remove…"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Hide from the sidebar" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Nutrition" })).toBeNull());
    expect(calls.setPreference).toHaveBeenCalledWith("sidebar_hidden", ["m_n"]);
    fireEvent.click(screen.getByRole("button", { name: "Hidden · 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show in the sidebar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Nutrition" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^Hidden/ })).toBeNull();
  });

  it("changes a module's icon and moves it from the menu", async () => {
    const onChanged = vi.fn();
    const { client, calls } = fakeCore();
    rail(client, [card("m_j", "Job Search"), card("m_n", "Nutrition")], { onChanged });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Nutrition" }));
    const icon = await screen.findByRole("menuitem", { name: "Change icon" });
    act(() => icon.focus());
    fireEvent.keyDown(icon, { key: "ArrowRight" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Money" }));
    await waitFor(() => expect(calls.setPreference).toHaveBeenCalledWith("module_icons", { m_n: "wallet" }));
    fireEvent.contextMenu(screen.getByRole("button", { name: "Nutrition" }));
    const move = await screen.findByRole("menuitem", { name: "Move to" });
    act(() => move.focus());
    fireEvent.keyDown(move, { key: "ArrowRight" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Inside Job Search" }));
    await waitFor(() => expect(calls.moveModule).toHaveBeenCalledWith("m_n", "m_j"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("renames the workspace on a double-click, and says Alpha when it has no name", async () => {
    const { client, calls } = fakeCore();
    rail(client, []);
    fireEvent.doubleClick(screen.getByText("Alpha"));
    const box = screen.getByRole("textbox", { name: "The workspace's name" });
    fireEvent.change(box, { target: { value: "Kenil's brain" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Kenil's brain")).toBeInTheDocument());
    expect(calls.setPreference).toHaveBeenCalledWith("workspace_name", "Kenil's brain");
    fireEvent.doubleClick(screen.getByText("Kenil's brain"));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "The workspace's name" }), { key: "Escape" });
    expect(screen.getByText("Kenil's brain")).toBeInTheDocument();
  });

  it("says when a move couldn't be done", async () => {
    const { client, calls } = fakeCore();
    calls.moveModule.mockRejectedValueOnce(new CoreError("That module is gone.", 400));
    rail(client, [card("m_a", "Avilo"), card("m_d", "Deals")]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Deals" }), { key: "ArrowRight", altKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't move Deals: That module is gone.");
  });
});
