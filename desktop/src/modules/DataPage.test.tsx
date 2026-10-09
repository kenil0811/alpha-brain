import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, RecordRow, TableDesc } from "../core/client";
import { forgetPreferences } from "../core/preferences";
import { TooltipProvider } from "../ui";
import { DataPage } from "./DataPage";
import { memorySource } from "./source";

// The Dashboard has its own tests; here it is a stub that does what its call to action does.
vi.mock("./views/DashboardView", () => ({
  DashboardView: ({ onShowRecords }: { onShowRecords: (ids: string[], label: string) => void }) => <button onClick={() => onShowRecords(["r2"], "Overdue · 1")}>stub: show these</button>,
  dashboardAvailable: () => null,
}));

const desc: TableDesc = { name: "deals", title: "Deals", module: null, fields: [{ name: "title", kind: "text" }, { name: "price", kind: "number" }, { name: "status", kind: "status", choices: ["Active", "Sold"], done_choices: ["Sold"] }], title_field: "title" } as unknown as TableDesc;
const row = (id: string, title: string, price: number | null, extra: Partial<RecordRow> = {}): RecordRow => ({ id, revision: 3, values: { title, price, status: "Active" }, created_at: "2026-10-01T08:00:00+00:00", updated_at: "2026-10-01T08:00:00+00:00", provenance: {}, ...extra });

/** A client over a small table that really changes when edited, and keeps the preferences written. */
function fakeClient(rows: RecordRow[], tableDesc: TableDesc = desc) {
  const prefs: Record<string, unknown> = {};
  const client = {
    table: vi.fn(async () => ({ table: tableDesc, records: rows, files: {}, lists: [], relations: {} })),
    editRecord: vi.fn(async (_t: string, id: string, values: Record<string, unknown>, revision: number) => {
      const at = rows.findIndex((r) => r.id === id);
      rows[at] = { ...rows[at], values: { ...rows[at].values, ...values }, revision: revision + 1 };
      return rows[at];
    }),
    deleteRecord: vi.fn(async () => ({})),
    addRecord: vi.fn(async (_t: string, values: Record<string, unknown>) => {
      const made = row(`r${rows.length + 1}`, "", null, { values: { ...values } });
      rows.push(made);
      return made;
    }),
    saveList: vi.fn(async (_t: string, title: string) => ({ id: "v1", collection: "deals", title, config: {}, is_default: false, source: null, created_at: "", updated_at: "" })),
    updateList: vi.fn(async () => ({})),
    deleteList: vi.fn(async () => ({})),
    exportTable: vi.fn(async () => ({})),
    addFiles: vi.fn(async () => ({})),
    preference: vi.fn(async (key: string) => ({ key, value: prefs[key] ?? null })),
    setPreference: vi.fn(async (key: string, value: unknown) => {
      prefs[key] = value;
      return { key, value };
    }),
  };
  return client as unknown as Client & typeof client;
}

function page(rows: RecordRow[], props: Partial<Parameters<typeof DataPage>[0]> = {}, client = fakeClient(rows)) {
  render(
    <TooltipProvider>
      <DataPage client={client} table={desc} version={0} onChanged={vi.fn()} {...props} />
    </TooltipProvider>,
  );
  return client;
}
const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(`^(Open )?${name}$`) });

beforeEach(() => {
  forgetPreferences();
  localStorage.clear();
});

describe("the table page", () => {
  it("shows the records, marks what Alpha estimated and counts it in the page bar", async () => {
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { provenance: { estimated: true } })]);
    expect(await screen.findByText("Bakery")).toBeInTheDocument();
    expect(screen.getByLabelText("estimated")).toBeInTheDocument();
    expect(screen.getByText(/1 estimated/)).toBeInTheDocument();
    // one page: nothing to page through, so no "Showing…" and no page size
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Records per page" })).toBeNull();
  });

  it("pages when there is more than one page, and says where it is", async () => {
    localStorage.setItem("alpha.rows-per-page", "25");
    page(Array.from({ length: 30 }, (_, i) => row(`r${i}`, `Shop ${i}`, i)));
    expect(await screen.findByText("Showing 1 to 25 of 30")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Records per page" })).toBeInTheDocument();
  });

  it("a click opens the record's page", async () => {
    const user = userEvent.setup();
    const onOpenRecord = vi.fn();
    page([row("r1", "Bakery", 300)], { onOpenRecord });
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("row", { name: "Open Bakery" }));
    await waitFor(() => expect(onOpenRecord).toHaveBeenCalledWith("deals", "r1"));
  });

  it("selected records are deleted together, after a yes that says what happens", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Cafe" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 selected");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(client.deleteRecord).not.toHaveBeenCalled(); // not before the yes
    expect(screen.getByRole("dialog", { name: "Delete 2 records?" })).toHaveTextContent("Activity keeps that they were here.");
    await user.click(screen.getByRole("button", { name: "Delete 2" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledTimes(2));
    expect(client.deleteRecord).toHaveBeenCalledWith("deals", "r1", 3);
  });

  it("selected records can be duplicated or the selection cancelled", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(client.addRecord).toHaveBeenCalledWith("deals", { title: "Bakery", price: 300, status: "Active" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("1 selected")).toBeNull();
  });
});

describe("the toolbar", () => {
  it("is one row: saved list, view, search and filter on the left, more on the right, with Download and Upload inside it", async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    const client = page([row("r1", "Bakery", 300)], { onAddFiles });
    await screen.findByText("Bakery");
    const order = [
      screen.getByRole("combobox", { name: "Saved list" }),
      screen.getByRole("combobox", { name: "View" }),
      screen.getByRole("textbox", { name: "Search" }),
      screen.getByRole("button", { name: "Filter" }),
      screen.getByRole("button", { name: "More" }),
    ];
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[0].closest(".toolbar")).toBe(order[4].closest(".toolbar")); // one row
    const spacer = order[0].closest(".toolbar")!.querySelector(".spacer")!;
    expect(order[3].compareDocumentPosition(spacer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // Filter is on the left
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull(); // no file field: Upload is in More
    await user.click(order[4]);
    await user.click(screen.getByRole("button", { name: "Download as CSV" }));
    expect(client.exportTable).toHaveBeenCalledWith("deals", "csv");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(onAddFiles).toHaveBeenCalled();
  });

  it("makes Upload the primary action, left of more, when the collection has a file field", async () => {
    const withFile = { ...desc, fields: [...desc.fields, { name: "doc", kind: "file" }] } as unknown as TableDesc;
    const client = fakeClient([row("r1", "Bakery", 300)], withFile);
    render(
      <TooltipProvider>
        <DataPage client={client} table={withFile} version={0} onChanged={vi.fn()} onAddFiles={vi.fn()} />
      </TooltipProvider>,
    );
    await screen.findByText("Bakery");
    const upload = screen.getByRole("button", { name: "Upload" });
    expect(upload.compareDocumentPosition(screen.getByRole("button", { name: "More" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps a view the data cannot support, disabled, with its reason on hover", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "View" }));
    const calendar = screen.getByRole("option", { name: "Calendar" });
    expect(calendar).toHaveAttribute("aria-disabled", "true");
    await user.hover(calendar);
    expect(screen.getByRole("status")).toHaveTextContent("Calendar needs a date field");
    await user.click(calendar);
    expect(screen.getByRole("combobox", { name: "View" })).toHaveTextContent("Table"); // nothing changed
    expect(screen.getByRole("option", { name: "Board" })).not.toHaveAttribute("aria-disabled");
  });

  it("holds every filter in one popover, and shows what is active as removable pills with Clear all", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { values: { title: "Cafe", price: 120, status: "Sold" } })]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await user.click(screen.getByRole("option", { name: "Sold" }));
    expect(screen.getByRole("checkbox", { name: /Hide done/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Bakery")).toBeNull();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    const pills = screen.getByLabelText("Active filters");
    expect(within(pills).getByText("Status: Sold")).toBeInTheDocument();
    await user.click(within(pills).getByRole("button", { name: "Remove filter: Status: Sold" }));
    expect(screen.getByText("Bakery")).toBeInTheDocument();
    // and Clear all
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("checkbox", { name: /Hide done/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Cafe")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Active filters")).toBeNull();
  });

  it("the dashboard's 'these records' becomes a table filter, a removable pill named for it", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "View" }));
    await user.click(screen.getByRole("option", { name: "Dashboard" }));
    await user.click(screen.getByRole("button", { name: "stub: show these" }));
    expect(screen.getByRole("combobox", { name: "View" })).toHaveTextContent("Table");
    expect(screen.queryByText("Bakery")).toBeNull();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter: Overdue · 1" }));
    expect(screen.getByText("Bakery")).toBeInTheDocument();
  });

  it("Add list opens the app's dialog to name the list, and saves the current view under it", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "Saved list" }));
    await user.click(screen.getByRole("button", { name: "Add list" }));
    const dialog = screen.getByRole("dialog", { name: "Add a list" });
    await user.type(within(dialog).getByRole("textbox", { name: "List name" }), "Open ones{Enter}");
    await waitFor(() => expect(client.saveList).toHaveBeenCalledWith("deals", "Open ones", expect.objectContaining({ view: "table" })));
  });
});

describe("editing a cell", () => {
  it("a double-click edits, clicking away saves with the revision, and Escape cancels", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.dblClick(within(rowOf("Bakery")).getByText("300"));
    let input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "350");
    await user.click(document.body); // clicking away
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 350 }, 3));
    expect(client.editRecord).toHaveBeenCalledTimes(1);

    await within(rowOf("Bakery")).findByText("350");
    await user.dblClick(within(rowOf("Bakery")).getByText("350"));
    input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "999{Escape}");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(client.editRecord).toHaveBeenCalledTimes(1);
    expect(within(rowOf("Bakery")).getByText("350")).toBeInTheDocument();
  });

  it("Enter and F2 start editing from the keyboard, and Enter saves", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    within(rowOf("Bakery")).getByText("300").focus();
    await user.keyboard("{F2}");
    const input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "310{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 310 }, 3));
  });

  it("⌘Z puts the last edit back with the record's current revision, ⇧⌘Z does it again", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.dblClick(within(rowOf("Bakery")).getByText("300"));
    const input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "350{Enter}");
    await within(rowOf("Bakery")).findByText("350");
    await user.keyboard("{Meta>}z{/Meta}");
    await waitFor(() => expect(client.editRecord).toHaveBeenLastCalledWith("deals", "r1", { price: 300 }, 4));
    expect(await screen.findByText("Undone.")).toBeInTheDocument();
    await within(rowOf("Bakery")).findByText("300");
    await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
    await waitFor(() => expect(client.editRecord).toHaveBeenLastCalledWith("deals", "r1", { price: 350 }, 5));
  });

  it("says so inline, and changes nothing, when the record changed since", async () => {
    const user = userEvent.setup();
    const rows = [row("r1", "Bakery", 300)];
    const client = fakeClient(rows);
    const ui = (version: number) => (
      <TooltipProvider>
        <DataPage client={client} table={desc} version={version} onChanged={vi.fn()} />
      </TooltipProvider>
    );
    const { rerender } = render(ui(0));
    await screen.findByText("Bakery");
    await user.dblClick(within(rowOf("Bakery")).getByText("300"));
    const input = screen.getByRole("spinbutton", { name: "Price" });
    await user.clear(input);
    await user.type(input, "350{Enter}");
    await within(rowOf("Bakery")).findByText("350");
    rows[0] = { ...rows[0], revision: 9 }; // someone else changed it meanwhile
    rerender(ui(1));
    await waitFor(() => expect(client.table).toHaveBeenCalledTimes(3));
    client.editRecord.mockClear();
    await user.keyboard("{Meta>}z{/Meta}");
    expect(await screen.findByText(/Price was changed since, so the undo was left out/)).toBeInTheDocument();
    expect(client.editRecord).not.toHaveBeenCalled();
  });
});

describe("the row's menu", () => {
  it("Duplicate adds a copy and says so; Pin writes the preference and shows the pin; Delete asks first", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");

    fireEvent.contextMenu(rowOf("Cafe"));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(client.addRecord).toHaveBeenCalledWith("deals", { title: "Cafe", price: 120, status: "Active" }));
    expect(await screen.findByText("Duplicated.")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Actions for Cafe" })[0]); // the ⋮⋮ at the row's left edge (the copy is the second Cafe)
    await user.click(await screen.findByRole("menuitem", { name: "Pin" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("pinned_records", { deals: ["r2"] }));
    const rowsNow = screen.getAllByRole("row").filter((r) => r.getAttribute("tabindex") === "0");
    expect(rowsNow[0]).toHaveAccessibleName(/Cafe/); // pinned first
    expect(within(rowsNow[0]).getByLabelText("Pinned")).toBeInTheDocument();

    fireEvent.contextMenu(rowOf("Bakery"));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(client.deleteRecord).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete Bakery?" })).toHaveTextContent("It leaves the table; Activity keeps that it was here.");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledWith("deals", "r1", 3));
  });

  it("opens from the keyboard with Shift+F10, and keeps Open disabled, with its reason, when records have no page", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    rowOf("Bakery").focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    const open = await screen.findByRole("menuitem", { name: "Open" });
    expect(open).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Open", "Edit", "Duplicate", "Pin", "Delete"]);
  });
});

describe("the column and cell menus and the footer", () => {
  it("a column's Calculate picks its footer summary, kept in the person's preferences", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    const foot = () => within(document.querySelector("tfoot") as HTMLElement);
    expect(foot().getByText("420")).toBeInTheDocument(); // numbers add up until told otherwise
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    await user.click(await screen.findByRole("menuitem", { name: "Calculate…" }));
    await user.click(await screen.findByRole("menuitem", { name: "Average" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("footer_summaries", { deals: { price: "average" } }));
    expect(await foot().findByText("210")).toBeInTheDocument();
  });

  it("every column has a footer: 'Calculate' where none is set, and a status counts per group", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { values: { title: "Cafe", price: 120, status: "Sold" } })]);
    await screen.findByText("Bakery");
    const cells = [...(document.querySelector("tfoot tr") as HTMLElement).querySelectorAll("td")].slice(0, 3);
    expect(cells.map((c) => c.textContent)).toEqual(["Calculate", "Sum 420", "Calculate"]);
    await user.click(within(cells[2]).getByRole("button", { name: "Calculate" }));
    await user.click(await screen.findByRole("menuitem", { name: "Count per group" }));
    expect(await within(document.querySelector("tfoot") as HTMLElement).findByText("Active 1 · Sold 1")).toBeInTheDocument();
  });

  it("a column can be sorted and frozen from its menu; Rename says what to do instead", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sort ascending" }));
    const names = () => screen.getAllByRole("row").filter((r) => r.getAttribute("tabindex") === "0").map((r) => r.getAttribute("aria-label"));
    expect(names()).toEqual(["Cafe", "Bakery"]);
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    await user.click(await screen.findByRole("menuitem", { name: "Freeze up to here" }));
    expect(document.querySelectorAll("th.col--frozen").length).toBe(2); // Title and Price; no checkbox column
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    expect(await screen.findByRole("menuitem", { name: "Insert left" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("menuitem", { name: "Wrap text" }));
    expect(document.querySelector("td.col--wrap")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    expect(await screen.findByRole("menuitem", { name: "Rename field…" })).toHaveAttribute("aria-disabled", "true");
  });

  it("a cell's menu clears it and opens the record page's history", async () => {
    const user = userEvent.setup();
    const onOpenRecord = vi.fn();
    const client = page([row("r1", "Bakery", 300)], { onOpenRecord });
    await screen.findByText("Bakery");
    fireEvent.contextMenu(within(rowOf("Bakery")).getByText("300"));
    await user.click(await screen.findByRole("menuitem", { name: "Clear" }));
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: null }, 3));
    fireEvent.contextMenu(within(rowOf("Bakery")).getByText("Bakery"));
    await user.click(await screen.findByRole("menuitem", { name: "Show history" }));
    expect(onOpenRecord).toHaveBeenCalledWith("deals", "r1");
  });
});

describe("the + New row and an empty table", () => {
  it("adds an empty record and opens its title for typing", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    expect(screen.queryByRole("textbox", { name: /in a sentence/ })).toBeNull(); // the sentence goes to the panel now
    await user.click(screen.getByRole("button", { name: "New" }));
    await waitFor(() => expect(client.addRecord).toHaveBeenCalledWith("deals", {}));
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.type(title, "Deli{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r2", { title: "Deli" }, 3));
  });

  it("opens a new record's page when the core won't take an empty record", async () => {
    const user = userEvent.setup();
    const onOpenRecord = vi.fn();
    const client = fakeClient([row("r1", "Bakery", 300)]);
    client.addRecord.mockRejectedValueOnce(new Error("title is required"));
    page([], { onOpenRecord }, client);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "New" }));
    await waitFor(() => expect(onOpenRecord).toHaveBeenCalledWith("deals", "new"));
  });

  it("keeps a header '+' for a column, disabled, with the reason", async () => {
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    expect(screen.getByRole("button", { name: "Add a column" })).toBeDisabled();
  });

  it("an empty table keeps its header, a few blank rows, the add row and the footer", async () => {
    page([], { onSay: vi.fn() });
    await screen.findByText("No records yet.");
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(3);
    expect(document.querySelectorAll("tbody tr.row--blank").length).toBe(3);
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(document.querySelector("tfoot")).not.toBeNull();
    expect(screen.queryByText("Nothing here yet.")).toBeNull();
  });

  it("a filter that matches nothing says so in the page bar", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.type(screen.getByRole("textbox", { name: "Search" }), "zzz");
    expect(await screen.findByText("Nothing matches.")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr.row--blank").length).toBe(3);
  });
});

describe("relations and the form view", () => {
  const clients: TableDesc = { name: "clients", title: "Clients", module: null, title_field: "name", fields: [{ name: "name", kind: "text" }], records: 1 };
  const withClient: TableDesc = { ...desc, fields: [...desc.fields, { name: "client", kind: "relation", relation: "clients" }] };
  const deal = row("r1", "Bakery", 300, { values: { title: "Bakery", price: 300, status: "Active", client: "c1" } });

  it("a relation shows the related record's title and opens its page", async () => {
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
    void clients;
  });

  it("the form view shows one record at a time with next and previous", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "View" }));
    await user.click(screen.getByRole("option", { name: "Form" }));
    expect(screen.getByRole("region", { name: "Record 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous record" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next record" }));
    expect(screen.getByRole("region", { name: "Record 2 of 2" })).toHaveTextContent("Cafe");
    expect(screen.getByRole("button", { name: "Next record" })).toBeDisabled();
  });
});

describe("any source", () => {
  it("draws rows the window holds, keeps what the source can't do disabled with its reason, and its lists in the window", async () => {
    const user = userEvent.setup();
    const client = fakeClient([]);
    const source = memorySource({ client, key: "agents", title: "Agents", fields: [{ name: "name", kind: "text" }, { name: "runs", kind: "number" }], rows: () => [row("a1", "", 4, { values: { name: "Alpha", runs: 4 } })], reasons: { add: "Ask Alpha to make an agent." } });
    render(
      <TooltipProvider>
        <DataPage client={client} source={source} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(client.table).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "New" })).toBeDisabled();
    await user.dblClick(screen.getByText("Alpha"));
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull(); // no edit given: cells stay as they are
    await user.click(screen.getByRole("combobox", { name: "Saved list" }));
    await user.click(screen.getByRole("button", { name: "Add list" }));
    await user.type(within(screen.getByRole("dialog", { name: "Add a list" })).getByRole("textbox", { name: "List name" }), "Busy{Enter}");
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("window_lists", { agents: [expect.objectContaining({ title: "Busy" })] }));
  });
});
