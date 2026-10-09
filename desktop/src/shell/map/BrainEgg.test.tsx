import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../../core/client";
import { TooltipProvider } from "../../ui";
import { BrainEgg } from "./BrainEgg";
import type { Brain } from "./egg";

const brain: Brain = {
  nodes: [
    { id: "you", kind: "you", title: "You" },
    { id: "module:a", kind: "module", title: "Deals", open: { kind: "module", id: "a" } },
    { id: "module:b", kind: "module", title: "Food", open: { kind: "module", id: "b" } },
  ],
  edges: [{ from: "you", to: "module:a" }, { from: "you", to: "module:b" }],
};

describe("the egg by keyboard", () => {
  it("is one Tab stop; the arrows move to a neighbour and announce it; Enter opens it", () => {
    const onGo = vi.fn();
    render(
      <TooltipProvider>
        <BrainEgg client={{} as Client} brain={brain} selected={null} onGo={onGo} onSelect={vi.fn()} />
      </TooltipProvider>,
    );
    const you = screen.getByRole("button", { name: "You, you" });
    expect(you).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Deals, project" })).toHaveAttribute("tabindex", "-1");
    you.focus();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      if (document.activeElement !== you) break;
      fireEvent.keyDown(you, { key });
    }
    const now = document.activeElement as HTMLElement;
    expect(now).not.toBe(you);
    expect(now).toHaveAttribute("tabindex", "0");
    const name = now.getAttribute("aria-label")!;
    expect(screen.getByRole("status")).toHaveTextContent(name);
    fireEvent.keyDown(now, { key: "Enter" });
    expect(onGo).toHaveBeenCalled();
  });
});
