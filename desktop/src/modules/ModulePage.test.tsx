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
    render(<ModulePage client={client} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Add files" });
    expect(button).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "RestoPros P&L.xlsx");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(addFiles).toHaveBeenCalledWith([file], { module: "m_1" }));
    await waitFor(() => expect(screen.getByText("Added RestoPros P&L.xlsx. Alpha is reading it into the collections.")).toBeInTheDocument());
    // and the Files section lists what was added
    expect(within(screen.getByRole("region", { name: "Files" })).getByText("RestoPros P&L.xlsx")).toBeInTheDocument();
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
    const switcher = screen.getByRole("tablist", { name: "Collections" });
    expect(within(switcher).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Deals", "Clients"]);
    expect(screen.queryByRole("tab", { name: "Summary" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
    // the numbers sit above the table, each with what it is based on
    expect(await screen.findByText("1 added this week; deals in all")).toBeInTheDocument();
    await user.click(within(switcher).getByRole("tab", { name: "Clients" }));
    expect(await screen.findByText("No records yet.")).toBeInTheDocument();
  });

  it("keeps Files, then Intelligence, then Governance below the data", async () => {
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(two)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    const sections = ["Files", "Intelligence", "Governance"].map((n) => screen.getByRole("region", { name: n }));
    const table = screen.getByRole("table");
    let previous: HTMLElement = table;
    for (const s of sections) {
      expect(previous.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      previous = s;
    }
    expect(within(sections[1]).getByText("Close three deals")).toBeInTheDocument(); // goals moved here
    expect(within(sections[2]).getByRole("button", { name: "Move Advisory" })).toBeInTheDocument();
    expect(within(sections[0]).getByText(/No files are attached yet/)).toBeInTheDocument();
  });

  it("a module with one collection shows its name as the title, not a switch", async () => {
    const one = { ...detail, tables: [deals] } as unknown as ModuleDetail;
    render(
      <TooltipProvider>
        <ModulePage client={fakeClient(one)} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    expect(screen.queryByRole("tablist", { name: "Collections" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Advisory" })).toBeInTheDocument();
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
    expect(screen.getByText(/what you ask here reaches them all/)).toBeInTheDocument();
  });
});
