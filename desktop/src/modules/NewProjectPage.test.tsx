import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { TooltipProvider } from "../ui";
import { NewProjectPage } from "./NewProjectPage";

function page(onSay = vi.fn(), onOpenChat?: () => void) {
  render(
    <TooltipProvider>
      <NewProjectPage client={{} as Client} onSay={onSay} onGo={vi.fn()} onOpenChat={onOpenChat} />
    </TooltipProvider>,
  );
  return onSay;
}

describe("a new project", () => {
  it("asks for a name, shows its one empty table, and Create project waits for a name", () => {
    page();
    expect(screen.getByRole("heading", { level: 1, name: "New project" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "The new project's first table" });
    expect(within(table).getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "New" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  it("sends the sentence with its purpose, then says Alpha is building it and links to the conversation", async () => {
    const user = userEvent.setup();
    const onOpenChat = vi.fn();
    const onSay = page(vi.fn(), onOpenChat);
    await user.type(screen.getByLabelText("Name"), "Deals");
    await user.type(screen.getByLabelText("What is it for? (optional)"), "the restaurants I advise");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect(onSay).toHaveBeenCalledWith('Make a new project called "Deals": the restaurants I advise. Start it with one table.');
    expect(screen.getByText(/Alpha is building it — it'll appear in the sidebar when it's ready\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See the conversation" }));
    expect(onOpenChat).toHaveBeenCalled();
  });

  it("Enter in the name submits, without a purpose", async () => {
    const user = userEvent.setup();
    const onSay = page();
    await user.type(screen.getByLabelText("Name"), "Hiring{Enter}");
    expect(onSay).toHaveBeenCalledWith('Make a new project called "Hiring". Start it with one table.');
    expect(onSay).toHaveBeenCalledTimes(1);
  });
});
