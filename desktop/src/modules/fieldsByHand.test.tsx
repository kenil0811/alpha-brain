import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoreError, type Client, type RecordRow, type TableDesc } from "../core/client";
import { DataPage } from "./DataPage";

const desc = { name: "sites", title: "Sites", module: "m_c", title_field: "address", records: 1, fields: [{ name: "address", kind: "text" }, { name: "photo", kind: "file" }] } as unknown as TableDesc;
const row: RecordRow = { id: "r1", revision: 1, values: { address: "1 Main St" }, created_at: "2026-10-13T08:00:00Z", updated_at: "2026-10-13T08:00:00Z", provenance: {} };

function core() {
  return {
    table: vi.fn(async () => ({ table: desc, records: [row], files: {}, lists: [] })),
    preference: vi.fn(async (key: string) => ({ key, value: null })),
    setPreference: vi.fn(async () => ({})),
    addField: vi.fn(async () => desc),
    renameField: vi.fn(async () => desc),
    addRecord: vi.fn(async () => ({ ...row, id: "r2" })),
    addFiles: vi.fn(async () => ({ documents: [], turn: null })),
  };
}
const page = (c: ReturnType<typeof core>, onChanged = vi.fn()) => render(<DataPage client={c as unknown as Client} table={desc} version={0} onChanged={onChanged} onOpenRecord={vi.fn()} />);

describe("fields by hand (slice 2)", () => {
  it("adds a status field with its options and which mean done, from the + at the header's end", async () => {
    const c = core();
    const onChanged = vi.fn();
    page(c, onChanged);
    await screen.findByText("1 Main St");
    fireEvent.click(screen.getByRole("button", { name: "Add a field" }));
    const form = await screen.findByRole("dialog", { name: "Add a field" });
    fireEvent.change(within(form).getByRole("textbox", { name: "The field's name" }), { target: { value: "Stage" } });
    fireEvent.change(within(form).getByRole("combobox", { name: "The field's kind" }), { target: { value: "status" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "The options, one per line" }), { target: { value: "Looking\nOffer made\nBought" } });
    fireEvent.click(within(form).getByRole("checkbox", { name: "Bought" }));
    fireEvent.click(within(form).getByRole("button", { name: "Add field" }));
    await waitFor(() => expect(c.addField).toHaveBeenCalledWith("sites", { label: "Stage", kind: "status", choices: ["Looking", "Offer made", "Bought"], done_choices: ["Bought"] }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("says why a field couldn't be added, beside the form", async () => {
    const c = core();
    c.addField.mockRejectedValueOnce(new CoreError("This table has a field called 'address' already.", 400));
    page(c);
    await screen.findByText("1 Main St");
    fireEvent.click(screen.getByRole("button", { name: "Add a field" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "The field's name" }), { target: { value: "address" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This table has a field called 'address' already.");
  });

  it("renames a column from its menu", async () => {
    const c = core();
    page(c);
    await screen.findByText("1 Main St");
    fireEvent.click(screen.getByRole("button", { name: "Filter Address" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename…" }));
    const box = screen.getByRole("textbox", { name: "New name for Address" });
    fireEvent.change(box, { target: { value: "Street address" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(c.renameField).toHaveBeenCalledWith("sites", "address", "Street address"));
  });

  it("takes a file on a row not yet saved: the row first, then the file on it", async () => {
    const c = core();
    page(c);
    await screen.findByText("1 Main St");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const form = screen.getByRole("form", { name: "Add to Sites" });
    fireEvent.change(within(form).getByLabelText("Address (optional)"), { target: { value: "2 Oak Ave" } });
    const file = new File(["jpeg"], "front.jpg", { type: "image/jpeg" });
    fireEvent.change(within(form).getByLabelText("Photo (optional)"), { target: { files: [file] } });
    fireEvent.click(within(form).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(c.addFiles).toHaveBeenCalledWith([file], { table: "sites", record: "r2", field: "photo" }));
    expect(c.addRecord).toHaveBeenCalledWith("sites", { address: "2 Oak Ave" });
  });
});
