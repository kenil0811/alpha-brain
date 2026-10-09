import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { TableSummaryData } from "../core/client";
import { TooltipProvider } from "../ui";
import { MetricsStrip, useMetricsOpen } from "./MetricsStrip";

const amount = (today: number | null, this_week: number | null) => ({ field: "amount", label: "Amount", unit: "USD", how: "total" as const, today, this_week });
beforeEach(() => localStorage.clear());

const strip = (a: ReturnType<typeof amount>) => {
  localStorage.setItem("alpha.page.deals.metrics", "open");
  const summary: TableSummaryData = { name: "deals", title: "Deals", rows: 1, added_this_week: 0, amounts: [a] };
  render(
    <TooltipProvider>
      <MetricsStrip table={{ name: "deals", title: "Deals" }} rows={[]} summary={summary} onHide={() => undefined} />
    </TooltipProvider>,
  );
  return screen.getByText("Amount").closest(".mtile") as HTMLElement;
};

describe("the amount tile", () => {
  it("leads with today's sum when there is one", () => {
    const tile = strip(amount(500, 84000));
    expect(tile.querySelector(".mtile__big")).toHaveTextContent("500");
    expect(tile.querySelector(".mtile__basis")).toHaveTextContent("84,000 USD this week");
  });

  it("leads with this week's sum, saying so, when today has none", () => {
    const tile = strip(amount(null, 84000));
    expect(tile.querySelector(".mtile__big")).toHaveTextContent("84,000 USD");
    expect(tile.querySelector(".mtile__basis")).toHaveTextContent("this week · none today");
  });

  it("says Unknown, never a bare dash, when nothing is known", () => {
    const tile = strip(amount(null, null));
    expect(tile.querySelector(".mtile__big")).toHaveTextContent("Unknown");
    expect(tile).not.toHaveTextContent("—");
  });
});

describe("the fold", () => {
  // The data view's way: the show arrow lives in the toolbar, the hide arrow on the strip.
  function Fold() {
    const [open, setOpen] = useMetricsOpen("deals");
    return open ? <MetricsStrip table={{ name: "deals", title: "Deals" }} rows={[]} summary={null} onHide={() => setOpen(false)} /> : <button onClick={() => setOpen(true)}>Show the numbers</button>;
  }
  const show = () =>
    render(
      <TooltipProvider>
        <Fold />
      </TooltipProvider>,
    );

  it("starts folded, and remembers when the person opens it", async () => {
    const user = userEvent.setup();
    show();
    expect(screen.queryByText("Records")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show the numbers" }));
    expect(screen.getByText("Records")).toBeInTheDocument();
    cleanup();
    show();
    expect(screen.getByText("Records")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide the numbers" }));
    cleanup();
    show();
    expect(screen.queryByText("Records")).toBeNull();
  });
});
