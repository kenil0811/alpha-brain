/** The desktop conventions of a table: a click opens a row, a double click edits a value, and a
 * star in the List and View pickers sets what the table opens on. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, TableData } from "../core/client";
import { ToastProvider } from "../ui";
import { DataViews } from "./DataViews";
import { listsKey } from "./useSavedViews";

const DATA: TableData = {
  table: {
    name: "openings",
    title: "Openings",
    module: null,
    title_field: "role",
    records: 1,
    fields: [
      { name: "role", kind: "text" },
      { name: "stage", kind: "status", choices: ["applied", "interview"] },
      { name: "cv", kind: "file" },
    ],
  } as TableData["table"],
  records: [{ id: "r1", revision: 1, values: { role: "Designer", stage: "applied", cv: "d1" }, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", provenance: {} }],
  files: { d1: { id: "d1", name: "cv.pdf", path: "/tmp/cv.pdf", size: 2048, kind: "pdf" } },
};

function setup() {
  const editRecord = vi.fn(async () => ({}));
  const client = { table: async () => DATA, editRecord } as unknown as Client;
  const view = render(<DataViews client={client} table={DATA.table} version={0} onChanged={() => undefined} />);
  return { editRecord, view };
}

beforeEach(() => localStorage.clear());

describe("DataViews", () => {
  it("says Undo is coming soon on ⌘Z", async () => {
    const user = userEvent.setup();
    const client = { table: async () => DATA } as unknown as Client;
    render(
      <ToastProvider>
        <DataViews client={client} table={DATA.table} version={0} onChanged={() => undefined} />
      </ToastProvider>,
    );
    await screen.findByText("Designer");
    await user.keyboard("{Meta>}z{/Meta}");
    expect(await screen.findByText("Undo is coming soon.")).toBeInTheDocument();
  });

  it("opens a row on a single click", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText("Designer"));
    expect(await screen.findByRole("complementary", { name: "Designer" })).toBeInTheDocument();
  });

  it("shows a file field's document, and a double click doesn't turn it into text", async () => {
    const user = userEvent.setup();
    setup();
    const doc = await screen.findByRole("button", { name: "cv.pdf" });
    await user.dblClick(doc);
    expect(screen.queryByRole("textbox", { name: "Cv" })).not.toBeInTheDocument();
  });
  it("edits a cell on a double click: Enter saves, Escape cancels, and the row stays shut", async () => {
    const user = userEvent.setup();
    const { editRecord } = setup();
    await user.dblClick(await screen.findByText("Designer"));
    const box = screen.getByRole("textbox", { name: "Role" });
    await user.clear(box);
    await user.type(box, "Lead designer{Enter}");
    await waitFor(() => expect(editRecord).toHaveBeenCalledWith("openings", "r1", { role: "Lead designer" }, 1));

    await user.dblClick(screen.getByText("Designer"));
    await user.type(screen.getByRole("textbox", { name: "Role" }), "x{Escape}");
    expect(screen.queryByRole("textbox", { name: "Role" })).not.toBeInTheDocument();
    expect(editRecord).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("stars a list and a view as the default without picking them, opens on them, and clears them", async () => {
    localStorage.setItem(listsKey("openings"), JSON.stringify([{ id: "l1", title: "Hot", config: { kind: "table" }, is_default: false }]));
    const user = userEvent.setup();
    const { view } = setup();
    await screen.findByText("Designer");
    await user.click(screen.getByRole("button", { name: "List" }));
    const star = screen.getByRole("button", { name: "Make Hot the default" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await user.click(star);
    expect(star).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "List" })).toHaveTextContent("All rows");
    await user.keyboard("{Escape}");

    view.unmount();
    setup();
    await screen.findByText("Designer");
    expect(screen.getByRole("button", { name: "List" })).toHaveTextContent("Hot");
    await user.click(screen.getByRole("button", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Make Hot the default" }));
    expect(screen.getByRole("button", { name: "Make Hot the default" })).toHaveAttribute("aria-pressed", "false");
    expect(JSON.parse(localStorage.getItem("alpha.dv.openings.defaults")!).list).toBeUndefined();
    await user.keyboard("{Escape}");

    // A view kind, on All rows.
    await user.click(screen.getByRole("button", { name: "List" }));
    await user.click(screen.getByRole("option", { name: "All rows" }));
    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(screen.getByRole("button", { name: "Make Board the default" }));
    expect(screen.getByRole("button", { name: "View" })).toHaveTextContent("Table");
  });

  it("opens on the starred view kind", async () => {
    localStorage.setItem("alpha.dv.openings.defaults", JSON.stringify({ kind: "board" }));
    setup();
    await screen.findByText("Designer");
    await waitFor(() => expect(screen.getByRole("button", { name: "View" })).toHaveTextContent("Board"));
  });
});
