import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { permissionOn, Permissions } from "./Permissions";

describe("Permissions", () => {
  it("lists every permission with Alpha's own switch, remembered across windows", () => {
    localStorage.clear();
    render(<Permissions />);
    for (const name of ["Screen", "System audio", "Microphone", "Speech recognition", "Accessibility", "Input monitoring", "System logs"]) expect(screen.getByRole("switch", { name })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Microphone" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Screen" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("switch", { name: "Microphone" }));
    expect(screen.getByRole("switch", { name: "Microphone" })).toHaveAttribute("aria-checked", "false");
    expect(permissionOn("microphone")).toBe(false);
    expect(permissionOn("screen")).toBe(false);
  });
});
