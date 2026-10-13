import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecordRow } from "../../core/client";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";

const row: RecordRow = { id: "r1", revision: 1, values: { title: "Bakery" }, created_at: "", updated_at: "", provenance: { by: "person" }, seen_at: null, gone_at: null, entity: null };
const fields = [{ name: "title", kind: "text" }];

describe("a card opens its record's page on a double-click, never on a click (12 Oct)", () => {
  it("in the gallery", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<GalleryView rows={[row]} fields={fields} titleField="title" onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: /Bakery/ }));
    expect(onOpen).not.toHaveBeenCalled();
    await user.dblClick(screen.getByRole("button", { name: /Bakery/ }));
    expect(onOpen).toHaveBeenCalledWith("r1");
  });

  it("in the list, and Enter opens it from the keyboard", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ListView rows={[row]} bodyRef={{ current: null }} titleField="title" columns={["title"]} byName={new Map(fields.map((f) => [f.name, f]))} onOpen={onOpen} />);
    screen.getByRole("button", { name: /Bakery/ }).focus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("r1");
  });
});
