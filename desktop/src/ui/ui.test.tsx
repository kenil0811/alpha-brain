import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge, Button, Dialog, IconButton, Popover, Tabs, TooltipProvider } from ".";
import { X } from "./icons";

describe("the kit", () => {
  it("buttons carry their look as classes and are buttons by default", () => {
    render(
      <Button size="sm" variant="primary" className="extra">
        Go
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Go" });
    expect(b).toHaveClass("btn", "btn--sm", "btn--primary", "extra");
    expect(b).toHaveAttribute("type", "button");
  });

  it("an icon button always has a name", () => {
    render(<IconButton label="Close" icon={<X />} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("a badge says its tone", () => {
    render(<Badge tone="warn">Waiting</Badge>);
    expect(screen.getByText("Waiting")).toHaveClass("pill--warn");
  });

  it("tabs move with the arrow keys, Home and End", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs label="Pick" value="b" onChange={onChange} items={[{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }]} />);
    const b = screen.getByRole("tab", { name: "B" });
    expect(b).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("tabindex", "-1");
    b.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("a");
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("c"); // wraps from the first to the last
  });

  it("a popover opens on its trigger and closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Popover label="Options" trigger={<IconButton label="More" icon={<X />} />}>
          <button type="button">As CSV</button>
        </Popover>
      </TooltipProvider>,
    );
    expect(screen.queryByText("As CSV")).toBeNull();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByText("As CSV")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("As CSV")).toBeNull();
  });

  it("a dialog has a title and closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="Screenshot">
        <p>Big picture</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Screenshot" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
