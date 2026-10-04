import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, RecordRow, TableDesc } from "../core/client";
import { SoonProvider, TooltipProvider } from "../ui";
import { DataPage, startingView } from "./DataPage";

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

function page(rows: RecordRow[]) {
  const client = fakeClient(rows);
  render(
    <TooltipProvider>
      <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} />
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

  it("a click opens the row; a double-click edits a cell and Enter saves it with its revision", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("row", { name: "Open Bakery" }));
    expect(screen.getByRole("region", { name: "Bakery" })).toBeInTheDocument(); // the record panel
    const cell = within(screen.getByRole("row", { name: "Open Bakery" })).getByText("300");
    await user.dblClick(cell);
    const input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "350{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 350 }, 3));
  });

  it("selected rows are removed together, after a yes", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Cafe" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 selected");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(client.deleteRecord).not.toHaveBeenCalled(); // not before the yes
    await user.click(screen.getByRole("button", { name: "Remove 2" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledTimes(2));
    expect(client.deleteRecord).toHaveBeenCalledWith("deals", "r1", 3);
  });

  it("the record panel asks before removing", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("row", { name: "Open Bakery" }));
    await user.click(within(screen.getByRole("region", { name: "Bakery" })).getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog", { name: "Remove Bakery?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove it" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledWith("deals", "r1", 3));
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
  const clients: TableDesc = { name: "clients", title: "Clients", module: null, title_field: "name", fields: [{ name: "name", kind: "text" }], records: 1 };
  const withClient: TableDesc = { ...desc, fields: [...desc.fields, { name: "client", kind: "relation", relation: "clients" }] };
  const deal = row("r1", "Bakery", 300, { values: { title: "Bakery", price: 300, status: "Active", client: "c1" } });

  it("a relation shows the related record's title, opens it in the drawer, and Back returns", async () => {
    const user = userEvent.setup();
    const client = fakeClient([deal]);
    client.table = vi.fn(async () => ({ table: withClient, records: [deal], files: {}, lists: [], relations: { client: { c1: "RestoPros" } } }));
    const record = vi.fn(async () => ({ table: clients, record: { ...row("c1", "", null), values: { name: "RestoPros" } }, relations: {} }));
    (client as unknown as { record: typeof record }).record = record;
    render(
      <TooltipProvider>
        <DataPage client={client} table={withClient} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "RestoPros" }));
    expect(record).toHaveBeenCalledWith("clients", "c1");
    expect(await screen.findByRole("region", { name: "RestoPros" })).toBeInTheDocument();
    expect(screen.getByText("Clients")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Deals" }));
    expect(screen.queryByRole("region", { name: "RestoPros" })).not.toBeInTheDocument();
  });

  it("the form view shows one row at a time with next and previous", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "View: Table" }));
    await user.click(screen.getByRole("button", { name: "Form" }));
    expect(screen.getByRole("region", { name: "Row 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous row" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next row" }));
    expect(screen.getByRole("region", { name: "Row 2 of 2" })).toHaveTextContent("Cafe");
    expect(screen.getByRole("button", { name: "Next row" })).toBeDisabled();
  });
});

describe("stars: the option a table opens on", () => {
  it("the starred view wins when the table can show it, else where it was left, else the table", () => {
    const all = () => true;
    expect(startingView("board", "list", all)).toBe("board");
    expect(startingView("board", "list", (v) => v !== "board")).toBe("list");
    expect(startingView(null, null, all)).toBe("table");
    expect(startingView("calendar", "chart", (v) => v === "table")).toBe("table");
  });

  it("a star on a view makes it the default without picking it; the table reopens on it", async () => {
    localStorage.clear();
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "View: Table" }));
    await user.click(screen.getByRole("button", { name: "Make List the default" }));
    expect(screen.getByRole("button", { name: "View: Table" })).toBeInTheDocument(); // not picked
    expect(screen.getByRole("button", { name: "List is the default; clear it" })).toHaveAttribute("aria-pressed", "true");
    cleanup();
    page([row("r1", "Bakery", 300)]);
    expect(await screen.findByRole("button", { name: "View: List" })).toBeInTheDocument();
    localStorage.clear();
  });

  it("a star on a saved list makes it the table's default in the world; a filled star clears it", async () => {
    const user = userEvent.setup();
    const client = fakeClient([row("r1", "Bakery", 300)]);
    // The world keeps the star: the next load sees it.
    const sold = { id: "v1", collection: "deals", title: "Sold", config: {}, is_default: false, source: null, created_at: "", updated_at: "" };
    (client as unknown as { table: unknown }).table = vi.fn(async () => ({ table: desc, records: [row("r1", "Bakery", 300)], files: {}, lists: [{ ...sold }], relations: {} }));
    (client as unknown as { updateList: unknown }).updateList = vi.fn(async (_id: string, change: { default?: boolean }) => Object.assign(sold, { is_default: Boolean(change.default) }));
    render(
      <TooltipProvider>
        <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Saved list: All" }));
    await user.click(screen.getByRole("button", { name: "Make Sold the default" }));
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("v1", { default: true }));
    expect(screen.getByRole("button", { name: "Saved list: All" })).toBeInTheDocument(); // still on All
    await user.click(await screen.findByRole("button", { name: "Sold is the default; clear it" }));
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("v1", { default: false }));
  });
});

describe("a click opens, a double-click edits, in every view", () => {
  it("on a list line: a click opens the record; a double-click on a value edits it there", async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "View: Table" }));
    await user.click(screen.getByRole("button", { name: "List" }));
    await user.click(screen.getByText("Bakery"));
    expect(screen.getByRole("region", { name: "Bakery" })).toBeInTheDocument();
    await user.dblClick(within(document.querySelector(".list") as HTMLElement).getByText("300"));
    const input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "310{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 310 }, 3));
    localStorage.clear();
  });
});

describe("what waits for the core", () => {
  it("a column's Rename says it is coming soon; its Hide works", async () => {
    const user = userEvent.setup();
    render(
      <SoonProvider>
        <TooltipProvider>
          <DataPage client={fakeClient([row("r1", "Bakery", 300)])} table={desc} version={0} onChanged={vi.fn()} />
        </TooltipProvider>
      </SoonProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Price options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename column" }));
    expect(await screen.findByText("Renaming a column is coming soon.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Price options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hide column" }));
    expect(screen.queryByRole("columnheader", { name: /Price/ })).not.toBeInTheDocument();
  });
});
