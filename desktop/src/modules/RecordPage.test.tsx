import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, JournalEntry, RecordRow, TableDesc } from "../core/client";
import { forgetPreferences } from "../core/preferences";
import { TooltipProvider } from "../ui";
import { RecordPage, type LeaveGuard } from "./RecordPage";

const desc = {
  name: "deals",
  title: "Deals",
  module: "m_1",
  title_field: "title",
  records: 1,
  fields: [
    { name: "title", kind: "text", required: true },
    { name: "price", kind: "number", unit: "USD" },
    { name: "status", kind: "status", choices: ["Active", "Sold"], done_choices: ["Sold"] },
    { name: "opened", kind: "date", required: true },
    { name: "notes_text", kind: "long_text", label: "What happened" },
  ],
} as unknown as TableDesc;
const row: RecordRow = { id: "r1", revision: 3, values: { title: "Bakery", price: 350, status: "Active", opened: "2026-09-01" }, created_at: "2026-10-01T08:00:00+00:00", updated_at: "2026-10-02T09:30:00+00:00", provenance: { by: "person" } };
const edit: JournalEntry = { id: "j1", at: "2026-10-02T09:30:00", kind: "changed", actor: "person", text: "You changed price in Deals.", data: { collection: "deals", record: "r1", before: { price: 300 }, after: { price: 350 } }, module: "m_1", thread: null, entity_ids: [], source: null };
const other: JournalEntry = { ...edit, id: "j2", data: { collection: "deals", record: "r9", before: { price: 1 }, after: { price: 2 } } };

function setup({ id = "r1", sections, entries = [edit, other] }: { id?: string; sections?: string[]; entries?: JournalEntry[] } = {}) {
  const fake = {
    record: vi.fn(async () => ({ table: desc, record: row, relations: {} })),
    module: vi.fn(async () => ({ tables: [desc] })),
    activity: vi.fn(async () => entries),
    editRecord: vi.fn(async (_t: string, _id: string, values: Record<string, unknown>) => ({ ...row, revision: 4, values: { ...row.values, ...values } })),
    addRecord: vi.fn(async () => ({ ...row, id: "r2" })),
    deleteRecord: vi.fn(async () => ({ removed: "r1" })),
    preference: vi.fn(async (key: string) => ({ key, value: key === "record_sections" && sections ? { deals: sections } : null })),
    setPreference: vi.fn(async () => ({})),
    intelligence: vi.fn(async () => ({ knowledge: { facts: [], notes: [], goals: [] } })),
    writeNote: vi.fn(async () => ({})),
  };
  const client = fake as unknown as Client;
  const onGo = vi.fn();
  let guard: LeaveGuard | null = null;
  render(
    <TooltipProvider>
      <RecordPage client={client} module="m_1" table="deals" id={id} version={0} modules={[{ id: "m_1", name: "Sales", tables: [{ name: "deals", title: "Deals", module: "m_1", records: 1 }] } as never]} onGo={onGo} onChanged={vi.fn()} onGuard={(g) => { guard = g; }} />
    </TooltipProvider>,
  );
  return { client: fake, onGo, guard: () => guard };
}

beforeEach(() => forgetPreferences());

describe("a record's page", () => {
  it("shows the type, the title and every field, labelled and editable", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Bakery" })).toBeInTheDocument();
    expect(screen.getByText("Deal")).toBeInTheDocument(); // the eyebrow
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Bakery");
    expect(screen.getByLabelText(/^Price/)).toHaveValue(350);
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Active");
    expect(screen.getByLabelText(/^Opened/)).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("What happened")).toHaveValue("");
    expect(screen.getByLabelText("What happened")).toHaveAttribute("placeholder", "Unknown");
    expect(screen.getAllByText("Last changed").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Sales" })).toBeInTheDocument(); // Back, named for the project
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("DealsBakery");
  });

  it("saves a changed field once when it is left, with the revision, and says Saved beside it", async () => {
    const user = userEvent.setup();
    const { client, guard } = setup();
    const price = await screen.findByLabelText(/^Price/);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    await user.clear(price);
    await user.type(price, "400");
    expect(client.editRecord).not.toHaveBeenCalled(); // typing is not leaving
    await user.tab();
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledTimes(1));
    expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 400 }, 3);
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    await user.click(price);
    await user.tab(); // left again, unchanged since the save
    expect(client.editRecord).toHaveBeenCalledTimes(1);
    expect(guard()).toBeNull(); // nothing is held, so leaving the page asks nothing
  });

  it("does not save a field left unchanged", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    const title = await screen.findByLabelText(/^Title/);
    await user.click(title);
    await user.tab();
    await user.type(title, "!");
    await user.type(title, "{Backspace}");
    await user.tab();
    expect(client.editRecord).not.toHaveBeenCalled();
  });

  it("Enter saves a one-line field, and the next write carries the revision the last one returned", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await user.type(await screen.findByLabelText(/^Title/), "!{Enter}");
    const price = screen.getByLabelText(/^Price/);
    await user.type(price, "5");
    await user.tab();
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledTimes(2));
    expect(client.editRecord).toHaveBeenNthCalledWith(1, "deals", "r1", { title: "Bakery!" }, 3);
    expect(client.editRecord).toHaveBeenNthCalledWith(2, "deals", "r1", { price: 3505 }, 4);
  });

  it("a field that can't be saved keeps the input and says why beside it", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    client.editRecord.mockRejectedValueOnce(new Error("'price' must be a number; got 'x'."));
    const price = await screen.findByLabelText(/^Price/);
    await user.type(price, "5");
    await user.tab();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("'price' must be a number");
    expect(price.closest(".recfield")).toContainElement(alert);
    expect(price).toHaveValue(3505);
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("a new record starts with defaults and the first field left with a value adds it, then opens it", async () => {
    const user = userEvent.setup();
    const { client, onGo } = setup({ id: "new" });
    expect(await screen.findByRole("heading", { name: "New Deal" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Active"); // the first status
    expect(screen.getByLabelText(/^Opened/)).not.toHaveValue(""); // today, for a required date
    expect(client.record).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText(/^Price/));
    await user.tab(); // left empty: nothing is made
    expect(client.addRecord).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Title/), "Florist");
    await user.tab();
    await waitFor(() => expect(client.addRecord).toHaveBeenCalledTimes(1));
    const [table, values] = client.addRecord.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(table).toBe("deals");
    expect(values).toMatchObject({ title: "Florist", status: "Active" });
    expect(values.price).toBeUndefined();
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "record", module: "m_1", table: "deals", id: "r2" }));
  });

  it("a just-edited record shows Save and a quiet Saved, then when it was saved", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    const price = await screen.findByLabelText(/^Price/);
    expect(screen.queryByRole("region", { name: "Saving" })).toBeNull();
    await user.type(price, "1");
    const bar = screen.getByRole("region", { name: "Saving" });
    expect(bar).toHaveTextContent("Not saved yet");
    expect(within(bar).queryByRole("button", { name: "Cancel" })).toBeNull(); // not made in this visit
    await user.click(within(bar).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 3501 }, 3));
    expect(within(bar).getByRole("status")).toHaveTextContent(/^Saved$/);
  });

  it("More › Delete confirms, says what happens, then goes back to the collection", async () => {
    const user = userEvent.setup();
    const { client, onGo } = setup();
    await screen.findByRole("heading", { name: "Bakery" });
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Bakery?" });
    expect(dialog).toHaveTextContent("leaves Deals");
    expect(client.deleteRecord).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledWith("deals", "r1", 3));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m_1" }));
  });

  it("History lists this record's changes from the journal, and Undo saves the old value at once", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await screen.findByRole("heading", { name: "Bakery" });
    await waitFor(() => expect(client.activity).toHaveBeenCalledWith({ module: "m_1", limit: 500 }));
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "History" }));
    const dialog = await screen.findByRole("dialog", { name: "History" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(1); // the other record's change is not here
    expect(dialog).toHaveTextContent("You");
    expect(dialog).toHaveTextContent("2 Oct, 09:30");
    expect(dialog).toHaveTextContent("300 USD → 350 USD");
    await user.click(within(dialog).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 300 }, 3));
    expect(await within(dialog).findByText("Undone")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.getByLabelText(/^Price/)).toHaveValue(300);
  });

  it("⌘Z undoes the last change and ⇧⌘Z redoes it, each saved", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await screen.findByRole("heading", { name: "Bakery" });
    await waitFor(() => expect(client.activity).toHaveBeenCalled());
    await user.keyboard("{Meta>}z{/Meta}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 300 }, 3));
    await waitFor(() => expect(client.activity).toHaveBeenCalledTimes(2)); // the history is read again
    await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 350 }, 4));
  });

  it("shows the sections the collection's preference names, and all three by default", async () => {
    setup();
    await screen.findByRole("heading", { name: "Bakery" });
    for (const name of ["Notes", "Intelligence", "Governance"]) expect(screen.getByRole("region", { name })).toBeInTheDocument();
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Intelligence" })).getByText("You changed price in Deals.")).toBeInTheDocument(); // the journal names this record
  });

  it("says so, with 'yet', when the sections have nothing", async () => {
    setup({ entries: [] });
    await screen.findByRole("heading", { name: "Bakery" });
    expect(screen.getByText("Alpha knows nothing about this record yet.")).toBeInTheDocument();
  });

  it("shows only the chosen sections", async () => {
    setup({ sections: ["governance"] });
    await screen.findByRole("heading", { name: "Bakery" });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Notes" })).toBeNull());
    expect(screen.getByRole("region", { name: "Governance" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Intelligence" })).toBeNull();
  });
});
