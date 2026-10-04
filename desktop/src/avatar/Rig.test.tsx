import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { TooltipProvider } from "../ui";
import { LookPicker } from "./LookPicker";
import { ANIMALS, DEFAULT_LOOK } from "./looks";
import { POSES, Rig, type Mood } from "./Rig";

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

  it("gives every animal dark eyes under the lids (pupil.webp is only the white glints)", () => {
    for (const a of ANIMALS) {
      const { container, unmount } = render(<Rig look={{ ...DEFAULT_LOOK, animal: a.id }} mood="idle" />);
      const pupils = container.querySelectorAll(".rig__lids .rig__pupil");
      expect(pupils.length).toBe(2);
      // the panda's dark is the painted eye; a white eye draws its own iris
      const dark = a.eyes === "dark" ? container.querySelectorAll(".rig__lids image[href$='eye.webp']") : container.querySelectorAll(".rig__pupil ellipse[fill='#393841']");
      expect(dark.length, a.id).toBe(2);
      unmount();
    }
  });
});

describe("the moods", () => {
  it("every mood names itself and sets the face from its pose", () => {
    const moods: Mood[] = ["idle", "curious", "listening", "thinking", "talking", "happy", "proud", "unsure", "concerned", "comforting", "celebrating", "sleepy"];
    for (const mood of moods) {
      const { unmount } = render(<Rig look={DEFAULT_LOOK} mood={mood} />);
      const svg = screen.getByRole("img");
      expect(svg).toHaveAttribute("data-mood", mood);
      expect(svg.getAttribute("aria-label")).toMatch(/^Alpha, a panda, is /);
      unmount();
    }
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    render(<Rig look={DEFAULT_LOOK} mood="curious" />);
    expect(screen.getByRole("img", { name: "Alpha, a panda, is curious" })).toHaveClass("rig--curious");
  });

  it("happy blushes and squints, thinking looks up and aside, sleepy droops", () => {
    expect(POSES.happy.cheeks).toBeGreaterThan(POSES.idle.cheeks);
    expect(POSES.happy.eyeOpen).toBeLessThan(POSES.idle.eyeOpen);
    expect(POSES.thinking.gazeY).toBeLessThan(0);
    expect(POSES.thinking.browFurrow).toBeGreaterThan(0);
    expect(POSES.sleepy.eyeOpen).toBeLessThan(0.5);
    expect(POSES.listening.earScale).toBeGreaterThan(1);
    expect(POSES.listening.nod).toBe(true);
    const { container } = render(<Rig look={DEFAULT_LOOK} mood="listening" />);
    expect(container.querySelector(".rig--nod")).not.toBeNull();
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
