// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectPicker } from "../src/renderer/project-picker";
import type { ChromuxNextApi } from "../src/ipc/bridge";

afterEach(cleanup);

describe("project picker", () => {
  it("filters like p and accepts the highlighted result with Tab", async () => {
    Object.defineProperty(window, "chromuxNext", {
      configurable: true,
      value: {
        settings: {
          searchProjects: vi.fn().mockResolvedValue({
            basePaths: ["/projects"],
            candidates: [{
              name: "chromux-next",
              path: "/projects/web/dev/chromux-next",
              relativePath: "web/dev/chromux-next",
              basePath: "/projects",
              nested: false
            }]
          })
        }
      } as unknown as ChromuxNextApi
    });
    const changed = vi.fn();
    render(<ProjectPicker projects={[]} value="" onChange={changed} chooseProject={vi.fn()} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "chrom" } });
    await screen.findByRole("option", { name: /chromux-next/ });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(changed).toHaveBeenLastCalledWith("/projects/web/dev/chromux-next");
    expect(input).toHaveValue("chromux-next");
  });

  it("keeps registered non-Git folders available when scanning fails", async () => {
    Object.defineProperty(window, "chromuxNext", {
      configurable: true,
      value: { settings: { searchProjects: vi.fn().mockRejectedValue(new Error("denied")) } } as unknown as ChromuxNextApi
    });
    render(<ProjectPicker projects={[{
      schemaVersion: 1,
      id: "folder",
      name: "notes",
      path: "/projects/notes",
      kind: "project",
      addedAt: "2026-09-01T12:00:00.000Z",
      lastUsedAt: "2026-09-01T12:00:00.000Z"
    }]} value="" onChange={vi.fn()} chooseProject={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Directory scan unavailable/)).toBeInTheDocument());
    expect(screen.getByRole("option", { name: /notes/ })).toBeInTheDocument();
  });
});
