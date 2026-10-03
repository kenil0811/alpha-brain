import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { TooltipProvider } from "../ui";
import { LookPicker } from "./LookPicker";
import { DEFAULT_LOOK } from "./looks";
import { Rig } from "./Rig";

describe("the rig", () => {
  it("says who it is and what it is doing", () => {
    render(<Rig look={DEFAULT_LOOK} mood="idle" />);
    const svg = screen.getByRole("img", { name: "Alpha, a panda, is here" });
    expect(svg).toHaveAttribute("data-animal", "panda");
    expect(svg).toHaveClass("rig--idle");
  });

  it("draws the chosen animal and wardrobe", () => {
    const { container } = render(<Rig look={{ ...DEFAULT_LOOK, animal: "cat", glasses: true, neckwear: "bow" }} mood="thinking" />);
    expect(screen.getByRole("img", { name: "Alpha, a cat, is thinking" })).toHaveAttribute("data-animal", "cat");
    // The painted panda patches are the panda's alone; the cat has whiskers and a drawn nose.
    expect(container.querySelectorAll("image[href$='patch.webp']").length).toBe(0);
    expect(container.querySelectorAll("image[href$='snout.webp']").length).toBe(0);
    const { container: panda } = render(<Rig look={DEFAULT_LOOK} mood="idle" />);
    expect(panda.querySelectorAll("image[href$='patch.webp']").length).toBe(2);
    expect(panda.querySelectorAll("image[href$='tie.webp']").length).toBe(1);
  });
});

describe("the look picker", () => {
  function client(stored: unknown) {
    const c = {
      preference: vi.fn(async () => ({ key: "companion_look", value: stored })),
      setPreference: vi.fn(async (key: string, value: unknown) => ({ key, value })),
    };
    return c as unknown as Client & typeof c;
  }

  it("shows the stored look and keeps every change in the world", async () => {
    const user = userEvent.setup();
    const c = client({ animal: "otter", glasses: false });
    render(
      <TooltipProvider>
        <LookPicker client={c} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("button", { name: "Otter", pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fox" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ animal: "fox", fur: null }));
    await user.click(screen.getByRole("switch", { name: "Glasses" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ animal: "fox", glasses: true }));
    await user.click(screen.getByRole("button", { name: "Honey" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ fur: "#d99a66" }));
  });
});
