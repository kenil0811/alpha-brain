import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecordRow } from "../../core/client";
import { TooltipProvider } from "../../ui";
import { Cell } from "./cells";

const row = { id: "r1", revision: 1, values: { price: 300 }, created_at: "", updated_at: "", provenance: { estimated: true } } as unknown as RecordRow;
const price = { name: "price", kind: "number" } as const;

function show(locked?: string) {
  const onRow = vi.fn();
  const onEditing = vi.fn();
  render(
    <TooltipProvider>
      <table>
        <tbody>
          <tr onClick={onRow}>
            <Cell row={row} field={price} onCommit={vi.fn()} editing={false} onEditing={onEditing} locked={locked} />
          </tr>
        </tbody>
      </table>
    </TooltipProvider>,
  );
  return { onRow, onEditing };
}

describe("a cell", () => {
  it("says Estimated in words, with the reason reachable by focus", () => {
    show();
    const chip = screen.getByText("Estimated");
    expect(chip).toHaveAttribute("tabindex", "0");
    expect(chip).toHaveAccessibleName(/Estimated by Alpha/);
    expect(screen.queryByText("≈")).toBeNull();
  });

  it("has a pencil that starts editing at once without opening the row", async () => {
    const { onRow, onEditing } = show();
    await userEvent.setup().click(screen.getByRole("button", { name: "Edit Price" }));
    expect(onEditing).toHaveBeenCalledWith(true);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("has no pencil when the cell is locked", () => {
    show("Readers fill this.");
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });
});
