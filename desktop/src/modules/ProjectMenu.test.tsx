import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { SoonProvider } from "../ui";
import { ProjectMenu } from "./ProjectMenu";

function menu(parent: string | null) {
  const client = { createModule: vi.fn(async () => ({ id: "m2", name: "Leads" })), moveModule: vi.fn(async () => ({})) };
  const onGo = vi.fn();
  const onChanged = vi.fn();
  render(
    <SoonProvider>
      <ProjectMenu client={client as unknown as Client} module={{ id: "m1", name: "Deals", parent }} onGo={onGo} onChanged={onChanged} trigger={<button type="button">Deals options</button>} />
    </SoonProvider>,
  );
  return { client, onGo, onChanged };
}

describe("a project's menu", () => {
  it("Add sub project makes one inside it on the core and opens it", async () => {
    const user = userEvent.setup();
    const { client, onGo } = menu(null);
    await user.click(screen.getByRole("button", { name: "Deals options" }));
    expect(screen.queryByRole("menuitem", { name: "Take out" })).not.toBeInTheDocument(); // at the top already
    await user.click(screen.getByRole("menuitem", { name: "Add sub project…" }));
    await user.type(screen.getByRole("textbox", { name: "The sub project's name" }), "Leads{Enter}");
    await waitFor(() => expect(client.createModule).toHaveBeenCalledWith("Leads", null, "m1"));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m2" });
  });

  it("Take out moves it to the top; Rename says it is coming soon", async () => {
    const user = userEvent.setup();
    const { client } = menu("m0");
    await user.click(screen.getByRole("button", { name: "Deals options" }));
    await user.click(screen.getByRole("menuitem", { name: "Take out" }));
    await waitFor(() => expect(client.moveModule).toHaveBeenCalledWith("m1", null));
    await user.click(screen.getByRole("button", { name: "Deals options" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(await screen.findByText("Renaming a project is coming soon.")).toBeInTheDocument();
  });
});
