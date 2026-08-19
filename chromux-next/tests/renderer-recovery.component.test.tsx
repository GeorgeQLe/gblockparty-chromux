// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React, { useEffect } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RendererErrorBoundary } from "../src/renderer/recovery";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function BrokenRender(): never {
  throw new Error("render exploded with private stack details");
}

function BrokenEffect() {
  useEffect(() => {
    throw new Error("effect exploded");
  }, []);
  return <p>Loading workspace</p>;
}

describe("renderer error recovery", () => {
  it("replaces a failed render with a recoverable screen and logs the full error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    render(<RendererErrorBoundary reloadRenderer={reload}><BrokenRender /></RendererErrorBoundary>);

    expect(screen.getByRole("heading", { name: "Chromux Next couldn’t render" })).toBeVisible();
    expect(screen.getByText(/persisted sessions remain stored/i)).toBeVisible();
    expect(screen.getByText(/render exploded with private stack details/i)).toBeVisible();
    expect(screen.queryByText(/at BrokenRender/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload Chromux Next" }));
    expect(reload).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "Chromux Next renderer failure",
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it("also recovers from an effect failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<RendererErrorBoundary><BrokenEffect /></RendererErrorBoundary>);
    expect(screen.getByRole("heading", { name: "Chromux Next couldn’t render" })).toBeVisible();
    expect(screen.getByText(/effect exploded/i)).toBeVisible();
  });

  it("keeps the visible diagnostic concise while the console retains the full error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const detail = `long renderer failure ${"private detail ".repeat(40)}`;
    const BrokenLongRender = () => { throw new Error(detail); };
    render(<RendererErrorBoundary><BrokenLongRender /></RendererErrorBoundary>);
    const diagnostic = screen.getByText(/Diagnostic:/).closest("p")?.textContent ?? "";
    expect(diagnostic.length).toBeLessThanOrEqual(252);
    expect(diagnostic.endsWith("…")).toBe(true);
    expect(consoleError.mock.calls.some((call) => call.some((value) => value instanceof Error && value.message === detail))).toBe(true);
  });
});
