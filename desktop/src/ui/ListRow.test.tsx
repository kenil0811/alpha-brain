import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ListRow } from "./ListRow";

describe("ListRow", () => {
  it("shows the icon, title, description and controls, and opens from the title", async () => {
    const onOpen = vi.fn();
    render(<ListRow icon={<svg data-testid="ico" />} title="Daily deals" description="Every day at 07:00" controls={<button type="button">Run now</button>} onOpen={onOpen} />);
    expect(screen.getByTestId("ico")).toBeInTheDocument();
    expect(screen.getByText("Every day at 07:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Daily deals" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("is plain text when the title opens nothing", () => {
    render(<ListRow title="Built in" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
