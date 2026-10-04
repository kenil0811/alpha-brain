import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, ModuleCard } from "../core/client";
import { TooltipProvider } from "../ui";
import { CommandMenu } from "./CommandMenu";

const modules = [{ id: "m_1", name: "Deal Tracker", goal: "Find a firm", tables: ["deal_listings"], records: 3, last_at: null, last_text: null, threads: [], created_at: "" }] as unknown as ModuleCard[];

describe("⌘K", () => {
  it("lists pages and modules, filters as you type, searches the world, and goes on Enter", async () => {
    const user = userEvent.setup();
    const search = vi.fn(async () => ({ records: [{ collection: "deal_listings", id: "r_1", snippet: "[Bakery] for sale" }], documents: [], people: [{ id: "e_1", kind: "person", name: "Vikas Badami", aliases: [], keys: {} }], journal: [] }));
    const client = { search } as unknown as Client;
    const onGo = vi.fn();
    const onAsk = vi.fn();
    render(
      <TooltipProvider>
        <CommandMenu open onOpenChange={vi.fn()} client={client} modules={modules} onGo={onGo} onAsk={onAsk} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("option", { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Deal Tracker/ })).toBeInTheDocument();
    await user.type(screen.getByRole("combobox"), "vik");
    await waitFor(() => expect(search).toHaveBeenCalledWith("vik"));
    expect(await screen.findByRole("option", { name: /Vikas Badami/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bakery for sale/ })).toHaveTextContent("Deal Tracker · deal_listings");
    expect(screen.queryByRole("option", { name: /^Home$/ })).toBeNull();
    await user.keyboard("{Enter}");
    expect(onGo).toHaveBeenCalledWith({ kind: "entity", id: "e_1" });
  });

  it("a sentence that matches nothing goes to Alpha", async () => {
    const user = userEvent.setup();
    const client = { search: vi.fn(async () => ({ records: [], documents: [], people: [], journal: [] })) } as unknown as Client;
    const onAsk = vi.fn();
    render(
      <TooltipProvider>
        <CommandMenu open onOpenChange={vi.fn()} client={client} modules={[]} onGo={vi.fn()} onAsk={onAsk} />
      </TooltipProvider>,
    );
    await user.type(screen.getByRole("combobox"), "how much protein today");
    await user.click(await screen.findByRole("option", { name: /Ask Zazoo/ }));
    expect(onAsk).toHaveBeenCalledWith("how much protein today");
  });
});
