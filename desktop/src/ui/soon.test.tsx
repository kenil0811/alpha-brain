import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SoonProvider, useComingSoon } from "./Soon";

function Undo() {
  const soon = useComingSoon();
  return <button onClick={() => soon("Undo")}>Undo</button>;
}

describe("useComingSoon", () => {
  it("says the control isn't wired yet", async () => {
    render(<SoonProvider><Undo /></SoonProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Undo is coming soon.")).toBeInTheDocument();
  });
});
