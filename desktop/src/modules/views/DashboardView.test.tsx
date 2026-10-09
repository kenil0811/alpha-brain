import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, RecordRow, TableDesc } from "../../core/client";
import { forgetPreferences } from "../../core/preferences";
import { TooltipProvider } from "../../ui";
import type { FieldInfo } from "../fields";
import { DashboardView, dashboardAvailable } from "./DashboardView";

const fields: FieldInfo[] = [
  { name: "title", kind: "text" },
  { name: "amount", kind: "number", label: "Amount" },
  { name: "stage", kind: "status", label: "Stage", choices: ["open", "won"], done_choices: ["won"] },
  { name: "due", kind: "date", label: "Due date" },
];
const desc = { name: "deals", title: "Deals", module: null, title_field: "title", fields } as unknown as TableDesc;
const row = (id: string, values: Record<string, unknown>): RecordRow => ({ id, revision: 1, values, created_at: "", updated_at: "", provenance: {} });
const rows = [row("r1", { title: "Bakery", amount: 10, stage: "open", due: "2020-01-01" }), row("r2", { title: "Cafe", amount: 30, stage: "won", due: "2020-01-02" }), row("r3", { title: "Deli", amount: 20, stage: "open", due: "2020-02-03" })];

function setup(data: RecordRow[] = rows) {
  const client = { preference: vi.fn(async () => ({ key: "dashboards", value: null })), setPreference: vi.fn(async (_k: string, v: unknown) => ({ key: "dashboards", value: v })) };
  const on = { onShowRecords: vi.fn(), onOpenRecord: vi.fn(), onAsk: vi.fn() };
  render(
    <TooltipProvider>
      <DashboardView client={client as unknown as Client} table={desc} fields={fields} rows={data} listKey="deals:all" {...on} />
    </TooltipProvider>,
  );
  return { client, ...on };
}
beforeEach(() => forgetPreferences());
afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("the dashboard", () => {
  it("is available when a field can be counted, added up or dated", () => {
    expect(dashboardAvailable(fields)).toBeNull();
    expect(dashboardAvailable([{ name: "t", kind: "text" }])).toMatch(/needs a number, status or date/);
  });

  it("gives every tile a call to action", () => {
    setup();
    const tiles = [...document.querySelectorAll(".dash__cell")];
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    for (const t of tiles) expect(within(t as HTMLElement).getAllByRole("button").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Show these 3 (Records)" })).toBeEnabled();
  });

  it("shows the basis of a number and a legend under a chart", () => {
    setup();
    expect(screen.getAllByText("3 of 3 records have a value in Amount", { selector: ".mtile__basis" })).toHaveLength(2);
    expect(screen.getByText("Records per week", { selector: ".dash__seg" })).toBeInTheDocument();
  });

  it("clicking a segment shows exactly those records, named by the field and choice", async () => {
    const user = userEvent.setup();
    const { onShowRecords } = setup();
    await user.click(screen.getByRole("button", { name: /^Open 2$/ }));
    expect(onShowRecords).toHaveBeenCalledWith(["r1", "r3"], "Stage · Open");
  });

  it("lists what needs attention with an inline Open, and the tile's button shows them all", async () => {
    const user = userEvent.setup();
    const { onShowRecords, onOpenRecord } = setup();
    await user.click(screen.getByRole("button", { name: "Open Bakery" }));
    expect(onOpenRecord).toHaveBeenCalledWith("r1");
    await user.click(screen.getByRole("button", { name: "Show all 2 (Needs attention)" }));
    expect(onShowRecords).toHaveBeenCalledWith(["r1", "r3"], "Needs attention · 2");
  });

  it("a disabled call to action keeps its place and gives its reason on hover", async () => {
    const user = userEvent.setup();
    const { onShowRecords } = setup([]);
    const button = screen.getByRole("button", { name: "Show all (Needs attention)" });
    expect(button).toBeDisabled();
    await user.hover(button.parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("There are no records yet.");
    await user.click(button);
    expect(onShowRecords).not.toHaveBeenCalled();
    expect(screen.getAllByText("No records yet.").length).toBeGreaterThan(0);
  });

  it("edit mode removes a tile and keeps the layout for this list", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await user.click(screen.getByRole("button", { name: "Edit dashboard" }));
    await user.click(screen.getByRole("button", { name: "Remove Needs attention" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenCalled());
    const [key, value] = client.setPreference.mock.calls[0] as [string, Record<string, { id: string }[]>];
    expect(key).toBe("dashboards");
    expect(value["deals:all"].map((t) => t.id)).not.toContain("attention");
    expect(value["deals:all"]).toHaveLength(6);
    expect(screen.queryByRole("region", { name: "Needs attention" })).not.toBeInTheDocument();
  });

  it("edit mode makes a tile wide and resets to the default layout", async () => {
    const user = userEvent.setup();
    const { client } = setup();
    await user.click(screen.getByRole("button", { name: "Edit dashboard" }));
    await user.click(screen.getByRole("button", { name: "Make Records by stage wide" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll(".dash__cell--wide")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenLastCalledWith("dashboards", {}));
    expect(document.querySelectorAll(".dash__cell--wide")).toHaveLength(0);
  });

  it("draws a chart at its tile's real width, so its text keeps the type scale", () => {
    vi.stubGlobal("ResizeObserver", class {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; }
      observe() { this.cb(); }
      disconnect() {}
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.classList.contains("dchart__box") ? 620 : 0; } });
    setup();
    const charts = [...document.querySelectorAll("svg.dchart")];
    expect(charts.length).toBeGreaterThan(0);
    for (const c of charts) expect(c.getAttribute("viewBox")).toMatch(/^0 0 620 /);
  });
});
