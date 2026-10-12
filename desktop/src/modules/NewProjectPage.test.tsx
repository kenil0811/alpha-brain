import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { TooltipProvider } from "../ui";
import { NewProjectPage } from "./NewProjectPage";

const client = { preference: vi.fn().mockResolvedValue({ value: null }), setPreference: vi.fn().mockResolvedValue(undefined) } as unknown as Client;

function page(onSay = vi.fn(), onOpenChat?: () => void, onCancel = vi.fn()) {
  render(
    <TooltipProvider>
      <NewProjectPage client={client} onSay={onSay} onGo={vi.fn()} onOpenChat={onOpenChat} onCancel={onCancel} />
    </TooltipProvider>,
  );
  return onSay;
}

describe("a new project", () => {
  it("asks for a name, shows its one empty table in the data view, and Create project waits for a name", async () => {
    page();
    expect(screen.getByRole("heading", { level: 1, name: "New project" })).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  it("has a Cancel that leaves without making anything (every create has one)", async () => {
    const user = userEvent.setup();
    const onSay = vi.fn();
    const onCancel = vi.fn();
    page(onSay, undefined, onCancel);
    await user.type(screen.getByLabelText("Name"), "Deals");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSay).not.toHaveBeenCalled();
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
