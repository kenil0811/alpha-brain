import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dropdown } from "./Dropdown";

const FRUIT = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];
const MANY = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

describe("the dropdown", () => {
  it("shows the chosen option, lists it first with a check, and picks by click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="Fruit" value="cherry" options={FRUIT} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Fruit" });
    expect(trigger).toHaveTextContent("Cherry");
    await user.click(trigger);
    const options = within(screen.getByRole("listbox", { name: "Fruit" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Cherry", "Apple", "Banana"]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0].querySelector("svg")).not.toBeNull(); // the check
    await user.click(options[2]);
    expect(onChange).toHaveBeenCalledWith("banana");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("moves with the arrow keys, picks with Enter and closes with Escape", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="Fruit" value="apple" options={FRUIT} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("cherry");

    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("opens from the keyboard on the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Dropdown label="Fruit" value="apple" options={FRUIT} onChange={vi.fn()} />);
    screen.getByRole("combobox", { name: "Fruit" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("jumps to what is typed when there is no search box", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="Fruit" value="apple" options={FRUIT} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    expect(screen.queryByRole("combobox", { name: "Search Fruit" })).toBeNull();
    await user.keyboard("ch{Enter}");
    expect(onChange).toHaveBeenCalledWith("cherry");
  });

  it("has a search box above seven options, and typing narrows the list", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="Thing" value="v0" options={MANY} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Thing" }));
    const search = screen.getByRole("combobox", { name: "Search Thing" });
    expect(search).toHaveFocus();
    await user.keyboard("option 7");
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Option 7"]);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("v7");
  });

  it("says no match, and shows the reason for a disabled option on hover without picking it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="View" value="table" onChange={onChange} options={[{ value: "table", label: "Table" }, { value: "calendar", label: "Calendar", disabled: "Calendar needs a date field. Add one from ⋮ More › Add column." }]} />);
    await user.click(screen.getByRole("combobox", { name: "View" }));
    const calendar = screen.getByRole("option", { name: "Calendar" });
    expect(calendar).toHaveAttribute("aria-disabled", "true");
    await user.hover(calendar);
    expect(screen.getByRole("status")).toHaveTextContent("Calendar needs a date field");
    await user.click(calendar);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument(); // still open: nothing was chosen
  });

  it("pins an Add row at the bottom that adds instead of choosing", async () => {
    const onAdd = vi.fn();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="List" value="a" options={[{ value: "a", label: "A" }]} onChange={onChange} onAdd={onAdd} addLabel="Add list…" />);
    await user.click(screen.getByRole("combobox", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Add list…" }));
    expect(onAdd).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
