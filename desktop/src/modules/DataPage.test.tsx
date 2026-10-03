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
