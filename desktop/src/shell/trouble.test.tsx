import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoreError, NOT_ANSWERING, type Client } from "../core/client";
import { Activity } from "./Activity";
import { Network } from "./Network";
import { TooltipProvider } from "../ui";

describe("a page whose load failed", () => {
  it("says so and offers to try again, instead of an empty list", async () => {
    const activity = vi.fn(() => Promise.reject(new CoreError(NOT_ANSWERING, 0)));
    render(<Activity client={{ activity } as unknown as Client} version={0} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(`Couldn't load Activity: ${NOT_ANSWERING}`));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    await waitFor(() => expect(activity).toHaveBeenCalledTimes(2));
  });

  it("does the same for Network", async () => {
    const people = vi.fn(() => Promise.reject(new Error("raw text a person never sees")));
    const preference = vi.fn(async (key: string) => ({ key, value: null }));
    render(<TooltipProvider><Network client={{ people, preference, setPreference: vi.fn() } as unknown as Client} version={0} onOpen={vi.fn()} /></TooltipProvider>);
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("Couldn't load Network: Something went wrong. Try again."))).toBe(true));
  });
});
