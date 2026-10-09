import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TableSummaryData } from "../core/client";
import { TooltipProvider } from "../ui";
import { MetricsStrip } from "./MetricsStrip";

const amount = (today: number | null, this_week: number | null) => ({ field: "amount", label: "Amount", unit: "USD", how: "total" as const, today, this_week });
const strip = (a: ReturnType<typeof amount>) => {
  const summary: TableSummaryData = { name: "deals", title: "Deals", rows: 1, added_this_week: 0, amounts: [a] };
  render(
    <TooltipProvider>
      <MetricsStrip table={{ name: "deals", title: "Deals" }} rows={[]} summary={summary} />
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
