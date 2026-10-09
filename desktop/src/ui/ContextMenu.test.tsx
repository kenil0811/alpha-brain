import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import { MoreHorizontal } from "./icons";

describe("the context menu", () => {
  const items = (onOpen = vi.fn(), onDelete = vi.fn()) => [
    { label: "Open", onSelect: onOpen },
    { label: "Duplicate", onSelect: vi.fn(), disabled: "Duplicating needs a title field." },
    { label: "Delete", onSelect: onDelete, danger: true, separatorBefore: true },
  ];

  it("opens on a right-click, runs the item chosen and closes", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ContextMenu items={items(onOpen)}>Row one</ContextMenu>);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(screen.getByText("Row one"), { clientX: 40, clientY: 60 });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Open", "Duplicate", "Delete"]);
    await user.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(onOpen).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens from the keyboard with Shift+F10 or the ContextMenu key, and Escape closes it", async () => {
    const user = userEvent.setup();
    render(<ContextMenu items={items()}>Row one</ContextMenu>);
    const region = screen.getByText("Row one");
    region.focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(region).toHaveFocus(); // back where it was
    await user.keyboard("{ContextMenu}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("closes on a click outside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ContextMenu items={items()}>Row one</ContextMenu>
        <p>Elsewhere</p>
      </>,
    );
    fireEvent.contextMenu(screen.getByText("Row one"));
    await screen.findByRole("menu");
    await user.click(screen.getByText("Elsewhere"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps a disabled item visible and does not run it", async () => {
    const user = userEvent.setup();
    render(<ContextMenu items={items()}>Row one</ContextMenu>);
    fireEvent.contextMenu(screen.getByText("Row one"));
    const dup = await screen.findByRole("menuitem", { name: "Duplicate" });
    expect(dup).toHaveAttribute("aria-disabled", "true");
    await user.click(dup);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("serves many rows from one menu, and a ⋯ button opens the same menu for its row", async () => {
    const opened = vi.fn();
    const user = userEvent.setup();
    function Rows() {
      const cm = useContextMenu<string>((id) => [{ label: `Open ${id}`, onSelect: () => opened(id) }]);
      return (
        <div>
          {["a", "b"].map((id) => (
            <div key={id} tabIndex={0} {...cm.bind(id)}>
              Row {id}
              <IconButton label={`More for ${id}`} icon={<MoreHorizontal />} onClick={(e) => cm.openFrom(id, e.currentTarget)} />
            </div>
          ))}
          {cm.menu}
        </div>
      );
    }
    render(<Rows />);
    fireEvent.contextMenu(screen.getByText("Row b", { exact: false }));
    await user.click(await screen.findByRole("menuitem", { name: "Open b" }));
    expect(opened).toHaveBeenLastCalledWith("b");
    await user.click(screen.getByRole("button", { name: "More for a" }));
    await user.click(await screen.findByRole("menuitem", { name: "Open a" }));
    expect(opened).toHaveBeenLastCalledWith("a");
  });
});
