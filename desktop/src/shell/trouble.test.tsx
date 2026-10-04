import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui";
import type { Client } from "../core/client";
import { Activity } from "./Activity";
import { People } from "./People";

describe("a page whose load failed", () => {
  it("says so and offers to try again, instead of an empty list", async () => {
    const activity = vi.fn(() => Promise.reject(new Error("Alpha's core isn't answering.")));
    render(<TooltipProvider><Activity client={{ activity } as unknown as Client} version={0} onChanged={vi.fn()} /></TooltipProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load Activity: Alpha's core isn't answering."));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    await waitFor(() => expect(activity).toHaveBeenCalledTimes(2));
  });

  it("does the same for People & Companies", async () => {
    const people = vi.fn(() => Promise.reject(new Error("gone")));
    render(<TooltipProvider><People client={{ people } as unknown as Client} version={0} onOpen={vi.fn()} /></TooltipProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load People & Companies: gone"));
  });
});
