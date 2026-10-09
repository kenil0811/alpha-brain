import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantProvider } from "./assistant";
import { Dropdown, MultiDropdown, useDropdownDefault } from "./Dropdown";

const FRUIT = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];
const MANY = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

describe("the dropdown", () => {
  afterEach(() => localStorage.clear());

  it("shows the chosen option, lists it first highlighted (no tick), and picks by click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="Fruit" value="cherry" options={FRUIT} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Fruit" });
    expect(trigger).toHaveTextContent("Cherry");
    await user.click(trigger);
    const options = within(screen.getByRole("listbox", { name: "Fruit" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Cherry", "Apple", "Banana"]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(options[0].querySelector(".dropdown__check")).toBeNull(); // no tick: the row itself is highlighted
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

  it("always has a search box, even for a short list, and typing narrows it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="Fruit" value="apple" options={FRUIT} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    expect(screen.getByRole("combobox", { name: "Search Fruit" })).toHaveFocus();
    await user.keyboard("ch{Enter}");
    expect(onChange).toHaveBeenCalledWith("cherry");
  });

  it("searches a long list too, and typing narrows the list", async () => {
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
    render(<Dropdown label="View" value="table" onChange={onChange} options={[{ value: "table", label: "Table" }, { value: "calendar", label: "Calendar", disabled: "Calendar needs a date field. Add one from ⋯ More › Add column." }]} />);
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

  it("marks the default with a star, and a star sets the default without choosing", async () => {
    const onChange = vi.fn();
    const onSetDefault = vi.fn();
    const user = userEvent.setup();
    render(<Dropdown label="Fruit" value="cherry" options={FRUIT} onChange={onChange} defaultValue="apple" onSetDefault={onSetDefault} />);
    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    expect(screen.getByRole("img", { name: "Apple is the default" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true"); // the highlight stays on the choice
    await user.click(screen.getByRole("button", { name: "Make Banana the default" }));
    expect(onSetDefault).toHaveBeenCalledWith("banana");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    screen.getByRole("button", { name: "Make Cherry the default" }).focus();
    await user.keyboard("{Enter}");
    expect(onSetDefault).toHaveBeenCalledWith("cherry");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the default itself without onSetDefault, under defaultKey, for useDropdownDefault to read", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    function Read() {
      return <output>{useDropdownDefault("fruit", "none")}</output>;
    }
    render(
      <>
        <Dropdown label="Fruit" defaultKey="fruit" value="cherry" options={FRUIT} onChange={onChange} />
        <Read />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("none");
    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    await user.click(screen.getByRole("button", { name: "Make Banana the default" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Banana is the default" })).toBeInTheDocument();
    expect(localStorage.getItem("alpha.default.fruit")).toBe("banana");
    expect(screen.getByRole("status")).toHaveTextContent("banana");
  });

  it("chooses several: every choice highlighted, a click toggles and the list stays open", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<MultiDropdown label="Fruit" values={["apple", "cherry"]} options={FRUIT} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Fruit" });
    expect(trigger).toHaveTextContent("Apple, Cherry");
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false", "true"]);
    await user.click(screen.getByRole("option", { name: "Banana" }));
    expect(onChange).toHaveBeenLastCalledWith(["apple", "cherry", "banana"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Apple" }));
    expect(onChange).toHaveBeenLastCalledWith(["cherry"]);
    rerender(<MultiDropdown label="Fruit" values={["apple", "banana", "cherry"]} options={FRUIT} onChange={onChange} />);
    expect(trigger).toHaveTextContent("3 selected");
  });

  it("without onAdd, Add new… asks the assistant, with the dropdown's name for context", async () => {
    const say = vi.fn();
    const user = userEvent.setup();
    render(
      <AssistantProvider say={say}>
        <Dropdown label="Stage" value="a" options={[{ value: "a", label: "A" }]} onChange={vi.fn()} />
      </AssistantProvider>,
    );
    await user.click(screen.getByRole("combobox", { name: "Stage" }));
    await user.click(screen.getByRole("button", { name: "Add new…" }));
    const box = screen.getByRole("textbox", { name: "Describe what you'd like to add" });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(box, "Negotiation");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(say).toHaveBeenCalledWith('In "Stage", add: Negotiation');
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("without an assistant, Send is disabled and says why", async () => {
    const user = userEvent.setup();
    render(<Dropdown label="Stage" value="a" options={[{ value: "a", label: "A" }]} onChange={vi.fn()} />);
    await user.click(screen.getByRole("combobox", { name: "Stage" }));
    await user.click(screen.getByRole("button", { name: "Add new…" }));
    await user.type(screen.getByRole("textbox"), "Negotiation");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription("The assistant isn't reachable here.");
  });
});
