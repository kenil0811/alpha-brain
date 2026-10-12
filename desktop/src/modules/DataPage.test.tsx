import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, RecordRow, SavedList, TableDesc } from "../core/client";
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
  let lists: SavedList[] = [];
  const client = {
    table: vi.fn(async () => ({ table: tableDesc, records: rows, files: {}, lists, relations: {} })),
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
    saveList: vi.fn(async (_t: string, title: string, config: SavedList["config"]) => {
      const made = { id: `v${lists.length + 1}`, collection: "deals", title, config, is_default: false, source: null, created_at: "", updated_at: "" };
      lists = [...lists, made];
      return made;
    }),
    updateList: vi.fn(async (id: string, change: { title?: string; config?: SavedList["config"]; default?: boolean }) => {
      lists = lists.map((l) => (l.id === id ? { ...l, title: change.title ?? l.title, config: change.config ?? l.config, is_default: change.default ?? l.is_default } : change.default ? { ...l, is_default: false } : l));
      return lists.find((l) => l.id === id);
    }),
    deleteList: vi.fn(async (id: string) => {
      lists = lists.filter((l) => l.id !== id);
      return {};
    }),
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
      <DataPage onOpenRecord={vi.fn()} client={client} table={desc} version={0} onChanged={vi.fn()} {...props} />
    </TooltipProvider>,
  );
  return client;
}
/** ⋮ › a view setting: it opens in its dialog once the menu has handed the focus back. */
async function openSetting(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "More" }));
  await user.click(await screen.findByRole("menuitem", { name }));
  return screen.findByRole("dialog", { name });
}
/** ⋮ › Layout › Layout: pick a view type for the open list. */
async function pickLayout(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openSetting(user, "Layout");
  await user.click(screen.getByRole("combobox", { name: "Layout" }));
  await user.click(screen.getByRole("option", { name }));
}
/** What the window hands over as a download: the file's text, by name. */
function catchDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  let blob: Blob | null = null;
  URL.createObjectURL = vi.fn((b: Blob) => {
    blob = b;
    return "blob:alpha";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (blob) files.push({ name: this.download, blob });
  });
  return files;
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
    expect(screen.getByText("Estimated")).toBeInTheDocument();
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

  it("a click opens the record's page after the double-click pause; a double-click does not", async () => {
    const onOpenRecord = vi.fn();
    page([row("r1", "Bakery", 300)], { onOpenRecord });
    await screen.findByText("Bakery");
    vi.useFakeTimers();
    try {
      const bakery = screen.getByRole("row", { name: "Open Bakery" });
      fireEvent.click(bakery, { detail: 1 });
      expect(onOpenRecord).not.toHaveBeenCalled(); // not yet: it may be the first half of a double-click
      vi.advanceTimersByTime(250);
      expect(onOpenRecord).toHaveBeenCalledWith("deals", "r1");
      onOpenRecord.mockClear();
      fireEvent.click(bakery, { detail: 1 });
      fireEvent.click(bakery, { detail: 2 });
      fireEvent.doubleClick(bakery);
      vi.advanceTimersByTime(250);
      expect(onOpenRecord).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves out a record with no value at all, says so, and shows a nameless one as Untitled", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "", null, { values: { title: null, price: null, status: null } }), row("r3", "", 50)]);
    await screen.findByText("Bakery");
    expect(screen.getByRole("row", { name: "Open Untitled" })).toBeInTheDocument(); // r3: a price, no name; never its id
    expect(screen.queryByRole("row", { name: /r2|r3/ })).toBeNull();
    expect(screen.getAllByRole("row", { name: /^Open / })).toHaveLength(2);
    expect(screen.getByText(/1 empty record left out/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getAllByRole("row", { name: "Open Untitled" })).toHaveLength(2);
  });

  it("never empties a required field: refused beside the cell, in plain words", async () => {
    const user = userEvent.setup();
    const strict = { ...desc, fields: [{ name: "title", kind: "text", required: true }, ...desc.fields.slice(1)] } as unknown as TableDesc;
    const client = fakeClient([row("r1", "Bakery", 300)], strict);
    page([], { table: strict }, client);
    await screen.findByText("Bakery");
    await user.dblClick(within(rowOf("Bakery")).getByText("Bakery"));
    const input = screen.getByRole("textbox", { name: "Title" });
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Title can't be empty.");
    await user.keyboard("{Escape}");
    expect(client.editRecord).not.toHaveBeenCalled();
  });

  it("counts each group over the whole result, not the page", async () => {
    const user = userEvent.setup();
    localStorage.setItem("alpha.rows-per-page", "25");
    page(Array.from({ length: 30 }, (_, i) => row(`r${i}`, `Shop ${i}`, i)));
    await screen.findByText("Showing 1 to 25 of 30");
    await user.click(screen.getByRole("button", { name: "Options for Status" }));
    await user.click(await screen.findByRole("menuitem", { name: "Group by this" }));
    expect(await screen.findByRole("button", { name: /Active\s*30/ })).toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /^Open Shop/ })).toHaveLength(25);
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
  it("is one row: list, view and search on the left; Filter, then ⋮ at the far right, with Sort, Download and Upload inside it", async () => {
    const user = userEvent.setup();
    const onAddFiles = vi.fn();
    const client = page([row("r1", "Bakery", 300)], { onAddFiles });
    await screen.findByText("Bakery");
    const order = [
      screen.getByRole("combobox", { name: "List" }),
      screen.getByRole("combobox", { name: "View" }),
      screen.getByRole("button", { name: "Search" }),
      screen.getByRole("button", { name: "Filter" }),
      screen.getByRole("button", { name: "More" }),
    ];
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[0].closest(".toolbar")).toBe(order[4].closest(".toolbar")); // one row
    const spacer = order[0].closest(".toolbar")!.querySelector(".spacer")!;
    expect(spacer.compareDocumentPosition(order[3]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // Filter is right-aligned
    expect(order[0]).toHaveTextContent("All");
    expect(order[1]).toHaveTextContent("Table");
    expect(screen.queryByRole("button", { name: "Sort" })).toBeNull(); // Sort is in ⋮
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull(); // no file field: Upload is in ⋮
    await user.click(order[2]); // the magnifier opens a box
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveFocus();
    await user.keyboard("{Escape}");
    const files = catchDownloads();
    await user.click(order[4]);
    expect(await screen.findByRole("menuitem", { name: "Sort" })).toBeInTheDocument();
    screen.getByRole("menuitem", { name: "Download 1 record" }).focus();
    await user.keyboard("{ArrowRight}");
    await screen.findByRole("menuitem", { name: "CSV" });
    await user.keyboard("{Enter}"); // CSV, the first, has the focus
    expect(client.exportTable).not.toHaveBeenCalled(); // what is shown, made in the window
    expect(files.map((f) => f.name)).toEqual(["Deals.csv"]);
    expect(await screen.findByText("Downloaded 1 record as Deals.csv.")).toBeInTheDocument();
    await user.click(order[5]);
    await user.click(await screen.findByRole("menuitem", { name: "Upload" }));
    expect(onAddFiles).toHaveBeenCalled();
  });

  it("downloads exactly what is shown: the matching rows, in the columns shown, and says how many", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120), row("r3", "Bagels", 80)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.type(screen.getByRole("textbox", { name: "Search" }), "Ba");
    await user.click(screen.getByRole("button", { name: "Options for Status" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hide" }));
    const files = catchDownloads();
    await user.click(screen.getByRole("button", { name: "More" }));
    (await screen.findByRole("menuitem", { name: "Download 2 records" })).focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menuitem", { name: "Excel" })).toHaveAttribute("aria-disabled", "true"); // the core's Excel is the whole collection
    await user.keyboard("{Enter}"); // CSV, the first, has the focus
    const text = await files[0].blob.text();
    expect(text).toBe("Title,Price\nBakery,300\nBagels,80\n");
    expect(await screen.findByText("Downloaded 2 records as Deals.csv.")).toBeInTheDocument();
  });

  it("always shows the numbers below the toolbar, with no fold, and none when there are no records", async () => {
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    const strip = screen.getByRole("region", { name: "Deals: the numbers" });
    expect(screen.getByRole("button", { name: "More" }).compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /the numbers/ })).toBeNull();
    cleanup();
    page([]);
    await screen.findByText("No records yet.");
    expect(screen.queryByRole("region", { name: "Deals: the numbers" })).toBeNull();
  });

  it("makes Upload the primary action, left of more, when the collection has a file field", async () => {
    const withFile = { ...desc, fields: [...desc.fields, { name: "doc", kind: "file" }] } as unknown as TableDesc;
    const client = fakeClient([row("r1", "Bakery", 300)], withFile);
    render(
      <TooltipProvider>
        <DataPage onOpenRecord={vi.fn()} client={client} table={withFile} version={0} onChanged={vi.fn()} onAddFiles={vi.fn()} />
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
    await openSetting(user, "Layout");
    await user.click(screen.getByRole("combobox", { name: "Layout" }));
    const calendar = screen.getByRole("option", { name: "Calendar" });
    expect(calendar).toHaveAttribute("aria-disabled", "true");
    await user.hover(calendar);
    expect(screen.getByRole("status")).toHaveTextContent("Calendar needs a date field");
    await user.click(calendar);
    expect(screen.getByRole("combobox", { name: "Layout" })).toHaveTextContent("Table"); // nothing changed
    expect(screen.getByRole("option", { name: "Board" })).not.toHaveAttribute("aria-disabled");
  });

  it("filters by a property as a chip that edits its rule, keeps Hide done in the panel, and clears all", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { values: { title: "Cafe", price: 120, status: "Sold" } })]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Filter" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: /Hide done/ })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Status" }));
    await user.click(await screen.findByRole("combobox", { name: "Value for Status" }));
    await user.click(screen.getByRole("option", { name: "Sold" }));
    await waitFor(() => expect(screen.queryByText("Bakery")).toBeNull());
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    const pills = screen.getByLabelText("Active filters");
    expect(within(pills).getByText("Status: Sold")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(within(pills).getByRole("button", { name: "Remove filter: Status: Sold" }));
    expect(screen.getByText("Bakery")).toBeInTheDocument();
    // a number rule, then Clear all
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(await screen.findByRole("menuitem", { name: "Price" }));
    await user.type(await screen.findByRole("textbox", { name: "Value for Price" }), "200{Enter}");
    await waitFor(() => expect(screen.queryByText("Cafe")).toBeNull());
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Active filters")).toBeNull();
  });

  it("the dashboard's 'these records' becomes a table filter, a removable pill named for it", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await pickLayout(user, "Dashboard");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "stub: show these" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Bakery")).toBeNull();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter: Overdue · 1" }));
    expect(screen.getByText("Bakery")).toBeInTheDocument();
  });

  it("lists: Add list opens the list's page over a live preview, saving nothing until Save list", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { values: { title: "Cafe", price: 120, status: "Sold" } })]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Add list" }));
    const form = await screen.findByRole("form", { name: "Add list" });
    expect(screen.queryByRole("dialog")).toBeNull(); // a page, not a pop-up
    await user.click(within(form).getByRole("button", { name: "Add filter" }));
    await user.click(within(form).getByRole("combobox", { name: "Property" }));
    await user.click(screen.getByRole("option", { name: "Status" }));
    await user.click(within(form).getByRole("combobox", { name: "Value for Status" }));
    await user.click(screen.getByRole("option", { name: "Sold" }));
    await waitFor(() => expect(screen.queryByText("Bakery")).toBeNull()); // the preview follows the draft
    expect(within(form).getByRole("button", { name: "Save list" })).toBeDisabled(); // no name yet
    // Cancel drops it all
    await user.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Bakery")).toBeInTheDocument();
    expect(client.saveList).not.toHaveBeenCalled();
    // again, named and saved
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Add list" }));
    await user.type(await screen.findByRole("textbox", { name: "List name" }), "Pipeline");
    await user.click(screen.getByRole("combobox", { name: "Default view" }));
    await user.click(screen.getByRole("option", { name: "Board" }));
    await user.click(screen.getByRole("checkbox", { name: "Make this the default list" }));
    await user.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(client.saveList).toHaveBeenCalledWith("deals", "Pipeline", expect.objectContaining({ view: "board" })));
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("v1", { default: true }));
    expect(await screen.findByLabelText("Active")).toBeInTheDocument(); // the board's column
    expect(screen.getByRole("combobox", { name: "List" })).toHaveTextContent("Pipeline");
    expect(screen.queryByRole("form", { name: "Add list" })).toBeNull();
    // unticked on a later edit: it stops being the default
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit list" }));
    const box = await screen.findByRole("checkbox", { name: "Make this the default list" });
    expect(box).toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("v1", { default: false }));
  });

  it("toolbar changes are temporary: a bar saves them to the list or resets, and nothing writes the list before", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Add list" }));
    await user.type(await screen.findByRole("textbox", { name: "List name" }), "Cheap first{Enter}");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "List" })).toHaveTextContent("Cheap first"));
    expect(screen.queryByRole("button", { name: "Save to this list" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sort ascending" }));
    const names = () => screen.getAllByRole("row").filter((r) => r.getAttribute("tabindex") === "0").map((r) => r.getAttribute("aria-label"));
    expect(names()).toEqual(["Open Cafe", "Open Bakery"]);
    expect(client.updateList).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(names()).toEqual(["Open Bakery", "Open Cafe"]);
    expect(screen.queryByRole("button", { name: "Save to this list" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sort ascending" }));
    await user.click(screen.getByRole("button", { name: "Save to this list" }));
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("v1", { title: "Cheap first", config: expect.objectContaining({ sort: { field: "price", direction: "asc" } }) }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save to this list" })).toBeNull());
  });

  it("a list's ⋮ edits it on the same page; All can't be deleted; a right-click deletes one after a yes", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Add list" }));
    await user.type(await screen.findByRole("textbox", { name: "List name" }), "Pipeline{Enter}");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "List" })).toHaveTextContent("Pipeline"));
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit list" }));
    const name = await screen.findByRole("textbox", { name: "List name" });
    expect(name).toHaveValue("Pipeline");
    await user.clear(name);
    await user.type(name, "Deals to call{Enter}");
    await waitFor(() => expect(client.updateList).toHaveBeenCalledWith("v1", expect.objectContaining({ title: "Deals to call" })));
    // All keeps its table, and can't be deleted
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("option", { name: /^All/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Delete list" })).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("option", { name: /^Deals to call/ }));
    fireEvent.contextMenu(screen.getByRole("combobox", { name: "List" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete list" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete Deals to call?" })).getByRole("button", { name: "Delete list" }));
    await waitFor(() => expect(client.deleteList).toHaveBeenCalledWith("v1"));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "List" })).toHaveTextContent("All"));
  });

  it("keeps several sorts from ⋮ › Sort, for now, with Save as list and Reset on All", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120), row("r3", "Deli", 300)]);
    await screen.findByText("Bakery");
    await openSetting(user, "Sort");
    await user.click(within(screen.getByRole("group", { name: "Sort by" })).getByRole("button", { name: "Price" }));
    await user.click(screen.getByRole("combobox", { name: "Direction" }));
    await user.click(screen.getByRole("option", { name: "Descending" }));
    await user.click(screen.getByRole("button", { name: "Add sort" }));
    await user.click(screen.getAllByRole("combobox", { name: "Direction" })[1]);
    await user.click(screen.getByRole("option", { name: "Descending" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    const names = () => screen.getAllByRole("row").filter((r) => r.getAttribute("tabindex") === "0").map((r) => r.getAttribute("aria-label"));
    expect(names()).toEqual(["Open Deli", "Open Bakery", "Open Cafe"]);
    expect(screen.getByRole("button", { name: "Save as list" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(names()).toEqual(["Open Bakery", "Open Cafe", "Open Deli"]);
    expect(client.setPreference).not.toHaveBeenCalledWith("view_settings", expect.objectContaining({ "deals:all": expect.objectContaining({ sorts: expect.anything() }) }));
  });

  it("groups the table by a field, each group collapsible with its count", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { values: { title: "Cafe", price: 120, status: "Sold" } })]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Options for Status" }));
    await user.click(await screen.findByRole("menuitem", { name: "Group by this" }));
    const sold = await screen.findByRole("button", { name: /Sold\s*1/ });
    expect(sold).toHaveAttribute("aria-expanded", "true");
    await user.click(sold);
    expect(screen.queryByText("Cafe")).toBeNull();
    expect(screen.getByText("Bakery")).toBeInTheDocument();
  });
});

describe("editing a cell", () => {
  it("a double-click edits, clicking away saves with the revision, and Escape cancels", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.dblClick(within(rowOf("Bakery")).getByText("300"));
    let input = screen.getByRole("textbox", { name: "Price" });
    await user.clear(input);
    await user.type(input, "350");
    await user.click(document.body); // clicking away
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 350 }, 3));
    expect(client.editRecord).toHaveBeenCalledTimes(1);

    await within(rowOf("Bakery")).findByText("350");
    await user.dblClick(within(rowOf("Bakery")).getByText("350"));
    input = screen.getByRole("textbox", { name: "Price" });
    await user.clear(input);
    await user.type(input, "999{Escape}");
    expect(screen.queryByRole("textbox", { name: "Price" })).toBeNull();
    expect(client.editRecord).toHaveBeenCalledTimes(1);
    expect(within(rowOf("Bakery")).getByText("350")).toBeInTheDocument();
  });

  it("Enter and F2 start editing from the keyboard, and Enter saves", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    within(rowOf("Bakery")).getByText("300").focus();
    await user.keyboard("{F2}");
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.clear(input);
    await user.type(input, "310{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 310 }, 3));
  });

  it("⌘Z puts the last edit back with the record's current revision, ⇧⌘Z does it again", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await user.dblClick(within(rowOf("Bakery")).getByText("300"));
    const input = screen.getByRole("textbox", { name: "Price" });
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
        <DataPage onOpenRecord={vi.fn()} client={client} table={desc} version={version} onChanged={vi.fn()} />
      </TooltipProvider>
    );
    const { rerender } = render(ui(0));
    await screen.findByText("Bakery");
    await user.dblClick(within(rowOf("Bakery")).getByText("300"));
    const input = screen.getByRole("textbox", { name: "Price" });
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

  it("opens from the keyboard with Shift+F10; Open is always there, since every record has a page", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    rowOf("Bakery").focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    const open = await screen.findByRole("menuitem", { name: "Open" });
    expect(open).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Open", "Edit", "Duplicate", "Copy link", "Pin", "Delete"]);
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
    await user.click(await screen.findByRole("option", { name: /^Average/ })); // the standard dropdown, the current one highlighted
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("footer_summaries", { deals: { price: "average" } }));
    expect(await foot().findByText("210")).toBeInTheDocument();
  });

  it("the footer's ★ makes a calculation the default for every column of that type", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("combobox", { name: "Calculate Price" }));
    await user.click(screen.getByRole("button", { name: "Make Max the default" })); // the star does not choose
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("footer_summaries", { "*": { number: "max" } }));
    expect(await within(document.querySelector("tfoot") as HTMLElement).findByText("300")).toBeInTheDocument();
  });

  it("every column has a footer: 'Calculate' where none is set, and a status counts per group", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120, { values: { title: "Cafe", price: 120, status: "Sold" } })]);
    await screen.findByText("Bakery");
    const cells = [...(document.querySelector("tfoot tr") as HTMLElement).querySelectorAll("td")].slice(0, 3);
    expect(cells.map((c) => c.textContent)).toEqual(["Calculate", "Sum 420", "Calculate"]);
    await user.click(within(cells[2]).getByRole("combobox", { name: "Calculate Status" }));
    expect(screen.getByRole("option", { name: /^None/ })).toHaveAttribute("aria-selected", "true");
    await user.click(await screen.findByRole("option", { name: /^Count per group/ }));
    expect(await within(document.querySelector("tfoot") as HTMLElement).findByText("Active 1 · Sold 1")).toBeInTheDocument();
  });

  it("a column can be sorted and frozen from its menu; Rename says what to do instead", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sort ascending" }));
    const names = () => screen.getAllByRole("row").filter((r) => r.getAttribute("tabindex") === "0").map((r) => r.getAttribute("aria-label"));
    expect(names()).toEqual(["Open Cafe", "Open Bakery"]);
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    await user.click(await screen.findByRole("menuitem", { name: "Freeze up to here" }));
    expect(document.querySelectorAll("th.col--frozen").length).toBe(2); // Title and Price; no checkbox column
    await user.click(screen.getByRole("button", { name: "Options for Price" }));
    expect(await screen.findByRole("menuitem", { name: "Insert left" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Wrap text" })).toHaveAttribute("aria-checked", "false"); // a switch, not a tick
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Wrap text" }));
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
  it("opens a new record's own page and makes nothing first", async () => {
    const user = userEvent.setup();
    const onOpenRecord = vi.fn();
    const client = page([row("r1", "Bakery", 300)], { onOpenRecord });
    await screen.findByText("Bakery");
    expect(screen.queryByRole("textbox", { name: /in a sentence/ })).toBeNull(); // the sentence goes to the panel now
    await user.click(screen.getByRole("button", { name: "New" }));
    expect(onOpenRecord).toHaveBeenCalledWith("deals", "new");
    expect(client.addRecord).not.toHaveBeenCalled();
  });

  it("opens the new record's own page whenever records have pages, making nothing first", async () => {
    const user = userEvent.setup();
    const onOpenRecord = vi.fn();
    const client = fakeClient([row("r1", "Bakery", 300)]);
    page([], { onOpenRecord }, client);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("button", { name: "New" }));
    await waitFor(() => expect(onOpenRecord).toHaveBeenCalledWith("deals", "new"));
    expect(client.addRecord).not.toHaveBeenCalled();
  });

  it("conditional colour colours at once and says what it did", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await openSetting(user, "Conditional colour");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getAllByText("Rows coloured by Status.").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(rowOf("Bakery")).toHaveClass("tone--info"); // Status is Active, the first choice
  });

  it("a hidden property keeps its place in Properties, its eye shut", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await openSetting(user, "Properties");
    const names = () => [...document.querySelectorAll(".vset__prop .vset__name")].map((n) => n.textContent);
    const before = names();
    await user.click(screen.getByRole("button", { name: "Hide Price" }));
    expect(names()).toEqual(before);
    expect(screen.getByRole("button", { name: "Show Price" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Search" }));
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

  it("a person in a relation opens the person's page in Network", async () => {
    const user = userEvent.setup();
    const withOwner: TableDesc = { ...desc, fields: [...desc.fields, { name: "owner", kind: "relation", relation: "person" }] };
    const sold = row("r1", "Bakery", 300, { values: { title: "Bakery", price: 300, status: "Active", owner: "e1" } });
    const client = fakeClient([sold]);
    client.table = vi.fn(async () => ({ table: withOwner, records: [sold], files: {}, lists: [], relations: { owner: { e1: "Ana" } } }));
    render(
      <TooltipProvider>
        <DataPage client={client} table={withOwner} version={0} onChanged={vi.fn()} onOpenRecord={vi.fn()} />
      </TooltipProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Ana" }));
    expect(window.location.hash).toBe("#/network/e1");
  });

  it("the form view shows one record at a time with next and previous", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await pickLayout(user, "Form");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "Record 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous record" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next record" }));
    expect(screen.getByRole("region", { name: "Record 2 of 2" })).toHaveTextContent("Cafe");
    expect(screen.getByRole("button", { name: "Next record" })).toBeDisabled();
  });

  it("the form view's record opens its own page", async () => {
    const user = userEvent.setup();
    const onOpenRecord = vi.fn();
    page([row("r1", "Bakery", 300)], { onOpenRecord });
    await screen.findByText("Bakery");
    await pickLayout(user, "Form");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Open Bakery" }));
    expect(onOpenRecord).toHaveBeenCalledWith("deals", "r1");
  });
});

describe("any source", () => {
  it("draws rows the window holds, shows no add row when it can't add inline, and its lists in the window", async () => {
    const user = userEvent.setup();
    const client = fakeClient([]);
    const source = memorySource({ client, key: "agents", title: "Agents", fields: [{ name: "name", kind: "text" }, { name: "runs", kind: "number" }], rows: () => [row("a1", "", 4, { values: { name: "Alpha", runs: 4 } })], reasons: { add: "Ask Alpha to make an agent." } });
    render(
      <TooltipProvider>
        <DataPage onOpenRecord={vi.fn()} client={client} source={source} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(client.table).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull(); // no inline add: no add row (rule 29)
    await user.dblClick(screen.getByText("Alpha"));
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull(); // no edit given: cells stay as they are
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Add list" }));
    await user.type(await screen.findByRole("textbox", { name: "List name" }), "Busy ones");
    await user.click(screen.getByRole("button", { name: "Save list" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("window_lists", { agents: [expect.objectContaining({ title: "Busy ones" })] }));
  });
});

describe("Notion's grid, bulk edit and per-row abilities", () => {
  it("arrows move between cells, ⇧↓ selects down a column and ⌘D fills it from the top", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    const top = within(rowOf("Bakery")).getByText("300").closest("td")!;
    top.focus();
    await user.keyboard("{ArrowDown}");
    expect(within(rowOf("Cafe")).getByText("120").closest("td")).toHaveFocus();
    await user.keyboard("{ArrowUp}{Shift>}{ArrowDown}{/Shift}");
    expect(document.querySelectorAll("td.cell--range").length).toBe(2);
    await user.keyboard("{Meta>}d{/Meta}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r2", { price: 300 }, 3));
  });

  it("Edit property sets one field on every selected record", async () => {
    const user = userEvent.setup();
    const client = page([row("r1", "Bakery", 300), row("r2", "Cafe", 120)]);
    await screen.findByText("Bakery");
    await user.click(screen.getByRole("checkbox", { name: "Select Bakery" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Cafe" }));
    await user.click(screen.getByRole("button", { name: "Edit property" }));
    await user.click(screen.getByRole("combobox", { name: "Property to change" }));
    await user.click(screen.getByRole("option", { name: "Price" }));
    await user.type(screen.getByRole("textbox", { name: "New value" }), "5");
    await user.click(screen.getByRole("button", { name: "Apply to 2" }));
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledTimes(2));
    expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 5 }, 3);
  });

  it("has no peek: records open as their page, and Layout offers nowhere else", async () => {
    const user = userEvent.setup();
    page([row("r1", "Bakery", 300)]);
    await screen.findByText("Bakery");
    await openSetting(user, "Layout");
    expect(screen.queryByRole("combobox", { name: "Open records in" })).toBeNull();
  });

  it("a source's row icon sits on the title, and a cell it can't change says why and never opens", async () => {
    const user = userEvent.setup();
    const client = fakeClient([]);
    const edit = vi.fn();
    const source = memorySource({ client, key: "agents", title: "Agents", fields: [{ name: "name", kind: "text" }, { name: "runs", kind: "number" }], rows: () => [row("a1", "", 4, { values: { name: "Alpha", runs: 4 } })], edit, rowIcon: () => <i>avatar</i>, editable: (_r, f) => (f.name === "runs" ? "Counted by Alpha." : null) });
    render(
      <TooltipProvider>
        <DataPage onOpenRecord={vi.fn()} client={client} source={source} version={0} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("avatar")).toBeInTheDocument();
    const runs = within(screen.getByRole("row", { name: "Open Alpha" })).getByText("4").closest("td")!;
    expect(runs).toHaveAttribute("title", "Counted by Alpha.");
    await user.dblClick(runs);
    expect(screen.queryByRole("textbox", { name: "Runs" })).toBeNull();
    await user.dblClick(screen.getByText("Alpha"));
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });
});

describe("the breadcrumb", () => {
  it("drops a last crumb named as the tab after it (no 'Deals · Deals')", async () => {
    const { dedupeCrumbs } = await import("./crumbs");
    expect(dedupeCrumbs([{ label: "Avilo" }, { label: "Deals" }], "Deals").map((c) => c.label)).toEqual(["Avilo"]);
    expect(dedupeCrumbs([{ label: "Avilo" }, { label: "Deals" }], "Leads").map((c) => c.label)).toEqual(["Avilo", "Deals"]);
  });
});
