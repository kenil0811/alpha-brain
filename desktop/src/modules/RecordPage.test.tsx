import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, RecordRow, TableDesc } from "../core/client";
import { TooltipProvider } from "../ui";
import { RecordPage } from "./RecordPage";

const sites: TableDesc = { name: "car_wash_sites", title: "car_wash_sites", module: "m1", title_field: "address", records: 1, fields: [{ name: "address", kind: "text" }, { name: "households_3mi", kind: "number" }, { name: "traffic_aadt", kind: "number" }] };
const site: RecordRow = {
  id: "r1", revision: 4, created_at: "2026-10-11T17:59:00+00:00", updated_at: "2026-10-11T19:29:00+00:00",
  values: { address: "1600 S Lamar Blvd", households_3mi: null, traffic_aadt: 37900 },
  provenance: { by: "alpha", fields: { traffic_aadt: { source: "Travis County GIS", fetched_at: "2026-10-11T19:00:00+00:00", part: "traffic" }, households_3mi: { problem: "Census API key required", part: "households" } } },
  seen_at: null, gone_at: null, entity: null,
};
function mount(table: TableDesc = sites) {
  const client = {
    record: vi.fn(async () => ({ table, record: site, relations: {}, note: null as null | { id: string; scope: string; title: string; body: string; updated_at: string } })),
    recordHistory: vi.fn(async (_t: string, _id: string, before?: number) =>
      before === undefined
        ? { changes: [
            { revision: 4, at: "2026-10-11T19:29:00+00:00", by: { by: "alpha", fields: { traffic_aadt: { part: "traffic" } } }, fields: [{ field: "traffic_aadt", before: 30403, after: 37900 }] },
            { revision: 3, at: "2026-10-11T18:00:00+00:00", by: { by: "person" }, fields: [{ field: "address", before: "1600 Lamar", after: "1600 S Lamar" }] },
          ], more: true, added: null }
        : { changes: [{ revision: 2, at: "2026-10-11T17:59:00+00:00", by: { by: "alpha", reader: "census_sites" }, fields: [{ field: "households_3mi", before: 1, after: null }] }], more: false, added: { at: "2026-10-11T17:59:00+00:00", by: { by: "alpha", reader: "census_sites" } } }),
    writeNote: vi.fn(async () => ({})),
    editRecord: vi.fn(async (_t: string, _id: string, values: Record<string, unknown>) => ({ ...site, revision: 5, values: { ...site.values, ...values } })),
    deleteRecord: vi.fn(async () => ({ removed: "r1" })),
    tasksAt: vi.fn(async (at: string) => ({ at, place: "Car wash › Sites › 1600 S Lamar Blvd", table: "alpha_tasks", tasks: [
      { id: "t1", revision: 1, title: "Ask the county for the traffic count", state: "Open", anchor: `${at}/traffic_aadt`, created_at: "2026-10-18T10:00:00+00:00", updated_at: "2026-10-18T10:00:00+00:00", _words: { anchor: "Car wash › Sites › 1600 S Lamar Blvd › Traffic aadt" } },
    ] })),
    addTask: vi.fn(async (task: { title: string; anchor?: string | null }) => ({ id: "t2", revision: 1, state: "Open", created_at: "", updated_at: "", ...task })),
  };
  const onGo = vi.fn();
  render(
    <TooltipProvider>
      <RecordPage client={client as unknown as Client} table={table.name} id="r1" version={0} onChanged={vi.fn()} onGo={onGo} />
    </TooltipProvider>,
  );
  return { client, onGo };
}

describe("a record's own page", () => {
  it("names its table on the way back, shows its title and dates, and where each value came from", async () => {
    const user = userEvent.setup();
    const { onGo } = mount();
    expect(await screen.findByRole("heading", { level: 1, name: "1600 S Lamar Blvd" })).toBeInTheDocument();
    expect(screen.getByText(/^Added .* · last changed /)).toBeInTheDocument();
    expect(screen.getByText(/from Travis County GIS/)).toBeInTheDocument();
    expect(screen.getByText(/not filled: Census API key required/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Car wash sites" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1", table: "car_wash_sites" });
  });

  it("edits a value in place with the record's revision, the title among them", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    await screen.findByRole("heading", { level: 1, name: "1600 S Lamar Blvd" });
    expect(screen.getByRole("rowheader", { name: "Address" })).toBeInTheDocument();
    await user.dblClick(screen.getByText("37,900"));
    const input = screen.getByRole("spinbutton", { name: "Traffic aadt" });
    await user.clear(input);
    await user.type(input, "38000{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("car_wash_sites", "r1", { traffic_aadt: 38000 }, 4));
  });

  it("asks before removing, then goes back to its table", async () => {
    const user = userEvent.setup();
    const { client, onGo } = mount();
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog", { name: "Remove 1600 S Lamar Blvd?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove it" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledWith("car_wash_sites", "r1", 4));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1", table: "car_wash_sites" });
  });

  it("a module's own read-only table offers no Remove and no part buttons", async () => {
    mount({ ...sites, readonly: true });
    expect(await screen.findByText("Built by the module · read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("group", { name: "What Alpha can do" })).toBeNull();
  });

  it("shows its history newest first, who and what changed, with Show older to the record's start", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const history = (await screen.findByRole("heading", { name: "History" })).closest(".section") as HTMLElement;
    expect(await within(history).findByText("Traffic aadt: 30,403 → 37,900")).toBeInTheDocument();
    expect(within(history).getByText("You")).toBeInTheDocument();
    expect(within(history).getByText("Address: 1600 Lamar → 1600 S Lamar")).toBeInTheDocument();
    await user.click(within(history).getByRole("button", { name: "Show older" }));
    expect(await within(history).findByText("Reader Census sites")).toBeInTheDocument();
    expect(client.recordHistory).toHaveBeenLastCalledWith("car_wash_sites", "r1", 3);
    expect(within(history).getByText("Added")).toBeInTheDocument();
    expect(within(history).queryByRole("button", { name: "Show older" })).toBeNull();
  });

  it("Undo puts back what a change replaced, only while the field still holds what it wrote", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const history = (await screen.findByRole("heading", { name: "History" })).closest(".section") as HTMLElement;
    await within(history).findByText("Traffic aadt: 30,403 → 37,900");
    const [latest, older] = within(history).getAllByRole("button", { name: "Undo" });
    expect(older).toBeDisabled(); // the address changed again since: undo the later change first
    expect(older).toHaveAttribute("title", "Changed again since; undo the later change first.");
    await user.click(latest);
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("car_wash_sites", "r1", { traffic_aadt: 30403 }, 4));
  });

  it("keeps the person's note: Write opens the box, Save writes it on the record", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const notes = (await screen.findByRole("heading", { name: "Notes" })).closest(".section") as HTMLElement;
    expect(within(notes).getByText("No notes yet.")).toBeInTheDocument();
    await user.click(within(notes).getByRole("button", { name: "Write" }));
    await user.type(within(notes).getByRole("textbox", { name: "Your note on this record" }), "Ask about the lease");
    await user.click(within(notes).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.writeNote).toHaveBeenCalledWith("record:car_wash_sites/r1", "Notes", "Ask about the lease"));
  });

  it("holds the tasks living on it and its fields, and adds one here (P1)", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    expect(await screen.findByText("Ask the county for the traffic count")).toBeInTheDocument();
    expect(screen.getByText("on Traffic aadt")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "A new task's title" }), "Visit the lot");
    await user.selectOptions(screen.getByRole("combobox", { name: "On which field" }), "households_3mi");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(client.addTask).toHaveBeenCalledWith({ title: "Visit the lot", anchor: "#/m/m1/car_wash_sites/r1/households_3mi" }));
  });
});

const tasksTable: TableDesc = { name: "alpha_tasks", title: "Tasks", module: null, title_field: "title", records: 1, world: true, fields: [{ name: "title", kind: "text" }, { name: "state", kind: "status", choices: ["Open", "Done"], done_choices: ["Done"] }, { name: "anchor", kind: "text", label: "Where it lives" }, { name: "suggested", kind: "bool" }] };
const task: RecordRow = {
  id: "t1", revision: 2, created_at: "2026-10-18T10:00:00+00:00", updated_at: "2026-10-18T10:00:00+00:00",
  values: { title: "Check the asking price", state: "Open", anchor: "#/m/m1/deals/r1/price", suggested: true, by: "a_1" },
  provenance: { by: "a_1" }, seen_at: null, gone_at: null, entity: null,
  words: { anchor: "DealPilot › Deals › Midwest HVAC › Price", by: "Deal Tracker" },
};

describe("a task's own page (P1)", () => {
  let runs: unknown = { task: "t1", agent: null, runs: [] };
  function mountTask() {
    const client = {
      record: vi.fn(async () => ({ table: tasksTable, record: task, relations: {}, note: null })),
      recordHistory: vi.fn(async () => ({ changes: [], more: false, added: null })),
      taskAround: vi.fn(async () => ({
        task: "t1", where: [
          { kind: "module", words: "DealPilot", address: "#/m/m1" }, { kind: "table", words: "Deals", address: "#/m/m1/deals" },
          { kind: "record", words: "Midwest HVAC", address: "#/m/m1/deals/r1" }, { kind: "field", words: "Price", address: "#/m/m1/deals/r1/price" },
        ],
        place: { table: "deals", record: "r1", title: "Midwest HVAC", values: [{ field: "price", label: "Price", value: 900000, source: "brokers.example", estimated: false }] },
        parent: null, children: [], blocked_by: [], beside: [{ id: "t3", title: "Ask about the price drop", state: "Open" }], about: [], notes: "We buy bookkeeping firms.",
      })),
      keepTask: vi.fn(async () => ({ ...task, suggested: false })),
      dropTask: vi.fn(async () => ({})),
      addTask: vi.fn(async () => ({})),
      taskRuns: vi.fn(async () => runs),
      agents: vi.fn(async () => [{ id: "a_2", name: "Deal Reader", kind: "custom" }, { id: "a_w", name: "Watson", kind: "watson" }]),
      editRecord: vi.fn(async () => task),
      startTask: vi.fn(async () => ({ ...task.values, id: "t1" })),
      stopAgent: vi.fn(async () => ({})),
    };
    const onGo = vi.fn();
    render(
      <TooltipProvider>
        <RecordPage client={client as unknown as Client} table="alpha_tasks" id="t1" version={0} onChanged={vi.fn()} onGo={onGo} />
      </TooltipProvider>,
    );
    return { client, onGo };
  }

  it("says who suggested it and keeps it on Keep; where it lives opens the place; around it is shown", async () => {
    const user = userEvent.setup();
    const { client, onGo } = mountTask();
    expect(await screen.findByText(/Deal Tracker suggested this task/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(client.keepTask).toHaveBeenCalledWith("t1"));
    await user.click(screen.getByRole("button", { name: "Midwest HVAC" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "record", module: "m1", table: "deals", id: "r1" });
    expect(screen.getByText("Ask about the price drop")).toBeInTheDocument();
    expect(screen.getByText(/from brokers.example/)).toBeInTheDocument();
    expect(screen.getByText("We buy bookkeeping firms.")).toBeInTheDocument();
    // its place shows in words in its details, never as an address
    expect(screen.getAllByText("DealPilot › Deals › Midwest HVAC › Price").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "tasks" });
  });

  it("gives a task to an agent, and Start runs it; a run shows its steps (P2)", async () => {
    const user = userEvent.setup();
    runs = { task: "t1", agent: null, runs: [] };
    const { client } = mountTask();
    const give = await screen.findByRole("combobox", { name: "Give it to an agent" });
    expect(within(give).queryByText("Watson")).not.toBeInTheDocument(); // only the person's agents
    await user.selectOptions(give, "a_2");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("alpha_tasks", "t1", { owner: "a_2" }, 2));
    expect(client.startTask).not.toHaveBeenCalled(); // giving never starts it
  });

  it("starts the agent it was given and shows the run's steps (P2)", async () => {
    const user = userEvent.setup();
    runs = {
      task: "t1",
      agent: { id: "a_2", name: "Deal Reader", kind: "custom", takes_tasks: true, running: false },
      runs: [{ id: "run_1", agent: "a_2", agent_name: "Deal Reader", started_at: "2026-10-19T08:00:00+00:00", ended_at: "2026-10-19T08:01:00+00:00", verdict: "succeeded", why: null, line: "Asked the broker; the P&L comes Friday.", trigger: "task", steps: [{ id: "j1", at: "2026-10-19T08:00:10+00:00", kind: "did", actor: "a_2", text: "Drafted the request to the broker." }] }],
    };
    const { client } = mountTask();
    await user.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() => expect(client.startTask).toHaveBeenCalledWith("t1"));
    await user.click(screen.getByRole("button", { name: /Asked the broker; the P&L comes Friday/ }));
    expect(screen.getByText(/Drafted the request to the broker/)).toBeInTheDocument();
  });
});

