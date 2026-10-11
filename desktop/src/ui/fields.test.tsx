import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateField, NumberField } from ".";

function Num({ onChange, unit, start = null }: { onChange: (n: number | null) => void; unit?: string; start?: number | null }) {
  const [v, setV] = useState<number | null>(start);
  return <NumberField label="Amount" unit={unit} value={v} onChange={(n) => { setV(n); onChange(n); }} />;
}

function Day({ onChange, withTime, required, start = null }: { onChange: (v: string | null) => void; withTime?: boolean; required?: boolean; start?: string | null }) {
  const [v, setV] = useState<string | null>(start);
  return <DateField label="Due" withTime={withTime} required={required} value={v} onChange={(x) => { setV(x); onChange(x); }} />;
}

describe("NumberField", () => {
  it("reads 1.2k on leaving, tidies it, and right-aligns tabular figures", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Num onChange={onChange} />);
    const box = screen.getByRole("textbox", { name: "Amount" });
    expect(box).toHaveClass("numfield__input");
    await user.type(box, "1.2k");
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(1200);
    expect(box).toHaveValue("1,200");
  });

  it("keeps text it can't read, says so, and reports nothing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Num onChange={onChange} start={5} />);
    const box = screen.getByRole("textbox", { name: "Amount" });
    await user.clear(box);
    await user.type(box, "320 kcal{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveValue("320 kcal");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't read that as a number.");
    expect(box).toHaveAccessibleDescription("Couldn't read that as a number.");
    await user.type(box, "x"); // typing again clears the line
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("takes the field's own unit, and empties to null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Num onChange={onChange} unit="kcal" start={1} />);
    const box = screen.getByRole("textbox", { name: "Amount" });
    await user.clear(box);
    await user.type(box, "1 320 kcal{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(1320);
    await user.clear(box);
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("DateField", () => {
  it("reads 13/10 day first, tidies it to the house format, and reports the day", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Day onChange={onChange} start="2026-09-01" />);
    const box = screen.getByRole("textbox", { name: "Due" });
    expect(box).toHaveValue("1 Sep 2026");
    await user.clear(box);
    await user.type(box, "13/10/2026");
    await user.tab(); // to the calendar button: tidied, still in the field
    expect(box).toHaveValue("13 Oct 2026");
    expect(onChange).not.toHaveBeenCalled();
    await user.tab(); // out of the field: reported
    expect(onChange).toHaveBeenCalledWith("2026-10-13");
  });

  it("takes a time with a date-time", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Day onChange={onChange} withTime />);
    await user.type(screen.getByRole("textbox", { name: "Due" }), "13 Oct 2026 2:30pm{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-10-13T14:30");
    expect(screen.getByRole("textbox", { name: "Due" })).toHaveValue("13 Oct 2026, 14:30");
  });

  it("never empties what it can't read, and refuses empty when required", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Day onChange={onChange} required start="2026-09-01" />);
    const box = screen.getByRole("textbox", { name: "Due" });
    await user.clear(box);
    await user.type(box, "13/13{Enter}");
    expect(box).toHaveValue("13/13");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't read that as a date. Try 13 Oct 2026.");
    await user.clear(box);
    await user.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("A date is needed here");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the calendar opens on the chosen day; arrows move, Enter picks, Escape returns to the button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Day onChange={onChange} start="2026-10-13" />);
    const button = screen.getByRole("button", { name: "Calendar for Due" });
    await user.click(button);
    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "13 Oct 2026" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(screen.getByRole("button", { name: "21 Oct 2026" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-10-21");
    expect(screen.getByRole("textbox", { name: "Due" })).toHaveValue("21 Oct 2026");
    expect(screen.queryByRole("grid")).toBeNull();

    await user.click(button);
    await user.keyboard("{PageDown}");
    expect(screen.getByRole("button", { name: "21 Nov 2026" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("grid")).toBeNull();
    expect(button).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
