import { beforeEach, describe, expect, it } from "vitest";
import { bindingOf, comboLabel, matches, problemWith, recorded, saveBinding } from "./shortcuts";

const press = (key: string, code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe("shortcuts", () => {
  beforeEach(() => localStorage.clear());

  it("records a combination and ignores a bare modifier", () => {
    expect(recorded(press("Meta", "MetaLeft", { metaKey: true }))).toBeNull();
    const c = recorded(press("˚", "KeyK", { metaKey: true, altKey: true }))!;
    expect(comboLabel(c)).toBe("⌥⌘K");
  });

  it("matches the held modifiers, Ctrl for ⌘, and Shift exactly", () => {
    const k = bindingOf("command-menu");
    expect(matches(press("k", "KeyK", { ctrlKey: true }), k)).toBe(true);
    expect(matches(press("k", "KeyK"), k)).toBe(false);
    const send = bindingOf("send");
    expect(matches(press("Enter", "Enter", { metaKey: true }), send)).toBe(true);
    expect(matches(press("Enter", "Enter", { shiftKey: true }), send)).toBe(false);
  });

  it("uses a saved binding, refuses clashes and plain letters, and resets", () => {
    expect(problemWith("command-menu", { key: "w", mod: true })).toBe("⌘W already does “Close the window; Alpha keeps running”.");
    expect(problemWith("command-menu", { key: "j" })).toMatch(/Add ⌘ or ⌥/);
    // Send and saving a cell share ↩: they work in different places.
    expect(problemWith("send", { key: "Enter" })).toBeNull();
    saveBinding("command-menu", { key: "j", mod: true });
    expect(matches(press("j", "KeyJ", { metaKey: true }), bindingOf("command-menu"))).toBe(true);
    saveBinding("command-menu", null);
    expect(comboLabel(bindingOf("command-menu"))).toBe("⌘K");
  });
});
