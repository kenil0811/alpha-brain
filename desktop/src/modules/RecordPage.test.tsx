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
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Sales");
  });

  it("holds edits until Save, then writes only what changed with the revision", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    const price = await screen.findByLabelText(/^Price/);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await user.clear(price);
    await user.type(price, "400");
    expect(client.editRecord).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledTimes(1));
    expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 400 }, 3);
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("Discard puts the saved values back", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, " and more");
    expect(title).toHaveValue("Bakery and more");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(title).toHaveValue("Bakery");
    expect(client.editRecord).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("shows a refusal under the field it names and keeps the edits", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    client.editRecord.mockRejectedValueOnce(new Error("'price' must be a number; got 'x'."));
    const price = await screen.findByLabelText(/^Price/);
    await user.type(price, "5");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("'price' must be a number");
    expect(price).toHaveValue(3505);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("asks before leaving with changes: Stay keeps them, Discard lets the window go", async () => {
    const user = userEvent.setup();
    const { guard } = setup();
    const title = await screen.findByLabelText(/^Title/);
    const proceed = vi.fn();
    expect(guard()!(proceed)).toBe(false); // nothing changed: the page lets it go
    await user.type(title, "!");
    expect(guard()!(proceed)).toBe(true);
    const dialog = await screen.findByRole("dialog", { name: "Save your changes?" });
    expect(dialog).toHaveTextContent("Title");
    await user.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(proceed).not.toHaveBeenCalled();
    expect(title).toHaveValue("Bakery!");
    guard()!(proceed);
    const again = await screen.findByRole("dialog", { name: "Save your changes?" });
    await user.click(within(again).getByRole("button", { name: "Discard" }));
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("saves from the leaving dialog, then lets the window go", async () => {
    const user = userEvent.setup();
    const { guard, client } = setup();
    await user.type(await screen.findByLabelText(/^Title/), "!");
    const proceed = vi.fn();
    guard()!(proceed);
    const dialog = await screen.findByRole("dialog", { name: "Save your changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { title: "Bakery!" }, 3);
  });

  it("a new record starts with defaults and Save adds it, then opens it", async () => {
    const user = userEvent.setup();
    const { client, onGo } = setup({ id: "new" });
    expect(await screen.findByRole("heading", { name: "New Deal" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Active"); // the first status
    expect(screen.getByLabelText(/^Opened/)).not.toHaveValue(""); // today, for a required date
    expect(client.record).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Title/), "Florist");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.addRecord).toHaveBeenCalledTimes(1));
    const [table, values] = client.addRecord.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(table).toBe("deals");
    expect(values).toMatchObject({ title: "Florist", status: "Active" });
    expect(values.price).toBeUndefined();
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "record", module: "m_1", table: "deals", id: "r2" }));
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

  it("History lists this record's changes from the journal, and Undo puts the old value in the form", async () => {
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
    expect(client.editRecord).not.toHaveBeenCalled(); // held in the form
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.getByLabelText(/^Price/)).toHaveValue(300);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("deals", "r1", { price: 300 }, 3));
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
