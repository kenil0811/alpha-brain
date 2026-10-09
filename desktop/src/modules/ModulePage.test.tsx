import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, ModuleDetail, TableDesc } from "../core/client";
import { forgetPreferences } from "../core/preferences";
import { TooltipProvider } from "../ui";
import { ModulePage } from "./ModulePage";

const detail = { id: "m_1", name: "Advisory", goal: "help clients", tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "", activity: [], note: null, goals: [], automations: [], sources: [] } as unknown as ModuleDetail;
const deals = { name: "deals", title: "Deals", module: "m_1", title_field: "title", fields: [{ name: "title", kind: "text" }, { name: "price", kind: "number" }], records: 1 } as unknown as TableDesc;
const clients = { name: "clients", title: "Clients", module: "m_1", title_field: "name", fields: [{ name: "name", kind: "text" }], records: 0 } as unknown as TableDesc;

beforeEach(() => {
  forgetPreferences();
  localStorage.clear();
});

function fakeClient(d: ModuleDetail, extra: Record<string, unknown> = {}) {
  return {
    module: () => Promise.resolve(d),
    moduleSummary: () => Promise.resolve({ tables: [{ name: "deals", title: "Deals", rows: 1, added_this_week: 1, amounts: [{ field: "price", label: "Price", unit: null, how: "total", today: 300, this_week: 300 }] }], goals: [], next_run: null, automations: 0 }),
    modulePage: () => Promise.resolve({ name: "Advisory", scope: "module:Advisory", page: null }),
    table: (name: string) => Promise.resolve({ table: name === "deals" ? deals : clients, records: name === "deals" ? [{ id: "r1", revision: 1, values: { title: "Bakery", price: 300 }, created_at: "2026-10-01T08:00:00+00:00", updated_at: "2026-10-01T08:00:00+00:00", provenance: {} }] : [], files: {}, lists: [], relations: {} }),
    preference: (key: string) => Promise.resolve({ key, value: null }),
    setPreference: vi.fn(),
    ...extra,
  } as unknown as Client;
}

describe("adding files to a module", () => {
  it("has a button that opens the Mac's picker and sends what was chosen the way a drop does", async () => {
    const addFiles = vi.fn(() => Promise.resolve({ documents: [{ id: "d_1", title: "RestoPros P&L.xlsx" }], turn: null }));
    const client = fakeClient(detail, { addFiles });
    render(
      <TooltipProvider>
        <ModulePage client={client} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    // no collection yet: it lands on Files
    expect(await screen.findByRole("tab", { name: "Files", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Nothing is kept here yet")).toBeInTheDocument();
    const files = screen.getByRole("region", { name: "Files" });
    expect(within(files).getByText(/Drop files here or/)).toBeInTheDocument(); // an empty space to drop on
    expect(within(files).getByRole("button", { name: "Upload" })).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "RestoPros P&L.xlsx");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(addFiles).toHaveBeenCalledWith([file], { module: "m_1" }));
    await waitFor(() => expect(screen.getByText("Uploaded RestoPros P&L.xlsx. Alpha is reading it.")).toBeInTheDocument());
    // and the Files section lists what was added
    expect(within(screen.getByRole("region", { name: "Files" })).getByText("RestoPros P&L.xlsx")).toBeInTheDocument();
  });

  it("shows a CSV added in this visit as a grid that can be edited and downloaded; Save needs the core", async () => {
    const user = userEvent.setup();
    const addFiles = vi.fn(() => Promise.resolve({ documents: [{ id: "d_2", title: "leads.csv" }], turn: null }));
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(detail, { addFiles })} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByRole("region", { name: "Files" });
    const file = new File(["name,stage\nBakery,Lead\n"], "leads.csv", { type: "text/csv" });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    const cell = await screen.findByRole("textbox", { name: "Row 2, column 2" });
    expect(cell).toHaveValue("Lead");
    await user.clear(cell);
    await user.type(cell, "Won");
    expect(cell).toHaveValue("Won");
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("a module's page", () => {
  const two = { ...detail, tables: [deals, clients], goals: [{ id: "g1", text: "Close three deals", state: "open", module: "m_1", since: "" }] } as unknown as ModuleDetail;

  it("lands on the first collection's data, with a header switch of collections, and no Summary", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Bakery")).toBeInTheDocument(); // data first
    const switcher = screen.getByRole("tablist", { name: "Sections" });
    expect(within(switcher).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Deals", "Clients", "Files", "Intelligence", "Governance"]);
    expect(screen.queryByRole("tab", { name: "Summary" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
    // the numbers sit above the table, folded until asked for, each with what it is based on
    await user.click(screen.getByRole("button", { name: "Show the numbers" }));
    expect(await screen.findByText("1 added this week")).toBeInTheDocument();
    expect(screen.queryByText("At a glance")).toBeNull();
    await user.click(within(switcher).getByRole("tab", { name: "Clients" }));
    expect(await screen.findByText("No records yet.")).toBeInTheDocument();
  });

  it("shows one section at a time: Files, Intelligence and Governance are tabs, and the page remembers the last", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    // nothing stacked below the table
    for (const n of ["Files", "Intelligence", "Governance"]) expect(screen.queryByRole("region", { name: n })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Files" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Files" })).getByText(/Drop files here/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Intelligence" }));
    const intelligence = screen.getByRole("region", { name: "Intelligence" });
    expect(screen.queryByRole("region", { name: "Files" })).toBeNull();
    // Intelligence is in tabs; the goals are one of them
    await user.click(within(intelligence).getByRole("tab", { name: "Goals · 1" }));
    expect(within(intelligence).getByText("Close three deals")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Governance" }));
    expect(within(screen.getByRole("region", { name: "Governance" })).getByRole("button", { name: "Move Advisory" })).toBeInTheDocument();
    unmount();
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("region", { name: "Governance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Governance", selected: true })).toBeInTheDocument();
  });

  it("Governance keeps Always and Never rules per module: Enter adds, a click edits, × deletes", async () => {
    const user = userEvent.setup();
    const setPreference = vi.fn(async (key: string, value: unknown) => ({ key, value }));
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two, { setPreference })} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("tab", { name: "Governance" }));
    const never = screen.getByRole("group", { name: "Never" });
    await user.type(within(never).getByRole("textbox", { name: "Add a rule: never" }), "Email a client{Enter}");
    await waitFor(() => expect(setPreference).toHaveBeenLastCalledWith("governance_rules", { m_1: { always: [], never: ["Email a client"] } }));
    await user.click(within(never).getByRole("button", { name: "Email a client" }));
    const edit = within(never).getByRole("textbox", { name: "Edit rule: Email a client" });
    await user.clear(edit);
    await user.type(edit, "Email anyone{Enter}");
    await waitFor(() => expect(setPreference).toHaveBeenLastCalledWith("governance_rules", { m_1: { always: [], never: ["Email anyone"] } }));
    await user.click(within(never).getByRole("button", { name: "Delete rule: Email anyone" }));
    await waitFor(() => expect(setPreference).toHaveBeenLastCalledWith("governance_rules", { m_1: { always: [], never: [] } }));
    expect(screen.getByRole("group", { name: "Always" })).toBeInTheDocument();
  });

  it("a module with one collection still has the switch, the collection's tab first, and its name in the breadcrumb", async () => {
    const one = { ...detail, tables: [deals] } as unknown as ModuleDetail;
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(one)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    expect(screen.getByRole("tab", { name: "Deals", selected: true })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Advisory")).toBeInTheDocument();
  });

  it("a nested module shows where it sits in the header, and its children with the note", async () => {
    const nested = { ...two, name: "Deals desk", path: ["Avilo", "Deals desk"], parent: "m_0", inside: [{ id: "m_2", name: "Leads", goal: null, last_text: null, tables: [], children: [] }] } as unknown as ModuleDetail;
    const onGo = vi.fn();
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(nested)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={onGo} modules={[{ id: "m_0", name: "Avilo", parent: null, tables: [], records: 0, goal: null, last_at: null, last_text: null, threads: [], created_at: "" }, { id: "m_1", name: "Deals desk", parent: "m_0", path: ["Avilo", "Deals desk"], tables: [], records: 0, goal: null, last_at: null, last_text: null, threads: [], created_at: "" }]} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "Avilo" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m_0" });
    await user.click(screen.getByRole("tab", { name: "Intelligence" }));
    await user.click(screen.getByRole("tab", { name: "Inside · 1" }));
    expect(screen.getByLabelText("What you ask here reaches them all.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Intelligence" })).getByText("Leads")).toBeInTheDocument();
  });
});
