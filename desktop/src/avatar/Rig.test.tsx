import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { TooltipProvider } from "../ui";
import { LookPicker } from "./LookPicker";
import { DEFAULT_LOOK } from "./looks";
import { POSES, Rig, type Mood } from "./Rig";

describe("the rig", () => {
  it("says who it is and what it is doing", () => {
    render(<Rig look={DEFAULT_LOOK} mood="idle" />);
    const svg = screen.getByRole("img", { name: "Zazoo, a panda, is here" });
    expect(svg).toHaveAttribute("data-animal", "panda");
    expect(svg).toHaveClass("rig--idle");
  });

  it("draws the chosen animal and wardrobe", () => {
    const { container } = render(<Rig look={{ ...DEFAULT_LOOK, animal: "cat", accessories: ["bowtie", "scarf", "spectacles"] }} mood="thinking" />);
    expect(screen.getByRole("img", { name: "Zazoo, a cat, is thinking" })).toHaveAttribute("data-animal", "cat");
    // The painted panda patches are the panda's alone; the cat has whiskers and a drawn nose.
    expect(container.querySelectorAll("image[href$='patch.webp']").length).toBe(0);
    expect(container.querySelectorAll("image[href$='snout.webp']").length).toBe(0);
    const { container: panda } = render(<Rig look={DEFAULT_LOOK} mood="idle" />);
    expect(panda.querySelectorAll("image[href$='patch.webp']").length).toBe(2);
    expect(panda.querySelectorAll("image[href$='tie.webp']").length).toBe(1);
    // Every accessory chosen is drawn, the bow tie after (over) the scarf; no tie unless chosen.
    expect(container.querySelectorAll("image[href$='tie.webp']").length).toBe(0);
    const parts = Array.from(container.querySelectorAll("[data-part]")).map((p) => p.getAttribute("data-part"));
    expect(parts).toEqual(expect.arrayContaining(["spectacles", "scarf", "bowtie"]));
    expect(parts.indexOf("bowtie")).toBeGreaterThan(parts.indexOf("scarf"));
  });
});

describe("the moods", () => {
  it("every mood names itself and sets the face from its pose", () => {
    const moods: Mood[] = ["idle", "curious", "listening", "thinking", "talking", "happy", "proud", "unsure", "concerned", "comforting", "celebrating", "sleepy"];
    for (const mood of moods) {
      const { unmount } = render(<Rig look={DEFAULT_LOOK} mood={mood} />);
      const svg = screen.getByRole("img");
      expect(svg).toHaveAttribute("data-mood", mood);
      expect(svg.getAttribute("aria-label")).toMatch(/^Zazoo, a panda, is /);
      unmount();
    }
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    render(<Rig look={DEFAULT_LOOK} mood="curious" />);
    expect(screen.getByRole("img", { name: "Zazoo, a panda, is curious" })).toHaveClass("rig--curious");
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
    const c = client({ animal: "otter", neckwear: "bow", glasses: false });
    render(
      <TooltipProvider>
        <LookPicker client={c} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("button", { name: "Otter", pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fox" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ animal: "fox", fur: null }));
    // Accessories: any mix, none too; the old bow became the bow tie.
    expect(screen.getByRole("button", { name: "Bow tie", pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Glasses" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Spectacles" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ animal: "fox", accessories: ["bowtie", "spectacles"] }));
    await user.click(screen.getByRole("button", { name: "Scarf" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ accessories: ["bowtie", "scarf", "spectacles"] }));
    await user.click(screen.getByRole("button", { name: "Bow tie" }));
    await user.click(screen.getByRole("button", { name: "Scarf" }));
    await user.click(screen.getByRole("button", { name: "Spectacles" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ accessories: [] }));
    expect(screen.queryByRole("group", { name: "Tie colour" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Honey" }));
    expect(c.setPreference).toHaveBeenLastCalledWith("companion_look", expect.objectContaining({ fur: "#d99a66" }));
  });
});
