import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { Segmented } from "../ui/Segmented";
import { ACCESSORIES, DEFAULT_LOOK, LOOK_KEY, readLook } from "./look";
import { type Accessory, ZazooAvatar } from "./zazoo/ZazooAvatar";
import { ZazooDirector } from "./zazoo/director";

describe("the avatar's accessories", () => {
  beforeEach(() => window.localStorage.clear());

  it("moves a look saved with one accessory and a glasses switch to the list", () => {
    const old = (accessory: string, glasses: boolean) => {
      window.localStorage.setItem(LOOK_KEY, JSON.stringify({ species: "panda", accessory, glasses }));
      const look = readLook();
      expect(look).not.toHaveProperty("accessory");
      expect(look).not.toHaveProperty("glasses");
      return look.accessories;
    };
    expect(old("bowtie", true)).toEqual(["bowtie", "spectacles"]);
    expect(old("none", false)).toEqual([]);
    expect(old("none", true)).toEqual(["spectacles"]);
    window.localStorage.clear();
    expect(readLook().accessories).toEqual(["tie"]);
    expect(DEFAULT_LOOK.accessories).toEqual(["tie"]);
  });

  it("toggles each one on and off, any mix or none", () => {
    function Pick() {
      const [on, setOn] = useState<Accessory[]>(["tie"]);
      return <Segmented multiple label="Accessories" value={on} options={ACCESSORIES} onChange={setOn} />;
    }
    render(<Pick />);
    const button = (name: string) => screen.getByRole("button", { name });
    fireEvent.click(button("Spectacles"));
    fireEvent.click(button("Bow tie"));
    expect(button("Tie")).toHaveAttribute("aria-pressed", "true");
    expect(button("Bow tie")).toHaveAttribute("aria-pressed", "true");
    expect(button("Scarf")).toHaveAttribute("aria-pressed", "false");
    expect(button("Spectacles")).toHaveAttribute("aria-pressed", "true");
    for (const name of ["Tie", "Bow tie", "Spectacles"]) fireEvent.click(button(name));
    expect(screen.getAllByRole("button").every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("draws every accessory it wears", () => {
    const all: Accessory[] = ["tie", "bowtie", "scarf", "spectacles"];
    const { container, rerender } = render(<ZazooAvatar director={new ZazooDirector()} animate={false} appearance={{ ...DEFAULT_LOOK, accessories: all }} />);
    for (const a of all) expect(container.querySelector(`[data-layer="${a}"]`), a).not.toBeNull();
    rerender(<ZazooAvatar director={new ZazooDirector()} animate={false} appearance={{ ...DEFAULT_LOOK, accessories: [] }} />);
    for (const a of all) expect(container.querySelector(`[data-layer="${a}"]`), a).toBeNull();
  });
});
