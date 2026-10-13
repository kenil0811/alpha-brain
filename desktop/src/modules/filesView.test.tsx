import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, FileItem } from "../core/client";
import { FilesView, usedByWords } from "./FilesView";

const file = (id: string, title: string, over: Partial<FileItem> = {}): FileItem => ({ id, path: `/x/${title}`, title, kind: "txt", size: 4096, module: "m_a", origin: "the person", added_at: "2026-10-13T09:30:00Z", from_folder: false, about: null, used_by: [], ...over });

function core() {
  return {
    preference: vi.fn(async (key: string) => ({ key, value: null })),
    documentRemoval: vi.fn(async () => ({ document: "d1", title: "march.txt", used_by: [], what: "its text Alpha read, and the file is taken out of 1 record" })),
    deleteDocument: vi.fn(async () => ({})),
  };
}

describe("a module's files (slice 2)", () => {
  it("says which records hold a file", () => {
    expect(usedByWords(file("d1", "a.txt"))).toBeNull();
    expect(usedByWords(file("d1", "a.txt", { used_by: [{ collection: "s", table: "Statements", record: "r1", title: "March", field: "file" }, { collection: "s", table: "Statements", record: "r2", title: "April", field: "file" }] }))).toBe("Statements: March, and 1 more");
  });

  it("lists them with their date and kind; Delete asks with what goes and that rows stay", async () => {
    const c = core();
    const onChanged = vi.fn();
    render(<FilesView client={c as unknown as Client} files={[file("d1", "march.txt"), file("d2", "cv.pdf", { kind: "pdf", from_folder: true })]} tableKey="files_m_a" onChanged={onChanged} />);
    const row = (await screen.findByText("march.txt")).closest("tr")!;
    expect(within(row).getByText("TXT")).toBeInTheDocument();
    expect(within(row).getByText("Added here")).toBeInTheDocument();
    const folder = screen.getByText("cv.pdf").closest("tr")!;
    expect(within(folder).getByRole("button", { name: "Delete…" })).toBeDisabled(); // the person's own file
    fireEvent.click(within(row).getByRole("button", { name: "Delete…" }));
    const d = await screen.findByRole("dialog", { name: "Delete march.txt?" });
    expect(d).toHaveTextContent("Deletes march.txt: its text Alpha read, and the file is taken out of 1 record. Rows Alpha read from it stay");
    fireEvent.click(within(d).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(c.deleteDocument).toHaveBeenCalledWith("d1"));
    expect(onChanged).toHaveBeenCalled();
  });
});
