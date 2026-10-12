import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecordRow } from "../../core/client";
import { TooltipProvider } from "../../ui";
import { editText, showValue, type FieldInfo } from "../fields";
import { MapView } from "./MapView";

const fields: FieldInfo[] = [
  { name: "title", kind: "text" },
  { name: "city", kind: "place", label: "City" },
  { name: "stage", kind: "text", label: "Stage" },
];
const row = (id: string, values: Record<string, unknown>): RecordRow => ({ id, revision: 1, values, created_at: "", updated_at: "", provenance: {} });
const austin = (label: string) => ({ label, lat: 30.26, lon: -97.74, precision: "city", source: "Apple Maps", estimated: true });
const rows = [
  row("a", { title: "Bakery", city: austin("Austin, TX"), stage: "open" }),
  row("b", { title: "Cafe", city: austin("Austin") }),
  row("c", { title: "Deli", city: { label: "Paris", lat: 48.86, lon: 2.35 } }),
  row("d", { title: "Diner", city: { label: "Atlantis" } }),
  row("e", { title: "Inn" }),
];

function draw(over: Partial<Parameters<typeof MapView>[0]> = {}) {
  const props = { rows, field: fields[1], titleField: "title", fields, onOpen: vi.fn(), onShowRecords: vi.fn(), ...over };
  render(
    <TooltipProvider>
      <MapView {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("MapView", () => {
  it("merges records at one place, keeps others apart, and draws a found place hollow", () => {
    draw();
    expect(screen.getByRole("button", { name: "2 records here" })).toBeTruthy();
    const paris = screen.getByRole("button", { name: "Deli, Paris" });
    expect(paris.getAttribute("class")).not.toContain("mapdot--estimated");
  });

  it("counts records with no place, says which weren't found, and lists them", async () => {
    const p = draw();
    expect(screen.getByText(/2 records have no place; 1 of them couldn't be found/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(p.onShowRecords).toHaveBeenCalledWith(["d", "e"], "No City");
  });

  it("a click shows the card, a double-click or Open page opens the record", async () => {
    const p = draw();
    const dot = screen.getByRole("button", { name: "Deli, Paris" });
    await userEvent.click(dot);
    expect(screen.getByRole("complementary", { name: "Deli" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Open page" }));
    expect(p.onOpen).toHaveBeenCalledWith("c");
    fireEvent.doubleClick(dot);
    expect(p.onOpen).toHaveBeenCalledTimes(2);
  });

  it("arrow keys walk the dots with one tab stop; Enter selects then opens", async () => {
    const p = draw();
    const dots = document.querySelectorAll<SVGGElement>(".mapdot");
    expect([...dots].filter((d) => d.getAttribute("tabindex") === "0")).toHaveLength(1);
    const first = [...dots].find((d) => d.getAttribute("tabindex") === "0")!;
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    const next = document.activeElement as SVGGElement;
    expect(next).not.toBe(first);
    const one = next.getAttribute("aria-label")!.startsWith("Deli") ? next : first;
    one.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(p.onOpen).toHaveBeenCalledWith("c");
  });

  it("records at one city never split: a click lists them, and Escape closes the card", async () => {
    draw();
    await userEvent.click(screen.getByRole("button", { name: "2 records here" }));
    expect(screen.getByText("2 records at Austin, TX")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cafe" }));
    expect(screen.getByRole("complementary", { name: "Cafe" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("2 records at Austin, TX")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("a place reads and edits as its words", () => {
    expect(showValue(austin("Austin, TX"), "place")).toBe("Austin, TX");
    expect(editText(austin("Austin, TX"), "place")).toBe("Austin, TX");
  });
});
