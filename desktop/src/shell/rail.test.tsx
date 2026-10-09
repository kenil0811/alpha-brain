import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toRow, type Client, type ModuleCard } from "../core/client";
import { PREF, forgetPreferences } from "../core/preferences";
import { Rail, knownSurface, sameSurface, treeOf } from "./Rail";

const card = (id: string, name: string, parent: string | null = null): ModuleCard => ({ id, name, parent, path: [], children: [], goal: null, tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "" });

/** A core that keeps preferences in a map and records the module moves asked of it. */
function fakeCore(stored: Record<string, unknown> = {}) {
  const setPreference = vi.fn(async (key: string, value: unknown) => {
    stored[key] = value;
    return { key, value };
  });
  const moveModule = vi.fn(async (id: string, parent: string | null) => ({ ...card(id, id), parent }));
  const createModule = vi.fn(async (name: string, _goal: string | null, parent: string | null) => ({ ...card("m_new", name), parent }));
  const client = { preference: vi.fn(async (key: string) => ({ key, value: stored[key] ?? null })), setPreference, moveModule, createModule } as unknown as Client;
  return { client, stored, setPreference, moveModule, createModule };
}

function setup(modules: ModuleCard[], over: { stored?: Record<string, unknown>; collapsed?: boolean; needs?: number } = {}) {
  const core = fakeCore(over.stored);
  const props = { onGo: vi.fn(), onNew: vi.fn(), onChanged: vi.fn(), onToggleCollapsed: vi.fn() };
  const view = render(<Rail client={core.client} surface={{ kind: "home" }} modules={modules} needs={over.needs ?? 0} collapsed={over.collapsed ?? false} {...props} />);
  const labels = () => [...view.container.querySelectorAll<HTMLElement>(".navbtn")].map((b) => b.getAttribute("aria-label"));
  return { ...core, ...props, ...view, labels };
}

beforeEach(forgetPreferences);

describe("the sidebar's places", () => {
  it("marks the right item current", () => {
    expect(sameSurface({ kind: "intelligence", tab: "connections" }, { kind: "intelligence" })).toBe(true);
    expect(sameSurface({ kind: "agent", id: "ag_1" }, { kind: "intelligence" })).toBe(true);
    expect(knownSurface({ kind: "people" })).toEqual({ kind: "people" });
    expect(knownSurface({ kind: "entity", id: "e_1" })).toEqual({ kind: "entity", id: "e_1" });
    expect(knownSurface({ kind: "agent", id: "ag_1" })).toEqual({ kind: "agent", id: "ag_1" });
    expect(sameSurface({ kind: "entity", id: "e_1" }, { kind: "people" })).toBe(true);
    // a record's page sits inside its module in the sidebar, and a remembered one is kept only whole
    const record = { kind: "record", module: "m_1", table: "deals", id: "r_1" } as const;
    expect(sameSurface(record, { kind: "module", id: "m_1" })).toBe(true);
    expect(sameSurface(record, { kind: "module", id: "m_2" })).toBe(false);
    expect(knownSurface(record)).toEqual(record);
    expect(knownSurface({ kind: "record", module: "m_1" })).toEqual({ kind: "home" });
    expect(knownSurface({ kind: "nowhere" })).toEqual({ kind: "home" });
    expect(knownSurface({ kind: "settings" })).toEqual({ kind: "settings" });
    expect(sameSurface({ kind: "module", id: "m_1" }, { kind: "module", id: "m_2" })).toBe(false);
  });

  it("turns Intelligence's old Activity tab into the bell, and its old Map tab into Second Brain", () => {
    expect(knownSurface({ kind: "activity" })).toEqual({ kind: "activity" });
    expect(knownSurface({ kind: "intelligence", tab: "activity" })).toEqual({ kind: "activity" });
    expect(knownSurface({ kind: "intelligence", tab: "map" })).toEqual({ kind: "intelligence", tab: "second-brain" });
  });
});

describe("the sidebar's order", () => {
  it("is Home, Network, the modules, New, then Intelligence and Settings last; nothing else", () => {
    const { labels, container } = setup([card("m_j", "Job"), card("m_f", "Food")], { needs: 2 });
    expect(labels()).toEqual(["Home", "Network", "Food", "Job", "New", "Intelligence", "Settings"]);
    expect(screen.getByRole("button", { name: "Home" })).toHaveTextContent("2");
    // New is the last item of the module list, which is the only part that scrolls
    const scroll = container.querySelector(".rail__scroll")!;
    expect(scroll.lastElementChild).toBe(screen.getByRole("button", { name: "New" }));
    expect(scroll.contains(screen.getByRole("button", { name: "Settings" }))).toBe(false);
    // Activity is the bell on the top row, not a place in the list
    expect(container.querySelector(".rail__top")!.contains(screen.getByRole("button", { name: "Activity" }))).toBe(true);
    expect(screen.queryByText("Your modules")).toBeNull();
    expect(screen.queryByText(/Alpha is running|Starting|Core not/)).toBeNull();
    expect(screen.queryByRole("button", { name: "About you" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
  });

  it("puts the workspace button on the top row, named for the workspace", async () => {
    setup([], { stored: { [PREF.workspaceName]: "Home base" } });
    expect(await screen.findByRole("button", { name: "Home base" })).toBeInTheDocument();
  });

  it("follows the person's own order, ignores ids that are gone, and appends new modules by name", async () => {
    const { labels } = setup([card("m_a", "Alpha plans"), card("m_j", "Job"), card("m_f", "Food"), card("m_n", "Notes")], { stored: { [PREF.moduleOrder]: ["m_j", "m_gone", "m_f"] } });
    await waitFor(() => expect(labels()).toEqual(["Home", "Network", "Job", "Food", "Alpha plans", "Notes", "New", "Intelligence", "Settings"]));
  });

  it("draws Network like a module row, whose menu is just Open", async () => {
    const user = userEvent.setup();
    const { onGo } = setup([]);
    await user.click(screen.getByRole("button", { name: "More for Network" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Open"]);
    await user.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "people" });
  });

  it("folds each parent behind a chevron and remembers it", () => {
    setup([card("m_j", "Job"), card("m_s", "Search", "m_j")]);
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fold Job" }));
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unfold Job" }));
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});

describe("the workspace button", () => {
  it("opens a menu whose Manage Workspace and Sign out are disabled, each with its reason", async () => {
    const user = userEvent.setup();
    setup([]);
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    for (const name of ["Manage Workspace", "Sign out"]) expect(await screen.findByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
    await user.hover(screen.getByRole("menuitem", { name: "Sign out" }));
    expect((await screen.findAllByText(/no account to sign out of/)).length).toBeGreaterThan(0);
  });

  it("holds the sidebar's fold, and View options so hidden modules can always come back", async () => {
    const user = userEvent.setup();
    const { onToggleCollapsed } = setup([]);
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    await user.click(await screen.findByRole("menuitem", { name: "Fold the sidebar" }));
    expect(onToggleCollapsed).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    await user.click(await screen.findByRole("menuitem", { name: "View options" }));
    expect(await screen.findByText("Nothing is hidden.")).toBeInTheDocument();
  });
});

describe("editing the workspace in place", () => {
  it("renames it on a double-click on the name: Enter saves, Escape cancels", async () => {
    const user = userEvent.setup();
    const { setPreference } = setup([]);
    await user.dblClick(screen.getByText("Alpha"));
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await user.clear(input);
    await user.type(input, "Studio{Enter}");
    expect(setPreference).toHaveBeenCalledWith(PREF.workspaceName, "Studio");
    expect(await screen.findByRole("button", { name: "Studio" })).toBeInTheDocument();
    await user.dblClick(screen.getByText("Studio"));
    await user.type(screen.getByRole("textbox", { name: "Workspace name" }), "x{Escape}");
    expect(setPreference).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Studio" })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).toBeNull(); // the double-click did not also open the menu
  });

  it("changes the logo on a double-click on the tile: a letter or emoji, then Remove", async () => {
    const user = userEvent.setup();
    const { setPreference, container } = setup([]);
    await user.dblClick(container.querySelector(".wsbtn__tile")!);
    await user.type(await screen.findByRole("textbox", { name: "Letter or emoji" }), "🚀{Enter}");
    expect(setPreference).toHaveBeenCalledWith(PREF.workspaceLogo, "🚀");
    await waitFor(() => expect(container.querySelector(".wsbtn__tile")).toHaveTextContent("🚀"));
    await user.dblClick(container.querySelector(".wsbtn__tile")!);
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(setPreference).toHaveBeenLastCalledWith(PREF.workspaceLogo, null);
  });
});

describe("the bell", () => {
  it("opens Activity beside the workspace name, and opens when asked from elsewhere", async () => {
    const core = fakeCore();
    const activity = vi.fn(async () => []);
    Object.assign(core.client, { activity });
    const props = { onGo: vi.fn(), onNew: vi.fn(), onChanged: vi.fn(), onToggleCollapsed: vi.fn() };
    const { rerender } = render(<Rail client={core.client} surface={{ kind: "home" }} modules={[]} needs={0} collapsed={false} {...props} />);
    expect(screen.queryByRole("textbox", { name: "Search activity" })).toBeNull();
    rerender(<Rail client={core.client} surface={{ kind: "home" }} modules={[]} needs={0} collapsed={false} {...props} openActivity={1} />);
    expect(await screen.findByRole("textbox", { name: "Search activity" })).toBeInTheDocument();
    await waitFor(() => expect(activity).toHaveBeenCalled());
  });
});

describe("a module's menu", () => {
  it("lists Open, Rename, Change icon, Move…, a new module above it, Hide, Delete and View options", async () => {
    setup([card("m_f", "Food")]);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Food" }));
    await screen.findByRole("menu");
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Open", "Rename", "Change icon", "Move…", "A new module above it…", "Hide", "Delete", "View options"]);
  });

  it("shows Rename and Delete disabled, and says why on hover", async () => {
    const user = userEvent.setup();
    setup([card("m_f", "Food")]);
    await user.click(screen.getByRole("button", { name: "More for Food" }));
    const rename = await screen.findByRole("menuitem", { name: "Rename" });
    const del = screen.getByRole("menuitem", { name: "Delete" });
    expect(rename).toHaveAttribute("aria-disabled", "true");
    expect(del).toHaveAttribute("aria-disabled", "true");
    await user.hover(rename);
    expect((await screen.findAllByText(/can do yet/)).length).toBeGreaterThan(0);
    await user.hover(del);
    expect((await screen.findAllByText(/delete a module from this window yet/)).length).toBeGreaterThan(0);
  });

  it("hides a module (kept in preferences), and View options brings it back", async () => {
    const user = userEvent.setup();
    const { setPreference, labels } = setup([card("m_f", "Food"), card("m_j", "Job")]);
    await user.click(screen.getByRole("button", { name: "More for Food" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hide" }));
    expect(setPreference).toHaveBeenCalledWith(PREF.hiddenModules, ["m_f"]);
    await waitFor(() => expect(labels()).not.toContain("Food"));
    expect(screen.getByRole("status")).toHaveTextContent("Food hidden");

    await user.click(screen.getByRole("button", { name: "More for Job" }));
    await user.click(await screen.findByRole("menuitem", { name: "View options" }));
    const dialog = await screen.findByRole("dialog", { name: "View options" });
    expect(within(dialog).getByText("Food")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Show Food" }));
    expect(setPreference).toHaveBeenLastCalledWith(PREF.hiddenModules, []);
    await waitFor(() => expect(labels()).toContain("Food"));
    expect(within(dialog).getByText("Nothing is hidden.")).toBeInTheDocument();
  });

  it("changes a module's icon and keeps the choice in preferences", async () => {
    const user = userEvent.setup();
    const { setPreference } = setup([card("m_f", "Food")]);
    await user.click(screen.getByRole("button", { name: "More for Food" }));
    await user.click(await screen.findByRole("menuitem", { name: "Change icon" }));
    await user.click(await screen.findByRole("button", { name: "Fitness" }));
    expect(setPreference).toHaveBeenCalledWith(PREF.moduleIcons, { m_f: "dumbbell" });
  });

  it("moves a module inside another, or to the top level, with the core's moveModule", async () => {
    const user = userEvent.setup();
    const { moveModule, onChanged } = setup([card("m_j", "Job"), card("m_s", "Search", "m_j"), card("m_f", "Food")]);
    await user.click(screen.getByRole("button", { name: "More for Food" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move Food" });
    await user.click(within(dialog).getByRole("combobox", { name: "Move to" }));
    await user.click(await screen.findByRole("option", { name: "Job" }));
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(moveModule).toHaveBeenCalledWith("m_f", "m_j"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("makes a new module above one: asks for a name in a dialog, then createModule and moveModule", async () => {
    const user = userEvent.setup();
    const { createModule, moveModule } = setup([card("m_s", "Search", "m_j"), card("m_j", "Job")]);
    await user.click(screen.getByRole("button", { name: "More for Search" }));
    await user.click(await screen.findByRole("menuitem", { name: "A new module above it…" }));
    const dialog = await screen.findByRole("dialog", { name: "A new module above Search" });
    expect(within(dialog).getByRole("button", { name: "Make it" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "The new module's name" }), "Avilo");
    await user.click(within(dialog).getByRole("button", { name: "Make it" }));
    await waitFor(() => expect(moveModule).toHaveBeenCalledWith("m_s", "m_new"));
    expect(createModule).toHaveBeenCalledWith("Avilo", null, "m_j"); // made where Search sits now
  });
});

describe("reordering", () => {
  it("Alt+↓ on a focused module moves it below the next and saves the order", async () => {
    const user = userEvent.setup();
    const { setPreference, labels } = setup([card("m_f", "Food"), card("m_j", "Job")]);
    screen.getByRole("button", { name: "Food" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith(PREF.moduleOrder, ["m_j", "m_f"]));
    await waitFor(() => expect(labels().slice(2, 4)).toEqual(["Job", "Food"]));
    expect(screen.getByRole("status")).toHaveTextContent("Moved Food below Job.");
    expect(screen.getByRole("button", { name: "Food" })).toHaveFocus();
  });

  it("Alt+→ moves a module inside the one above it, through moveModule", async () => {
    const user = userEvent.setup();
    const { moveModule, setPreference } = setup([card("m_f", "Food"), card("m_j", "Job")]);
    screen.getByRole("button", { name: "Job" }).focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => expect(moveModule).toHaveBeenCalledWith("m_j", "m_f"));
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith(PREF.moduleOrder, ["m_j"]));
    expect(screen.getByRole("status")).toHaveTextContent("Moved Job inside Food.");
  });

  /** A drop lands by where on the row it is: the middle moves inside, the top quarter above. */
  function drag(from: string, onto: string, y: number) {
    const source = screen.getByRole("button", { name: from }).closest(".navrow")!;
    const target = screen.getByRole("button", { name: onto }).closest(".navrow")!;
    target.getBoundingClientRect = () => ({ top: 0, height: 40, bottom: 40, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    // jsdom has no DragEvent, so the pointer's height is put on the event by hand
    const at = (make: typeof createEvent.dragOver) => {
      const event = make(target, { dataTransfer });
      Object.defineProperty(event, "clientY", { value: y });
      fireEvent(target, event);
    };
    fireEvent.dragStart(source, { dataTransfer });
    at(createEvent.dragOver);
    at(createEvent.drop);
  }

  it("dropping on the middle of another module moves it inside, announced politely", async () => {
    const { moveModule } = setup([card("m_f", "Food"), card("m_j", "Job")]);
    drag("Food", "Job", 20);
    await waitFor(() => expect(moveModule).toHaveBeenCalledWith("m_f", "m_j"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Moved Food inside Job."));
  });

  it("dropping on the top of another module reorders without a move, and saves the order", async () => {
    const { moveModule, setPreference } = setup([card("m_f", "Food"), card("m_j", "Job")]);
    drag("Job", "Food", 2);
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith(PREF.moduleOrder, ["m_j", "m_f"]));
    expect(moveModule).not.toHaveBeenCalled();
  });

  it("a module cannot be dropped into what it holds", () => {
    const { moveModule } = setup([card("m_j", "Job"), card("m_s", "Search", "m_j")]);
    drag("Job", "Search", 20);
    expect(moveModule).not.toHaveBeenCalled();
  });
});

describe("the folded sidebar", () => {
  it("keeps every item, each with its label (drawn tiny under the icon by CSS)", () => {
    const { labels, container } = setup([card("m_f", "Food")], { collapsed: true });
    expect(labels()).toEqual(["Home", "Network", "Food", "New", "Intelligence", "Settings"]);
    expect(container.querySelector(".rail--collapsed")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Unfold the sidebar" })).toBeInTheDocument();
  });
});

describe("records from the core", () => {
  it("split values from the system fields", () => {
    const row = toRow({ id: "r_1", revision: 2, created_at: "a", updated_at: "b", _provenance: { by: "alpha", estimated: true }, food: "Eggs", kcal: 155 });
    expect(row.values).toEqual({ food: "Eggs", kcal: 155 });
    expect(row.provenance.estimated).toBe(true);
  });
});

describe("modules as a tree", () => {
  it("nests each module under its parent, any depth, and shows an orphan at the top", () => {
    const tree = treeOf([card("m_s", "Search", "m_j"), card("m_j", "Job"), card("m_r", "Resume", "m_j"), card("m_d", "Drafts", "m_r"), card("m_x", "Lost", "m_gone")]);
    expect(tree.map((b) => b.module.name)).toEqual(["Job", "Lost"]);
    expect(tree[0].inside.map((b) => b.module.name)).toEqual(["Resume", "Search"]);
    expect(tree[0].inside[0].inside[0].module.name).toBe("Drafts");
  });

  it("follows the person's order inside each parent, and takes hidden modules out with what they hold", () => {
    const mods = [card("m_s", "Search", "m_j"), card("m_j", "Job"), card("m_r", "Resume", "m_j"), card("m_f", "Food")];
    const tree = treeOf(mods, ["m_r", "m_s", "m_f"], []);
    expect(tree.map((b) => b.module.name)).toEqual(["Food", "Job"]);
    expect(tree[1].inside.map((b) => b.module.name)).toEqual(["Resume", "Search"]);
    expect(treeOf(mods, [], ["m_j"]).map((b) => b.module.name)).toEqual(["Food"]);
  });
});
