import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Breadcrumb, Button, EmptyCard, HeaderSwitch, IconButton, MetricTile, Notice, PageHeader, SectionCard, Trouble } from ".";
import { ActivityIcon, Calendar, Table2, X } from "./icons";

describe("disabled with a reason", () => {
  it("a button with a reason is disabled and says why on hover", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button disabledReason="Connect a billing provider first." onClick={onClick}>Send invoice</Button>);
    const button = screen.getByRole("button", { name: "Send invoice" });
    expect(button).toBeDisabled();
    await user.hover(button.parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Connect a billing provider first.");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("the reason is reachable by keyboard: Tab lands on it, shows it, and a screen reader hears it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button disabledReason="Needs a date field.">Calendar</Button>
        <IconButton label="Delete" icon={<X />} disabledReason="Nothing is selected." />
      </>,
    );
    await user.tab();
    expect(document.activeElement).toHaveClass("reason");
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Needs a date field.");
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAccessibleDescription("Needs a date field.");
    await user.tab();
    expect(await screen.findByText("Nothing is selected.", { selector: '[role="tooltip"]' })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAccessibleDescription("Nothing is selected.");
  });

  it("without a reason they are the plain buttons they were", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("btn", "btn--danger");
    expect(screen.getByRole("button", { name: "Delete" }).parentElement?.className).not.toContain("reason");
  });
});

describe("the header switch", () => {
  const items = [
    { id: "data", label: "Data", icon: <Table2 /> },
    { id: "calendar", label: "Calendar", icon: <Calendar /> },
    { id: "activity", label: "Activity", icon: <ActivityIcon /> },
  ];
  const real = { offset: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"), client: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth") };
  afterEach(() => {
    if (real.offset) Object.defineProperty(HTMLElement.prototype, "offsetWidth", real.offset);
    if (real.client) Object.defineProperty(HTMLElement.prototype, "clientWidth", real.client);
    vi.unstubAllGlobals();
  });

  it("shows labels with icons, raises the active one and moves with the arrow keys", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<HeaderSwitch label="Sections" items={items} value="data" onChange={onChange} />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toHaveClass("hswitch");
    expect(screen.getByRole("tab", { name: "Data" })).toHaveAttribute("aria-selected", "true");
    screen.getByRole("tab", { name: "Data" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("calendar");
  });

  it("drops the labels, not the names, when it does not fit", async () => {
    // only the switch's own observer is driven by hand; the tooltip's is left alone
    let watch: () => void = () => {};
    vi.stubGlobal("ResizeObserver", class {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; }
      observe(el: Element) { if (el.classList.contains("hswitch__box")) watch = this.cb; }
      disconnect() {}
    });
    let room = 600;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return this.classList.contains("hswitch") ? 300 : 0; } });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.classList.contains("hswitch__box") ? room : 0; } });
    const user = userEvent.setup();
    render(<HeaderSwitch label="Sections" items={items} value="data" onChange={vi.fn()} />);
    expect(screen.getByRole("tablist")).not.toHaveClass("hswitch--icons");
    expect(screen.getByRole("tab", { name: "Calendar" })).toHaveTextContent("Calendar");

    room = 150;
    act(() => watch());
    expect(screen.getByRole("tablist")).toHaveClass("hswitch--icons");
    const calendar = screen.getByRole("tab", { name: "Calendar" }); // the name stays
    expect(calendar).toHaveTextContent("");
    await user.hover(calendar);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Calendar");

    room = 600;
    act(() => watch());
    expect(screen.getByRole("tablist")).not.toHaveClass("hswitch--icons");
  });
});

describe("the page header", () => {
  it("has a left, a centre and a right slot; a single-section page shows its title in serif", () => {
    render(<PageHeader left={<span>Back</span>} title="Settings" right={<button type="button">More</button>} />);
    const head = screen.getByRole("banner");
    expect(within(head).getByRole("heading", { level: 1, name: "Settings" })).toHaveClass("serif");
    expect(within(head).getByText("Back")).toBeInTheDocument();
    expect(within(head).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("takes a centre in place of a title", () => {
    render(<PageHeader centre={<span>Switch</span>} />);
    expect(screen.getByText("Switch")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("a breadcrumb opens every item but the last, which is the current page, plain", async () => {
    const onHome = vi.fn();
    const user = userEvent.setup();
    render(<Breadcrumb items={[{ label: "Home", onClick: onHome }, { label: "Deals", onClick: vi.fn() }, { label: "Acme renewal" }]} />);
    await user.click(screen.getByRole("button", { name: "Home" }));
    expect(onHome).toHaveBeenCalled();
    expect(screen.getByText("Acme renewal")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Acme renewal" })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("cards and notices", () => {
  it("a metric tile says what the number is based on, and can ask for attention", () => {
    render(<MetricTile icon={<X />} label="Overdue" value={4} basis="Based on 12 open tasks" attention cta={<Button size="sm">Review</Button>} />);
    const tile = screen.getByText("Overdue").closest(".mtile") as HTMLElement;
    expect(tile).toHaveClass("mtile--attention");
    expect(within(tile).getByText("4")).toHaveClass("mtile__big");
    expect(within(tile).getByText("Based on 12 open tasks")).toBeInTheDocument();
    expect(within(tile).getByRole("button", { name: "Review" })).toBeInTheDocument();
  });

  it("a section card has a title, a one-line subtitle, actions and content; an empty card says so plainly", () => {
    render(
      <>
        <SectionCard title="Sources" subtitle="Where this module reads from" actions={<Button size="sm">Add</Button>}>
          <p>Inside</p>
        </SectionCard>
        <EmptyCard icon={<X />} title="Nothing configured yet">Add a source and Alpha will read it.</EmptyCard>
      </>,
    );
    const card = screen.getByRole("region", { name: "Sources" });
    expect(within(card).getByRole("heading", { level: 3, name: "Sources" })).toBeInTheDocument();
    expect(within(card).getByText("Where this module reads from")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(within(card).getByText("Inside")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nothing configured yet" }).closest(".ecard")).toHaveTextContent("Add a source and Alpha will read it.");
  });

  it("a notice is an accent line, a red line or a pale red banner, and offers Try again", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Notice>Saved.</Notice>);
    expect(screen.getByRole("status")).toHaveClass("notice", "notice--ok");
    rerender(<Notice tone="bad">Couldn't save.</Notice>);
    expect(screen.getByRole("alert")).not.toHaveClass("notice--ok");
    rerender(<Notice banner onRetry={retry}>Alpha's core isn't answering.</Notice>);
    expect(screen.getByRole("alert")).toHaveClass("notice--banner");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });

  it("Trouble is a red notice with the way to try again", () => {
    render(<Trouble onRetry={vi.fn()}>Couldn't load Deals.</Trouble>);
    expect(screen.getByRole("alert")).toHaveClass("notice", "trouble");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
