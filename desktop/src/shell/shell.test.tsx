import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { DOUBLE_CLICK_MS, Rail } from "./Rail";
import { useDragWidth } from "./useDragWidth";

function Handle() {
  const d = useDragWidth("test.width", 200, 100, 300, "right");
  return <div {...d.handle} aria-label="Resize" data-active={d.active} />;
}

describe("a border that resizes", () => {
  afterEach(() => localStorage.clear());

  it("drags with a two-sided cursor on the whole window, no text selection, and remembers", () => {
    render(<Handle />);
    const handle = screen.getByRole("separator", { name: "Resize" });
    fireEvent.pointerDown(handle, { clientX: 200 });
    expect(document.body.style.cursor).toBe("ew-resize");
    expect(document.body.style.userSelect).toBe("none");
    fireEvent.pointerMove(window, { clientX: 260 });
    expect(handle).toHaveAttribute("aria-valuenow", "260");
    fireEvent.pointerMove(window, { clientX: 900 });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
    fireEvent.pointerUp(window);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    expect(localStorage.getItem("test.width")).toBe("300");
  });

  it("steps with the arrow keys, within its bounds", () => {
    render(<Handle />);
    const handle = screen.getByRole("separator", { name: "Resize" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "216");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", "168");
  });
});

describe("the workspace name", () => {
  const client = () => ({ preference: vi.fn().mockResolvedValue({ key: "workspace_name", value: "Home base" }), setPreference: vi.fn().mockResolvedValue({}) }) as unknown as Client & { setPreference: ReturnType<typeof vi.fn> };
  const rail = (c: Client) => <Rail client={c} surface={{ kind: "home" }} modules={[]} needs={0} runtime="connected" onGo={vi.fn()} onNew={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />;

  it("renames in place on a double click and keeps it in the core", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const c = client();
    render(rail(c));
    const name = await screen.findByRole("button", { name: "Workspace: Home base" });
    fireEvent.click(name, { detail: 1 });
    fireEvent.click(name, { detail: 2 });
    fireEvent.doubleClick(name);
    act(() => void vi.advanceTimersByTime(DOUBLE_CLICK_MS + 50));
    expect(screen.queryByRole("menuitem", { name: "Rename workspace" })).toBeNull();
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    fireEvent.change(input, { target: { value: "Vikas" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(c.setPreference).toHaveBeenCalledWith("workspace_name", "Vikas");
    expect(screen.getByRole("button", { name: "Workspace: Vikas" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("opens its menu on a single click, after a beat", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(rail(client()));
    const name = await screen.findByRole("button", { name: "Workspace: Home base" });
    fireEvent.click(name, { detail: 1 });
    expect(screen.queryByRole("menuitem", { name: "Rename workspace" })).toBeNull();
    act(() => void vi.advanceTimersByTime(DOUBLE_CLICK_MS + 50));
    expect(await screen.findByRole("menuitem", { name: "Rename workspace" })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
