import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, ModuleDetail } from "../core/client";
import { ModulePage } from "./ModulePage";

const detail = { id: "m_1", name: "Advisory", goal: "help clients", tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "", activity: [], note: null, goals: [], automations: [], sources: [] } as unknown as ModuleDetail;

describe("adding files to a module", () => {
  it("has a button that opens the Mac's picker and sends what was chosen the way a drop does", async () => {
    const addFiles = vi.fn(() => Promise.resolve({ documents: [{ id: "d_1", title: "RestoPros P&L.xlsx" }], turn: null }));
    const client = { module: () => Promise.resolve(detail), addFiles, modulePage: () => new Promise(() => undefined), moduleSummary: () => new Promise(() => undefined) } as unknown as Client;
    render(<ModulePage client={client} moduleId="m_1" version={0} onChanged={vi.fn()} onGo={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Add files" });
    expect(button).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "RestoPros P&L.xlsx");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(addFiles).toHaveBeenCalledWith([file], { module: "m_1" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Added RestoPros P&L.xlsx. Zazoo is reading it into the tables."));
  });
});
