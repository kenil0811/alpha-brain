import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserRow } from "./Settings";
import type { BrowserStatus, Client } from "../core/client";

const absent: BrowserStatus = { installed: false, installing: false, words: null, chrome: false, problem: null };

describe("the browser Alpha reads with (first run)", () => {
  it("offers Install when absent and shows the installer's words once it runs", async () => {
    const installing: BrowserStatus = { ...absent, installing: true, words: "Downloading Chromium 151.0.7922.34… 40% of 160.4 MiB" };
    const client = { browser: vi.fn().mockResolvedValue(installing), installBrowser: vi.fn().mockResolvedValue(installing) } as unknown as Client;
    const onStatus = vi.fn();
    render(<BrowserRow client={client} status={absent} onStatus={onStatus} />);
    expect(screen.getByText(/downloads about 250 MB, once/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith(installing));
    expect(client.installBrowser).toHaveBeenCalledTimes(1);
  });

  it("says where sign-in windows open once installed, and Try again after a failure", () => {
    const client = {} as Client;
    const { rerender } = render(<BrowserRow client={client} status={{ ...absent, installed: true, chrome: true }} onStatus={vi.fn()} />);
    expect(screen.getByText("Installed · sign-in windows open in your Chrome")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<BrowserRow client={client} status={{ ...absent, problem: "The browser didn't install: Error: getaddrinfo ENOTFOUND cdn" }} onStatus={vi.fn()} />);
    expect(screen.getByText(/didn't install/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
