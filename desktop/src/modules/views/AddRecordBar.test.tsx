import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddRecordBar } from "./AddRecordBar";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("the add bar", () => {
  it("keeps the button's words when there is room and only its icon, named, when there is not", () => {
    // only the bar's own observer is driven by hand
    let watch: () => void = () => {};
    vi.stubGlobal("ResizeObserver", class {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; }
      observe(el: Element) { if (el.classList.contains("addbar")) watch = this.cb; }
      disconnect() {}
    });
    let room = 600;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.classList.contains("addbar") ? room : 0; } });
    render(<AddRecordBar table={{ name: "deals", title: "Deals" }} onSay={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add with all fields" })).toHaveTextContent("Add with all fields");

    room = 300;
    act(() => watch());
    const icon = screen.getByRole("button", { name: "Add with all fields" }); // the name stays
    expect(icon).toHaveTextContent("");
    expect(icon).toHaveClass("iconbtn");

    room = 600;
    act(() => watch());
    expect(screen.getByRole("button", { name: "Add with all fields" })).toHaveTextContent("Add with all fields");
  });
});
