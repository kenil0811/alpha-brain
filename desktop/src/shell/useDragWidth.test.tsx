import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDragWidth, type PanelWidth } from "./useDragWidth";

function Handle(props: PanelWidth) {
  const d = useDragWidth("test.width", props);
  return <div role="separator" aria-valuenow={d.width} aria-valuemax={d.bounds.max} onPointerDown={d.onPointerDown} />;
}

describe("a side panel's width", () => {
  it("widens with no cap but the window, and folds when dragged past its narrowest", () => {
    localStorage.removeItem("test.width");
    const onFold = vi.fn();
    render(<Handle initial={300} min={200} max={() => 1000} wide={400} grow="right" onFold={onFold} />);
    const handle = screen.getByRole("separator");
    expect(handle).toHaveAttribute("aria-valuemax", "1000");
    fireEvent.pointerDown(handle, { clientX: 300 });
    act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: 1200 })));
    expect(handle).toHaveAttribute("aria-valuenow", "1000"); // the middle is gone, no more
    act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: 250 })));
    expect(handle).toHaveAttribute("aria-valuenow", "250");
    expect(onFold).not.toHaveBeenCalled();
    act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0 }))); // 0 < 200 / 2
    expect(onFold).toHaveBeenCalledTimes(1);
    expect(handle).toHaveAttribute("aria-valuenow", "250"); // kept for when it opens again
  });
});
