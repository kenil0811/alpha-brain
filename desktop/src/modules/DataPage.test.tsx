import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("a number column's menu narrows the rows; the header shows a funnel and the toolbar a filters word with Clear all", async () => {
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
    await user.click(within(summary).getByRole("button", { name: /1 filter/ }));
    await user.click(await screen.findByRole("button", { name: "Clear all filters" }));
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
    await user.click(screen.getByRole("button", { name: /Grouped · 2 filters|2 filters/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Rows that match" }), "any");
    expect(screen.getByText("Bakery")).toBeInTheDocument();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    expect(screen.queryByText("Diner")).toBeNull();
  });
});

describe("grouping the table (section 3b)", () => {
  const withStatus = (r: RecordRow, status: string): RecordRow => ({ ...r, values: { ...r.values, status } });

  it("a column's menu groups the table; a group folds; the toolbar says it and ungroups", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), withStatus(row("r2", "Cafe", 120), "Sold"), row("r3", "Diner", 90)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Filter Status" }));
    await user.click(await screen.findByRole("button", { name: "Group by this column" }));
    expect(screen.queryByRole("button", { name: "Group by this column" })).toBeNull(); // the menu closed on the choice
    const active = screen.getByRole("button", { name: /Active · 2/ });
    expect(screen.getByRole("button", { name: /Sold · 1/ })).toBeInTheDocument();
    expect(screen.getByText("3 rows in 2 groups")).toBeInTheDocument();
    await user.click(active);
    expect(active).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Bakery")).toBeNull();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Grouped: Status/ }));
    await user.click(await screen.findByRole("button", { name: "Ungroup" }));
    expect(screen.queryByRole("button", { name: /Active · 2/ })).toBeNull();
    expect(screen.getByText("Bakery")).toBeInTheDocument();
  });
});

describe("coming back to a table", () => {
  it("keeps its grouping, filters and page after a record's page, for the session", async () => {
    const user = userEvent.setup();
    const rows = [row("r1", "Bakery", 300), { ...row("r2", "Cafe", 120), values: { title: "Cafe", price: 120, status: "Sold" } }];
    const client = fakeClient(rows);
    const first = render(
      <TooltipProvider>
        <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Filter Status" }));
    await user.click(await screen.findByRole("button", { name: "Group by this column" }));
    await user.click(screen.getByRole("button", { name: "Filter Price" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Condition" }), "gt");
    await user.type(screen.getByRole("spinbutton", { name: "Value" }), "200");
    await user.keyboard("{Escape}");
    first.unmount(); // the record's page opens in its place
    render(
      <TooltipProvider>
        <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("button", { name: /Active · 1/ })).toBeInTheDocument();
    expect(screen.queryByText("Cafe")).toBeNull();
    expect(screen.getByRole("button", { name: /Grouped · 1 filter/ })).toBeInTheDocument();
  });
});

describe("saved lists as tabs (section 3c)", () => {
  const list = (id: string, title: string, config: Record<string, unknown>, is_default = false) => ({ id, collection: "deals", title, config, is_default, source: null, created_at: "", updated_at: "" });
  function withLists(lists: ReturnType<typeof list>[]) {
    const rows = [row("r1", "Bakery", 300), { ...row("r2", "Cafe", 120), values: { title: "Cafe", price: 120, status: "Sold" } }];
    const client = fakeClient(rows);
    // the core keeps the lists: a save, a change or a removal is there when the page reads them again
    let kept = [...lists];
    (client as unknown as { table: unknown }).table = vi.fn(async () => ({ table: desc, records: rows, files: {}, lists: kept, relations: {} }));
    client.saveList = vi.fn(async (_t: string, title: string, config: unknown) => {
      const made = list("l9", title, config as Record<string, unknown>);
      kept = [...kept, made];
      return made;
    }) as never;
    client.updateList = vi.fn(async (id: string, change: { title?: string; config?: Record<string, unknown> }) => {
      kept = kept.map((l) => (l.id === id ? { ...l, title: change.title ?? l.title, config: change.config ?? l.config } : l));
      return kept.find((l) => l.id === id)!;
    }) as never;
    client.deleteList = vi.fn(async (id: string) => {
      kept = kept.filter((l) => l.id !== id);
      return {};
    }) as never;
    render(
      <TooltipProvider>
        <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    return client;
  }

  it("shows All and each list as a tab; a tab shows its rows; ★ marks the one the table opens on", async () => {
    const user = userEvent.setup();
    withLists([list("l1", "Sold ones", { rules: { match: "all", rules: [{ field: "status", op: "in", value: "", values: ["Sold"] }] } }), list("l2", "Big ones", {}, true)]);
    const tabs = await screen.findByRole("tablist", { name: "Saved lists" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["All", "Sold ones", "★ Big ones"]);
    await user.click(within(tabs).getByRole("tab", { name: "Sold ones" }));
    expect(screen.queryByText("Bakery")).toBeNull();
    expect(within(tabs).getByRole("tab", { name: "Sold ones" })).toHaveAttribute("aria-selected", "true");
  });

  it("+ saves the current view under a name, a sort alone included", async () => {
    const user = userEvent.setup();
    const client = withLists([]);
    await screen.findByText("Bakery");
    await user.click(within(screen.getByRole("columnheader", { name: /^Price/ })).getAllByRole("button")[0]);
    await user.click(screen.getByRole("button", { name: "Save the current view as a list" }));
    await user.type(await screen.findByRole("textbox", { name: "List name" }), "Cheapest first");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.saveList).toHaveBeenCalled());
    const [, title, config] = (client.saveList as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(title).toBe("Cheapest first");
    expect(config.sorts).toEqual([{ field: "price", direction: "asc" }]);
    expect(await screen.findByRole("tab", { name: "Cheapest first" })).toHaveAttribute("aria-selected", "true");
  });

  it("a change shows a dot; the list's menu saves it, renames it, and removes it after a yes", async () => {
    const user = userEvent.setup();
    const client = withLists([list("l1", "Sold ones", {})]);
    await user.click(await screen.findByRole("tab", { name: "Sold ones" }));
    expect(screen.queryByLabelText("changed since saved")).toBeNull();
    await user.click(within(screen.getByRole("columnheader", { name: /^Price/ })).getAllByRole("button")[0]);
    expect(screen.getByLabelText("changed since saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More for the list Sold ones" }));
    await user.click(await screen.findByRole("button", { name: "Save changes to this list" }));
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("l1", { config: expect.objectContaining({ sorts: [{ field: "price", direction: "asc" }] }) }));
    await user.click(screen.getByRole("button", { name: "More for the list Sold ones" }));
    await user.click(await screen.findByRole("button", { name: "Rename…" }));
    const name = screen.getByRole("textbox", { name: "List name" });
    await user.clear(name);
    await user.type(name, "Sold");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("l1", { title: "Sold" }));
    await user.click(await screen.findByRole("button", { name: "More for the list Sold" }));
    await user.click(await screen.findByRole("button", { name: "Remove this list…" }));
    expect(client.deleteList).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove it" }));
    await waitFor(() => expect(client.deleteList).toHaveBeenCalledWith("l1"));
  });
});

describe("totals you choose per column (section 4a)", () => {
  it("a number column sums by default; a footer cell offers other totals; a group's header shows its own", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), { ...row("r2", "Cafe", 120), values: { title: "Cafe", price: 120, status: "Sold" } }, row("r3", "Diner", 90)]);
    await screen.findByText("Bakery");
    expect(screen.getByRole("button", { name: "Price: Sum 510" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Price: Sum 510" }));
    await user.click(within(await screen.findByRole("group", { name: "Total for Price" })).getByRole("button", { name: /Average/ }));
    expect(screen.getByRole("button", { name: "Price: Average 170" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose a total for Title" }));
    await user.click(within(await screen.findByRole("group", { name: "Total for Title" })).getByRole("button", { name: /Count/ }));
    expect(screen.getByRole("button", { name: "Title: Count 3" })).toBeInTheDocument();
    // grouped: each group's header carries its totals under the columns
    await user.click(screen.getByRole("button", { name: "Filter Status" }));
    await user.click(await screen.findByRole("button", { name: "Group by this column" }));
    const active = screen.getByRole("button", { name: /Active · 2/ }).closest("tr")!;
    expect(within(active).getByText("195")).toBeInTheDocument(); // (300 + 90) / 2
  });
});

describe("editing several ticked rows at once (section 4b)", () => {
  it("Set… writes the value on each ticked row, one edit per row, and the ticks stay", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120), row("r3", "Diner", 90)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Diner" }));
    await user.click(screen.getByRole("button", { name: "Set…" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Field to set" }), "status");
    await user.selectOptions(screen.getByRole("combobox", { name: "Value" }), "Sold");
    await user.click(screen.getByRole("button", { name: "Set on 2 rows" }));
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledTimes(2));
    expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { status: "Sold" }, 3);
    expect(client.editRecord).toHaveBeenCalledWith("deals", "r3", { status: "Sold" }, 3);
    expect(screen.getByRole("checkbox", { name: "Select Bakery" })).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Field to set" })).toBeNull(); // done: the menu closed
  });

  it("a refused row stops it, saying how many were set and why", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    client.editRecord = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Record r2 changed since revision 3")) as never;
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select every row on this page" }));
    await user.click(screen.getByRole("button", { name: "Set…" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Field to set" }), "price");
    await user.type(screen.getByRole("spinbutton", { name: "Value" }), "99");
    await user.click(screen.getByRole("button", { name: "Set on 2 rows" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Set on 1 of 2; then: Record r2 changed since revision 3");
  });

  it("offers no Set… on a module's read-only table", async () => {
    const user = userEvent.setup();
    const client = fakeClient([row("r1", "Bakery", 300)]);
    render(
      <TooltipProvider>
        <DataPage client={client} table={{ ...desc, readonly: true }} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    expect(screen.queryByRole("button", { name: "Set…" })).toBeNull();
  });
});

describe("pasting from a spreadsheet (section 4c)", () => {
  const paste = (cell: HTMLElement, text: string) => fireEvent.paste(cell, { clipboardData: { getData: () => text } });

  it("⌘V on a selected cell pastes through the hidden box and gives the cell its focus back", async () => {
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    const cell = within(screen.getByRole("row", { name: "Bakery" })).getByText("300").closest("td")!;
    cell.focus();
    fireEvent.keyDown(cell, { key: "v", metaKey: true });
    const box = document.querySelector("textarea.pastebox") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(box);
    fireEvent.paste(box, { clipboardData: { getData: () => "275" } });
    expect(document.activeElement).toBe(cell);
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 275 }, 3));
  });

  it("a single value goes into the cell like an edit", async () => {
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    paste(within(screen.getByRole("row", { name: "Bakery" })).getByText("300").closest("td")!, "$450");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 450 }, 3));
  });

  it("a block asks first, saying what it replaces, adds and leaves out, then writes one row at a time", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    paste(within(screen.getByRole("row", { name: "Bakery" })).getByText("300").closest("td")!, "310\tSold\nabc\tActive\n90\tSold");
    const dialog = await screen.findByRole("dialog", { name: "Paste 3 rows × 2 columns?" });
    expect(dialog).toHaveTextContent("Into Price, Status, on 1 row. 2 values replace what's there.");
    expect(dialog).toHaveTextContent("1 new row is added for the lines past the end.");
    expect(dialog).toHaveTextContent('"abc" in Price: isn\'t a number');
    expect(client.editRecord).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Paste" }));
    await waitFor(() => expect(client.addRecord).toHaveBeenCalledWith("deals", { price: 90, status: "Sold" }));
    expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 310, status: "Sold" }, 3);
    expect(client.editRecord).toHaveBeenCalledTimes(1); // Cafe's status was already Active; its "abc" is left out
  });

  it("a refused row stops the paste with how far it got", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    client.editRecord = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Record r2 changed since revision 3")) as never;
    await screen.findByText("Bakery");
    paste(within(screen.getByRole("row", { name: "Bakery" })).getByText("300").closest("td")!, "1\n2");
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Paste" }));
    expect(await screen.findByText("Pasted 1 of 2; then: Record r2 changed since revision 3")).toBeInTheDocument();
  });

  it("does nothing on a module's read-only table", async () => {
    const client = fakeClient([row("r1", "Bakery", 300)]);
    render(
      <TooltipProvider>
        <DataPage client={client} table={{ ...desc, readonly: true }} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    paste(within(screen.getByRole("row", { name: "Bakery" })).getByText("300").closest("td")!, "1\n2");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(client.editRecord).not.toHaveBeenCalled();
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
