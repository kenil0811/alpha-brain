import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "./Segmented";

describe("Segmented", () => {
  it("presses the chosen option and reports a new one", async () => {
    const onChange = vi.fn();
    render(<Segmented label="Density" value="compact" options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }]} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Comfortable" }));
    expect(onChange).toHaveBeenCalledWith("comfortable");
  });
});
