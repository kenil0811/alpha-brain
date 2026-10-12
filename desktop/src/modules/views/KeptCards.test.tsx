import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardCard, RecordRow, TableDesc } from "../../core/client";
import { TooltipProvider } from "../../ui";
import type { FieldInfo } from "../fields";
import { KeptCards } from "./KeptCards";
import { weekOverWeek } from "../dashboard";

const fields: FieldInfo[] = [
  { name: "title", kind: "text" },
  { name: "amount", kind: "number", label: "Amount" },
  { name: "stage", kind: "status", label: "Stage", choices: ["open", "won"], done_choices: ["won"] },
  { name: "due", kind: "date", label: "Due date" },
];
const desc = { name: "deals", title: "Deals", module: null, title_field: "title", fields } as unknown as TableDesc;
const row = (id: string, values: Record<string, unknown>): RecordRow => ({ id, revision: 1, values, created_at: "", updated_at: "", provenance: {} });
const rows = [row("r1", { title: "Bakery", amount: 10, stage: "open", due: "2020-01-01" }), row("r2", { title: "Cafe", amount: 30, stage: "won", due: "2020-01-02" }), row("r3", { title: "Deli", amount: 20, stage: "open", due: "2020-02-03" })];
const card = (id: string, type: DashboardCard["type"], title: string, field: string | null = null, measure: string | null = null): DashboardCard => ({ id, collection: "deals", type, field, measure, title, why: "" });
/** What Alpha might propose for these fields, the numbers first. */
const cards = [
  card("c1", "metric", "Records", null, "count"),
  card("c2", "metric", "Total amount", "amount", "sum"),
  card("c3", "metric", "Average amount", "amount", "avg"),
  card("c4", "overtime", "Records over time", "due", "count"),
  card("c5", "breakdown", "Where deals stand", "stage"),
  card("c6", "attention", "Needs attention"),
];

function setup(data: RecordRow[] = rows, kept: DashboardCard[] = cards) {
  const on = { onShowRecords: vi.fn(), onOpenRecord: vi.fn(), onAsk: vi.fn(), onRemove: vi.fn(async () => null) };
  const view = render(
    <TooltipProvider>
      <KeptCards table={desc} cards={kept} fields={fields} rows={data} {...on} />
    </TooltipProvider>,
  );
  return { ...on, ...view };
}
afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("a table's dashboard cards", () => {
  it("shows only the cards the person kept, under Alpha's titles, and nothing when none are kept", () => {
    const { container } = setup(rows, []);
    expect(container.querySelector(".dash")).toBeNull();
    setup();
    expect(screen.getByRole("region", { name: "Deals dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Where deals stand")).toBeInTheDocument();
  });

  it("gives every card a call to action", () => {
    setup();
    const tiles = [...document.querySelectorAll(".dash__cell")];
    expect(tiles).toHaveLength(cards.length + 1);
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

  it("Edit cards removes a card only after asking", async () => {
    const user = userEvent.setup();
    const { onRemove } = setup();
    await user.click(screen.getByRole("button", { name: "Dashboard options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit cards" }));
    await user.click(screen.getByRole("button", { name: "Remove Needs attention" }));
    expect(onRemove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Its records stay");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(cards[5]);
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

  it("puts the numbers first with their change on the week before, and a period that applies to every card", async () => {
    const user = userEvent.setup();
    setup();
    const cells = [...document.querySelectorAll(".dash__cell")].map((c) => c.className.match(/dash__cell--(\w+)/)?.[1]);
    expect(cells.slice(0, cells.lastIndexOf("metric") + 1).every((c) => c === "metric")).toBe(true); // no chart before a number
    expect(screen.getByText(/^As of /)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "7 days" }));
    expect(screen.getByRole("tab", { name: "7 days" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "What changed?" })).toBeInTheDocument();
  });
});

describe("week over week", () => {
  it("says what was added in the last 7 days against the 7 before", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const at = (days: number) => ({ id: String(days), revision: 1, values: {}, created_at: new Date(now.getTime() - days * 86_400_000).toISOString(), updated_at: "", provenance: {} });
    expect(weekOverWeek([at(1), at(2), at(9)], () => 1, now)).toBe("1 more added than the week before");
    expect(weekOverWeek([at(30)], () => 1, now)).toBeUndefined();
  });
});
