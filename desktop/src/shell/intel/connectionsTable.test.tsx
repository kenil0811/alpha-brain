import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Connection, Intelligence as Data } from "../../core/client";
import { Intelligence } from "../Intelligence";
import { connectionRow, connectionsTable } from "./connectionsTable";

const conn = (id: string, connector: string, target: string, over: Partial<Connection> = {}): Connection => ({ id, connector, target, status: "connected", config: {}, last_sync: "2026-10-13T07:00:00Z", last_error: null, ...over });
const data = (connections: Connection[]): Data => ({ hands: [], skills: [], automations: [], readers: [], connections, knowledge: { facts: [], notes: [], goals: [], permissions: [] } });

describe("Intelligence's connections as a table", () => {
  it("says each connection in words, the problem column only when one has a problem", () => {
    expect(connectionRow(conn("c1", "browser", "linkedin.com")).values).toMatchObject({ what: "linkedin.com, signed in as you", kind: "Site", status: "Connected" });
    expect(connectionRow(conn("c2", "files", "/Users/k/Documents/Job search")).values.what).toBe("Documents/Job search");
    expect(connectionsTable([conn("c1", "browser", "x.com")]).fields.map((f) => f.name)).not.toContain("problem");
    expect(connectionsTable([conn("c1", "browser", "x.com", { last_error: "Signed out" })]).fields.map((f) => f.name)).toContain("problem");
  });

  it("shows them in the table with their buttons, no ›, and asks before Remove with what goes", async () => {
    const client = {
      intelligence: vi.fn().mockResolvedValue(data([conn("c1", "browser", "linkedin.com"), conn("c2", "calendar", "", { status: "needs_ok" }), conn("c3", "files", "/x/off", { status: "off" })])),
      modules: vi.fn().mockResolvedValue([]),
      preference: vi.fn().mockRejectedValue(new Error("none")),
      syncConnection: vi.fn().mockResolvedValue({}),
      connectionRemoval: vi.fn().mockResolvedValue({ connector: "browser", target: "linkedin.com", what: "Alpha's sign-in, 1 reader and 1 automation", readers: ["r"], automations: ["a"] }),
      removeConnection: vi.fn().mockResolvedValue({}),
    };
    render(<Intelligence client={client as unknown as Client} tab="connections" version={0} onTab={vi.fn()} onChanged={vi.fn()} />);
    const row = (await screen.findByText("linkedin.com, signed in as you")).closest("tr")!;
    expect(screen.queryByText("/x/off")).toBeNull(); // an Off connection isn't listed, as before
    expect(screen.getByText("Needs your OK")).toHaveClass("pill--warn");
    // what each kind can reach, once per kind, under the table
    expect(screen.getByText(/Sites: reads pages the way you would; never posts, messages or clicks\. Calendars: reads events/)).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Open/ })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Check" }));
    await waitFor(() => expect(client.syncConnection).toHaveBeenCalledWith("c1"));
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove linkedin.com, signed in as you?" });
    expect(dialog).toHaveTextContent("Removes Alpha's sign-in, 1 reader and 1 automation. Your tables keep their rows.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(client.removeConnection).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(client.removeConnection).toHaveBeenCalledWith("c1"));
  });
});
