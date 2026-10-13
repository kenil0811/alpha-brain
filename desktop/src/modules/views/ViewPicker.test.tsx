import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewPicker } from "./ViewPicker";

const VIEWS = ["Table", "Board", "List", "Form", "Gallery", "Calendar", "Timeline", "Chart"].map((label) => ({ id: label.toLowerCase(), label }));

// The test document has no layout: each tab is 60 wide, an element says its own width in data-w,
// the toolbar its inner width in data-cw.
const rect = HTMLElement.prototype.getBoundingClientRect;
const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const w = this.tagName === "BUTTON" ? 60 : Number(this.dataset.w ?? 0);
    return { width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get(this: HTMLElement) { return Number(this.dataset.cw ?? 0); } });
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = rect;
  if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
});

const toolbar = (cw: number, onChange = vi.fn()) =>
  render(
    <div className="toolbar" data-cw={cw}>
      <div className="search" data-w={200} />
      <ViewPicker items={VIEWS} value="table" onChange={onChange} />
    </div>,
  );

describe("a table's views in its toolbar", () => {
  it("are tabs while they fit", () => {
    toolbar(1000);
    expect(screen.getByRole("tablist", { name: "View" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^View: / })).toBeNull();
  });

  it("become one menu when the toolbar is too narrow, never a word in two", () => {
    const onChange = vi.fn();
    toolbar(500, onChange);
    expect(screen.queryByRole("tablist", { name: "View" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View: Table. Pick another" }));
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(onChange).toHaveBeenCalledWith("board");
  });
});
