import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, ModuleDetail, TableDesc } from "../core/client";
import { forgetPreferences } from "../core/preferences";
import { AssistantProvider, TooltipProvider } from "../ui";
import { dedupeCrumbs } from "./crumbs";
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
    // no collection yet: one empty table, never an empty screen, and the sections below it
    const empty = await screen.findByRole("table", { name: "Advisory's first table" });
    expect(within(empty).getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(within(empty).getByRole("button", { name: "New" })).toBeDisabled();
    expect(screen.getByText(/Alpha fills this in as the project is built/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing is kept here yet")).toBeNull();
    expect(screen.getByRole("heading", { name: "Advisory" })).toBeInTheDocument();
    for (const n of ["Intelligence", "Governance"]) expect(screen.getByRole("region", { name: n })).toBeInTheDocument();
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

  it("lands on the first collection's data, with a header switch of collections only, and no Summary", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Bakery")).toBeInTheDocument(); // data first
    const switcher = screen.getByRole("tablist", { name: "Collections" });
    expect(within(switcher).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Deals", "Clients"]);
    expect(screen.queryByRole("tab", { name: "Summary" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Files" })).toBeNull();
    // the numbers sit above the table, folded until asked for, each with what it is based on
    await user.click(screen.getByRole("button", { name: "Show the numbers" }));
    expect(await screen.findByText("1 added this week")).toBeInTheDocument();
    expect(screen.queryByText("At a glance")).toBeNull();
    await user.click(within(switcher).getByRole("tab", { name: "Clients" }));
    expect(await screen.findByText("No records yet.")).toBeInTheDocument();
  });

  it("keeps Files, Intelligence and Governance below the data, in that order", async () => {
    const user = userEvent.setup();
    const withAgent = { ...two, automations: [{ id: "a1", title: "Chase late invoices", module: "m_1", thread: null, schedule: "", when: "every Monday", procedure: "", enabled: true, next_run_at: null, last_run_at: null, last_result: null, last_error: null }] } as unknown as ModuleDetail;
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(withAgent)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions.filter((n) => ["Files", "Intelligence", "Governance"].includes(n ?? ""))).toEqual(["Files", "Intelligence", "Governance"]);
    expect(within(screen.getByRole("region", { name: "Files" })).getByText(/Drop files here/)).toBeInTheDocument();
    const intelligence = screen.getByRole("region", { name: "Intelligence" });
    await user.click(within(intelligence).getByRole("tab", { name: "Goals · 1" }));
    expect(within(intelligence).getByText("Close three deals")).toBeInTheDocument();
    // agents and automations live in Intelligence, not Governance
    await user.click(within(intelligence).getByRole("tab", { name: "Agents and automations · 2" }));
    expect(within(intelligence).getByText("Chase late invoices")).toBeInTheDocument();
    expect(within(intelligence).getAllByRole("button")[0]).toHaveTextContent(/^Alpha/); // Alpha is the first agent
    const governance = screen.getByRole("region", { name: "Governance" });
    expect(within(governance).queryByText("Chase late invoices")).toBeNull();
    expect(within(governance).getByRole("button", { name: "Move Advisory" })).toBeInTheDocument();
  });

  it("remembers the last collection; a remembered section tab from before falls back to the first", async () => {
    localStorage.setItem("alpha.module.m_1.tab", "clients");
    const { unmount } = render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("tab", { name: "Clients", selected: true })).toBeInTheDocument();
    unmount();
    localStorage.setItem("alpha.module.m_1.tab", "@governance");
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Bakery")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Deals", selected: true })).toBeInTheDocument();
  });

  it("Governance keeps Allowed and Denied rules per module: the dashed button adds, a click edits, × deletes", async () => {
    const user = userEvent.setup();
    const setPreference = vi.fn(async (key: string, value: unknown) => ({ key, value }));
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two, { setPreference })} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    const governance = screen.getByRole("region", { name: "Governance" });
    expect(within(governance).getByRole("tab", { name: "Allowed 0", selected: true })).toBeInTheDocument();
    expect(within(governance).getByText("Nothing allowed.")).toBeInTheDocument();
    await user.click(within(governance).getByRole("tab", { name: "Denied 0" }));
    const denied = within(governance).getByRole("group", { name: "Denied" });
    expect(within(denied).getByText("Nothing denied.")).toBeInTheDocument();
    await user.click(within(denied).getByRole("button", { name: "Add denied action" }));
    await user.type(within(denied).getByRole("textbox", { name: "Add denied action" }), "Email a client{Enter}");
    await waitFor(() => expect(setPreference).toHaveBeenLastCalledWith("governance_rules", { m_1: { always: [], never: ["Email a client"] } }));
    await user.click(within(denied).getByRole("button", { name: "Email a client" }));
    const edit = within(denied).getByRole("textbox", { name: "Edit rule: Email a client" });
    await user.clear(edit);
    await user.type(edit, "Email anyone{Enter}");
    await waitFor(() => expect(setPreference).toHaveBeenLastCalledWith("governance_rules", { m_1: { always: [], never: ["Email anyone"] } }));
    await user.click(within(denied).getByRole("button", { name: "Delete rule: Email anyone" }));
    await waitFor(() => expect(setPreference).toHaveBeenLastCalledWith("governance_rules", { m_1: { always: [], never: [] } }));
    // the rest of Governance sits below the tabs
    expect(within(governance).getByText("What it keeps")).toBeInTheDocument();
  });

  it("Alpha opens its agent page; Add goal sends the request to Alpha with the project's name", async () => {
    const user = userEvent.setup();
    const say = vi.fn();
    const onGo = vi.fn();
    render(
      <TooltipProvider>
        <AssistantProvider say={say}>
          <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={onGo} />
        </AssistantProvider>
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    const intelligence = screen.getByRole("region", { name: "Intelligence" });
    await user.click(within(intelligence).getByRole("tab", { name: "Agents and automations · 1" }));
    await user.click(within(intelligence).getByRole("button", { name: /^Alpha/ }));
    expect(onGo).toHaveBeenCalledWith({ kind: "agent", id: "alpha" });
    await user.click(within(intelligence).getByRole("tab", { name: "Goals · 1" }));
    await user.click(within(intelligence).getByRole("button", { name: "Add goal" }));
    await user.type(within(intelligence).getByRole("textbox", { name: "Describe the goal you want" }), "Close five deals");
    await user.click(within(intelligence).getByRole("button", { name: "Send" }));
    expect(say).toHaveBeenCalledWith("In Advisory, add a goal: Close five deals");
    expect(within(intelligence).getByText("Sent to Alpha — it will ask you to approve.")).toBeInTheDocument();
  });

  it("a project with one collection has no switch: its name is the title", async () => {
    const one = { ...detail, tables: [deals] } as unknown as ModuleDetail;
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(one)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    expect(screen.queryByRole("tablist", { name: "Collections" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Advisory" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  it("never names one thing twice in a row: a project Deals inside Deals shows Deals once", async () => {
    const twin = { ...detail, name: "Deals", tables: [deals], path: ["Deals", "Deals"], parent: "m_0" } as unknown as ModuleDetail;
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(twin)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} modules={[{ id: "m_0", name: "Deals", parent: null, tables: [], records: 0, goal: null, last_at: null, last_text: null, threads: [], created_at: "" }, { id: "m_1", name: "Deals", parent: "m_0", tables: [], records: 0, goal: null, last_at: null, last_text: null, threads: [], created_at: "" }]} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    expect(document.querySelector(".pagehead")).toHaveTextContent(/^Deals$/);
    expect(dedupeCrumbs([{ label: "Avilo" }, { label: "Deals" }, { label: "deals " }, { label: "Bakery" }]).map((c) => c.label)).toEqual(["Avilo", "deals ", "Bakery"]);
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
    await user.click(screen.getByRole("tab", { name: "Sub-projects · 1" }));
    expect(screen.getByLabelText("What you ask here reaches them all.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Intelligence" })).getByText("Leads")).toBeInTheDocument();
  });
});
