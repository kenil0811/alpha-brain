import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, Part, RecordRow, TableDesc } from "../core/client";
import { TooltipProvider } from "../ui";
import { RecordPage } from "./RecordPage";

const sites: TableDesc = { name: "car_wash_sites", title: "car_wash_sites", module: "m1", title_field: "address", records: 1, fields: [{ name: "address", kind: "text" }, { name: "households_3mi", kind: "number" }, { name: "traffic_aadt", kind: "number" }] };
const site: RecordRow = {
  id: "r1", revision: 4, created_at: "2026-10-11T17:59:00+00:00", updated_at: "2026-10-11T19:29:00+00:00",
  values: { address: "1600 S Lamar Blvd", households_3mi: null, traffic_aadt: 37900 },
  provenance: { by: "alpha", fields: { traffic_aadt: { source: "Travis County GIS", fetched_at: "2026-10-11T19:00:00+00:00", part: "traffic" }, households_3mi: { problem: "Census API key required", part: "households" } } },
  seen_at: null, gone_at: null, entity: null,
};
const parts: Part[] = [
  { id: "households", step: "s1", title: "Households within 3 miles", reads: { thing: "site", fields: ["address"] }, fills: { thing: "sites", fields: ["households_3mi"] }, when: "added", reaches: [] },
  { id: "memo", step: "s2", title: "Write the memo", reads: { thing: "site", fields: [] }, fills: { thing: "sites", fields: [] }, when: "asked", reaches: [] },
];

function mount(table: TableDesc = sites) {
  const client = {
    record: vi.fn(async () => ({ table, record: site, relations: {}, note: null as null | { id: string; scope: string; title: string; body: string; updated_at: string } })),
    recordHistory: vi.fn(async (_t: string, _id: string, before?: number) =>
      before === undefined
        ? { changes: [
            { revision: 4, at: "2026-10-11T19:29:00+00:00", by: { by: "alpha", fields: { traffic_aadt: { part: "traffic" } } }, fields: [{ field: "traffic_aadt", before: 30403, after: 37900 }] },
            { revision: 3, at: "2026-10-11T18:00:00+00:00", by: { by: "person" }, fields: [{ field: "address", before: "1600 Lamar", after: "1600 S Lamar" }] },
          ], more: true, added: null }
        : { changes: [{ revision: 2, at: "2026-10-11T17:59:00+00:00", by: { by: "alpha", reader: "census_sites" }, fields: [{ field: "households_3mi", before: 1, after: null }] }], more: false, added: { at: "2026-10-11T17:59:00+00:00", by: { by: "alpha", reader: "census_sites" } } }),
    writeNote: vi.fn(async () => ({})),
    parts: vi.fn(async () => parts),
    editRecord: vi.fn(async (_t: string, _id: string, values: Record<string, unknown>) => ({ ...site, revision: 5, values: { ...site.values, ...values } })),
    deleteRecord: vi.fn(async () => ({ removed: "r1" })),
    runPart: vi.fn(async () => ({ ok: true, exit: 0, output: "" })),
  };
  const onGo = vi.fn();
  render(
    <TooltipProvider>
      <RecordPage client={client as unknown as Client} table={table.name} id="r1" version={0} onChanged={vi.fn()} onGo={onGo} />
    </TooltipProvider>,
  );
  return { client, onGo };
}

describe("a record's own page", () => {
  it("names its table on the way back, shows its title and dates, and where each value came from", async () => {
    const user = userEvent.setup();
    const { onGo } = mount();
    expect(await screen.findByRole("heading", { level: 1, name: "1600 S Lamar Blvd" })).toBeInTheDocument();
    expect(screen.getByText(/^Added .* · last changed /)).toBeInTheDocument();
    expect(screen.getByText(/from Travis County GIS/)).toBeInTheDocument();
    expect(screen.getByText(/not filled: Census API key required/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Car wash sites" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1", table: "car_wash_sites" });
  });

  it("offers the parts run when asked and Try again for one that could not fill", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const acts = await screen.findByRole("group", { name: "What Alpha can do" });
    expect(within(acts).getAllByRole("button").map((b) => b.textContent)).toEqual(["Write the memo", "Try again: Households within 3 miles"]);
    await user.click(within(acts).getByRole("button", { name: "Try again: Households within 3 miles" }));
    await waitFor(() => expect(client.runPart).toHaveBeenCalledWith("m1", "households", "r1"));
  });

  it("edits a value in place with the record's revision, the title among them", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    await screen.findByRole("heading", { level: 1, name: "1600 S Lamar Blvd" });
    expect(screen.getByRole("rowheader", { name: "Address" })).toBeInTheDocument();
    await user.dblClick(screen.getByText("37,900"));
    const input = screen.getByRole("spinbutton", { name: "Traffic aadt" });
    await user.clear(input);
    await user.type(input, "38000{Enter}");
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("car_wash_sites", "r1", { traffic_aadt: 38000 }, 4));
  });

  it("asks before removing, then goes back to its table", async () => {
    const user = userEvent.setup();
    const { client, onGo } = mount();
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByRole("dialog", { name: "Remove 1600 S Lamar Blvd?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove it" }));
    await waitFor(() => expect(client.deleteRecord).toHaveBeenCalledWith("car_wash_sites", "r1", 4));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1", table: "car_wash_sites" });
  });

  it("a module's own read-only table offers no Remove and no part buttons", async () => {
    mount({ ...sites, readonly: true });
    expect(await screen.findByText("Built by the module · read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("group", { name: "What Alpha can do" })).toBeNull();
  });

  it("shows its history newest first, who and what changed, with Show older to the record's start", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const history = (await screen.findByRole("heading", { name: "History" })).closest(".section") as HTMLElement;
    expect(await within(history).findByText("Traffic aadt: 30,403 → 37,900")).toBeInTheDocument();
    expect(within(history).getByText("You")).toBeInTheDocument();
    expect(within(history).getByText("Address: 1600 Lamar → 1600 S Lamar")).toBeInTheDocument();
    await user.click(within(history).getByRole("button", { name: "Show older" }));
    expect(await within(history).findByText("Reader Census sites")).toBeInTheDocument();
    expect(client.recordHistory).toHaveBeenLastCalledWith("car_wash_sites", "r1", 3);
    expect(within(history).getByText("Added")).toBeInTheDocument();
    expect(within(history).queryByRole("button", { name: "Show older" })).toBeNull();
  });

  it("Undo puts back what a change replaced, only while the field still holds what it wrote", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const history = (await screen.findByRole("heading", { name: "History" })).closest(".section") as HTMLElement;
    await within(history).findByText("Traffic aadt: 30,403 → 37,900");
    const [latest, older] = within(history).getAllByRole("button", { name: "Undo" });
    expect(older).toBeDisabled(); // the address changed again since: undo the later change first
    expect(older).toHaveAttribute("title", "Changed again since; undo the later change first.");
    await user.click(latest);
    await waitFor(() => expect(client.editRecord).toHaveBeenCalledWith("car_wash_sites", "r1", { traffic_aadt: 30403 }, 4));
  });

  it("keeps the person's note: Write opens the box, Save writes it on the record", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const notes = (await screen.findByRole("heading", { name: "Notes" })).closest(".section") as HTMLElement;
    expect(within(notes).getByText("No notes yet.")).toBeInTheDocument();
    await user.click(within(notes).getByRole("button", { name: "Write" }));
    await user.type(within(notes).getByRole("textbox", { name: "Your note on this record" }), "Ask about the lease");
    await user.click(within(notes).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.writeNote).toHaveBeenCalledWith("record:car_wash_sites/r1", "Notes", "Ask about the lease"));
  });
});
