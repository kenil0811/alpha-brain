import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoreError, NOT_ANSWERING, type Client } from "../core/client";
import { Activity } from "./Activity";
import { People } from "./People";

describe("a page whose load failed", () => {
  it("says so and offers to try again, instead of an empty list", async () => {
    const activity = vi.fn(() => Promise.reject(new CoreError(NOT_ANSWERING, 0)));
    render(<Activity client={{ activity } as unknown as Client} version={0} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(`Couldn't load Activity: ${NOT_ANSWERING}`));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    await waitFor(() => expect(activity).toHaveBeenCalledTimes(2));
  });

  it("does the same for People & Companies", async () => {
    const people = vi.fn(() => Promise.reject(new TypeError("x is undefined")));
    render(<People client={{ people } as unknown as Client} version={0} onOpen={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load People & Companies: Something went wrong here. Try again."));
  });
});
