import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, RecordRow, TableDesc } from "../core/client";
import { TooltipProvider } from "../ui";
import { DataPage } from "./DataPage";

const desc: TableDesc = { name: "deals", title: "Deals", module: null, fields: [{ name: "title", kind: "text" }, { name: "price", kind: "number" }, { name: "status", kind: "status", choices: ["Active", "Sold"], done_choices: ["Sold"] }], title_field: "title" } as unknown as TableDesc;
const row = (id: string, title: string, price: number | null, extra: Partial<RecordRow> = {}): RecordRow => ({ id, revision: 3, values: { title, price, status: "Active" }, created_at: "2026-10-01T08:00:00+00:00", updated_at: "2026-10-01T08:00:00+00:00", provenance: {}, ...extra });

function fakeClient(rows: RecordRow[]) {
  const client = {
    table: vi.fn(async () => ({ table: desc, records: rows, files: {}, lists: [] })),
    editRecord: vi.fn(async () => ({})),
    deleteRecord: vi.fn(async () => ({})),
    addRecord: vi.fn(async () => ({})),
    saveList: vi.fn(async () => ({})),
    updateList: vi.fn(async () => ({})),
    deleteList: vi.fn(async () => ({})),
    exportTable: vi.fn(async () => ({})),
    addFiles: vi.fn(async () => ({})),
  };
  return client as unknown as Client & typeof client;
}

function page(rows: RecordRow[], onOpenRecord = vi.fn()) {
  const client = fakeClient(rows);
  render(
    <TooltipProvider>
      <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} onOpenRecord={onOpenRecord} />
    </TooltipProvider>,
  );
  return client;
}

describe("the table page", () => {
  it("shows the rows and marks what Alpha estimated", async () => {
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { provenance: { estimated: true } })]);
    expect(await screen.findByText("Bakery")).toBeInTheDocument();
    expect(screen.getByLabelText("estimated")).toBeInTheDocument();
    expect(screen.getByText(/1 estimated/)).toBeInTheDocument();
  });

  it("a click on a row opens nothing, its › opens the row's page; a double-click edits a cell and Enter saves it", async () => {
    const user = userEvent.setup();
    const onOpenRecord = vi.fn();
    const client = page([row("r1", "Bakery", 300)], onOpenRecord);
    await screen.findByText("Bakery");
    await user.click(screen.getByText("Bakery"));
    expect(onOpenRecord).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open Bakery" }));
    expect(onOpenRecord).toHaveBeenCalledWith("deals", "r1");
    const cell = within(screen.getByRole("row", { name: "Bakery" })).getByText("300");
    await user.dblClick(cell);
    const input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "350{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 350 }, 3));
  });

  it("Clear unticks every row and gives the header its labels back", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("checkbox", { name: "Select Bakery" })).not.toBeChecked();
    expect(screen.getAllByRole("row")[0]).not.toHaveClass("selecting");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("selected rows are removed together, after a yes", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Cafe" }));
    // the header row says it, in place of the column labels: no bar of its own pushes the rows down
    const header = screen.getAllByRole("row")[0];
    expect(within(header).getByRole("status")).toHaveTextContent("2 selected");
    expect(header).toHaveClass("selecting");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(client.deleteRecord).not.toHaveBeenCalled(); // not before the yes
    await user.click(screen.getByRole("button", { name: "Remove 2" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledTimes(2));
    expect(client.deleteRecord).toHaveBeenCalledWith("deals", "r1", 3);
  });
});

describe("filters and sorts in the columns (section 3a)", () => {
  const withStatus = (r: RecordRow, status: string): RecordRow => ({ ...r, values: { ...r.values, status } });

  it("a number column's menu narrows the rows; the header shows a funnel and the toolbar one line with Clear all", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Filter Price" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Condition" }), "gt");
    await user.type(screen.getByRole("spinbutton", { name: "Value" }), "200");
    expect(screen.queryByText("Cafe")).toBeNull();
    expect(screen.getByLabelText("filtered")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    const summary = screen.getByRole("status");
    expect(summary).toHaveTextContent("1 filter");
    await user.click(within(summary).getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("Cafe")).toBeInTheDocument();
  });

  it("a choice column is a ticklist with counts, and its menu holds Hide done", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), withStatus(row("r2", "Cafe", 120), "Sold"), row("r3", "Diner", 90)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Filter Status" }));
    const values = await screen.findByRole("group", { name: "Values of Status" });
    expect(within(values).getByText("2")).toBeInTheDocument(); // two Active
    await user.click(within(values).getByRole("checkbox", { name: /Active/ }));
    expect(screen.queryByText("Bakery")).toBeNull();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hide done rows" })).toBeInTheDocument();
  });

  it("a click on a header sorts by it, a shift-click adds the next level, numbered", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 300), row("r3", "Diner", 120)]);
    const sortButton = (name: string) => within(screen.getByRole("columnheader", { name: new RegExp(`^${name}`) })).getAllByRole("button")[0];
    await screen.findByText("Bakery");
    await user.click(sortButton("Price"));
    await user.click(sortButton("Price")); // descending
    await user.keyboard("{Shift>}");
    await user.click(sortButton("Title"));
    await user.click(sortButton("Title")); // the second level turned around
    await user.keyboard("{/Shift}");
    const titles = screen.getAllByRole("row").slice(1).map((r) => within(r).queryByText(/Bakery|Cafe|Diner/)?.textContent).filter(Boolean);
    expect(titles).toEqual(["Cafe", "Bakery", "Diner"]);
    expect(screen.getByText("2")).toHaveClass("th__level");
  });

  it("a list saved with the old quick dropdowns opens with them as its column's ticklist", async () => {
    const client = fakeClient([row("r1", "Bakery", 300), withStatus(row("r2", "Cafe", 120), "Sold")]);
    const list = { id: "l1", collection: "deals", title: "Sold ones", config: { filters: { status: "Sold" } }, is_default: true, source: null, created_at: "", updated_at: "" };
    (client as unknown as { table: unknown }).table = vi.fn(async () => ({ table: desc, records: [row("r1", "Bakery", 300), withStatus(row("r2", "Cafe", 120), "Sold")], files: {}, lists: [list], relations: {} }));
    render(
      <TooltipProvider>
        <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Cafe")).toBeInTheDocument();
    expect(screen.queryByText("Bakery")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("1 filter");
  });

  it("with two filters the toolbar's switch matches all or any", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), withStatus(row("r2", "Cafe", 120), "Sold"), row("r3", "Diner", 90)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Filter Price" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Condition" }), "gt");
    await user.type(screen.getByRole("spinbutton", { name: "Value" }), "200");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Filter Status" }));
    await user.click(within(await screen.findByRole("group", { name: "Values of Status" })).getByRole("checkbox", { name: /Active/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Bakery")).toBeNull(); // more than 200 and not Active: none
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows that match" }), "any");
    expect(screen.getByText("Bakery")).toBeInTheDocument();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    expect(screen.queryByText("Diner")).toBeNull();
  });
});

describe("quick entry", () => {
  it("a sentence goes to Alpha naming the table, and the field clears", async () => {
    const user = userEvent.setup();
    const onSay = vi.fn();
    render(
      <TooltipProvider>
        <DataPage client={fakeClient([row("r1", "Bakery", 300)])} table={desc} version={0} onChanged={vi.fn()} onSay={onSay} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    const field = screen.getByRole("textbox", { name: "Add to Deals in a sentence" });
    await user.type(field, "a cafe in Leeds asking 40k{Enter}");
    expect(onSay).toHaveBeenCalledWith("Add to Deals: a cafe in Leeds asking 40k");
    expect(field).toHaveValue("");
  });

  it("is absent when the page has no way to speak", async () => {
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    expect(screen.queryByRole("textbox", { name: "Add to Deals in a sentence" })).not.toBeInTheDocument();
  });
});

describe("relations and the form view", () => {
  const withClient: TableDesc = { ...desc, fields: [...desc.fields, { name: "client", kind: "relation", relation: "clients" }] };
  const deal = row("r1", "Bakery", 300, { values: { title: "Bakery", price: 300, status: "Active", client: "c1" } });

  it("a relation shows the related record's title and opens that record's own page", async () => {
    const user = userEvent.setup();
    const client = fakeClient([deal]);
    client.table = vi.fn(async () => ({ table: withClient, records: [deal], files: {}, lists: [], relations: { client: { c1: "RestoPros" } } }));
    const onOpenRecord = vi.fn();
    render(
      <TooltipProvider>
        <DataPage client={client} table={withClient} version={0} onChanged={vi.fn()} onOpenRecord={onOpenRecord} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "RestoPros" }));
    expect(onOpenRecord).toHaveBeenCalledWith("clients", "c1");
  });

  it("the form view shows one row at a time with next and previous", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("tab", { name: "Form" }));
    expect(screen.getByRole("region", { name: "Row 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous row" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next row" }));
    expect(screen.getByRole("region", { name: "Row 2 of 2" })).toHaveTextContent("Cafe");
    expect(screen.getByRole("button", { name: "Next row" })).toBeDisabled();
  });
});
