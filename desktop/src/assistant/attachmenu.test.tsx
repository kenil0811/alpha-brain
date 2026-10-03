import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../ui";
import { AttachMenu, useComposerFiles } from "./AttachMenu";

function Composer() {
  return (
    <form aria-label="Composer" {...useComposerFiles()}>
      <AttachMenu />
    </form>
  );
}

describe("AttachMenu", () => {
  it("says adding files is coming soon, from the + menu and from a drop", async () => {
    render(<ToastProvider><Composer /></ToastProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Add files, images, a folder or audio" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Add a folder" }));
    expect(await screen.findByText("Adding a folder is coming soon.")).toBeInTheDocument();

    const file = new File(["x"], "notes.txt");
    fireEvent.drop(screen.getByRole("form", { name: "Composer" }), { dataTransfer: { files: [file], types: ["Files"] } });
    expect(await screen.findByText("Adding files is coming soon.")).toBeInTheDocument();
  });

  it("leaves a text drop alone", () => {
    render(<ToastProvider><Composer /></ToastProvider>);
    fireEvent.drop(screen.getByRole("form", { name: "Composer" }), { dataTransfer: { files: [], types: ["text/plain"] } });
    expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument();
  });
});
