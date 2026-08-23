// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunnerEventV1, RunnerSessionV1 } from "../src/runner/contracts";
import { classifyTranscript, RunnerTranscript, tokenizeAnsi } from "../src/renderer/transcript";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn() } });

afterEach(() => cleanup());

const at = "2026-08-23T12:00:00.000Z";
function event(id: string, kind: RunnerEventV1["kind"], text: string, phase?: RunnerEventV1["phase"]): RunnerEventV1 {
  return { schemaVersion: 1, id, sessionId: "session", at, kind, text, links: [], ...(phase ? { phase } : {}) };
}
function session(events: RunnerEventV1[], id = "session"): RunnerSessionV1 {
  return { schemaVersion: 1, id, title: "Transcript", projectPath: "/tmp/project", canonicalProjectPath: "/tmp/project", groupId: "group", status: "idle", permissionPreset: "workspace", historyHydration: "complete", draft: "", createdAt: at, updatedAt: at, events, interactions: [] };
}

describe("transcript classification", () => {
  it("keeps multiline prose together and splits mixed fenced and indented code in order", () => {
    expect(classifyTranscript("Hello\nwrapped reply\n\n```ts\nconst x = 1;\n```\nAfter\n\n    npm test")).toEqual([
      { type: "prose", text: "Hello\nwrapped reply" },
      { type: "code", language: "ts", text: "const x = 1;" },
      { type: "prose", text: "After" },
      { type: "code", text: "npm test" }
    ]);
  });

  it("recognizes tables, ANSI, box drawing, ASCII displays, and remote graphic links", () => {
    expect(classifyTranscript("| A | B |\n| --- | :---: |\n| 1 | 2 |")[0]).toMatchObject({ type: "table", headers: ["A", "B"], rows: [["1", "2"]] });
    expect(classifyTranscript("\x1b[31mfailed\x1b[0m")[0]?.type).toBe("terminal");
    expect(classifyTranscript("┌──┐\n│ok│\n└──┘")[0]?.type).toBe("terminal");
    expect(classifyTranscript("+----+\n| hi |\n+----+")[0]?.type).toBe("terminal");
    expect(classifyTranscript("![diagram](https://example.com/a.png)")[0]).toEqual({ type: "graphic", alt: "diagram", url: "https://example.com/a.png" });
  });

  it("treats malformed Markdown and raw HTML as inert prose and bounds input", () => {
    expect(classifyTranscript("<img src=x onerror=alert(1)>\n[broken](javascript:alert(1))")).toEqual([{ type: "prose", text: "<img src=x onerror=alert(1)>\n[broken](javascript:alert(1))" }]);
    const blocks = classifyTranscript("x".repeat(70 * 1024));
    expect(blocks[0]).toMatchObject({ type: "prose" });
    expect((blocks[0] as { text: string }).text).toHaveLength(64 * 1024);
  });

  it("preserves safe ANSI colors without retaining escape sequences", () => {
    expect(tokenizeAnsi("plain \x1b[31mred\x1b[2K\x1b]0;secret title\x07\x1b[0m end")).toEqual([
      { text: "plain " }, { text: "red", className: "ansi-31" }, { text: " end" }
    ]);
  });
});

describe("RunnerTranscript", () => {
  it("aligns roles, preserves wrapped prose inside bubbles, and keeps rich blocks full width in order", () => {
    const view = render(<RunnerTranscript session={session([
      event("u", "user", "A user message that can wrap"),
      event("a", "agent", "Reply before\n\n```js\nanswer();\n```\nReply after")
    ])} openBrowser={vi.fn()} />);
    expect(view.container.querySelector(".transcript-message.user .transcript-bubble")).toHaveTextContent("A user message that can wrap");
    expect(view.container.querySelector(".transcript-message.agent .transcript-bubble")).toHaveTextContent("Reply before");
    expect(view.container.querySelector(".transcript-code")).toHaveTextContent("answer();");
    expect([...view.container.querySelectorAll(".transcript-message.agent > *")].map((node) => node.className)).toEqual(["transcript-role", "transcript-bubble", "transcript-rich transcript-code", "transcript-bubble"]);
  });

  it("renders routine activity compactly, errors expanded, and reveals collapsed search matches", () => {
    const view = render(<RunnerTranscript session={session([
      event("command", "command", "npm test\nall passed"),
      event("error", "error", "Build failed\nmissing file", "failed")
    ])} openBrowser={vi.fn()} />);
    const details = view.container.querySelectorAll("details");
    expect(details[0]).not.toHaveAttribute("open");
    expect(details[1]).toHaveAttribute("open");
    expect(within(details[1] as HTMLElement).getAllByText("Build failed")).toHaveLength(1);
    fireEvent.click(within(details[1] as HTMLElement).getByText("error"));
    expect(details[1]).not.toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("Search transcript"), { target: { value: "passed" } });
    expect(details[0]).toHaveAttribute("open");
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("routes links and graphic cards through the browser boundary without creating images", () => {
    const openBrowser = vi.fn();
    const view = render(<RunnerTranscript session={session([
      event("a", "agent", "Read [the docs](https://example.com/docs)\n\n![chart](https://example.com/chart.png)")
    ])} openBrowser={openBrowser} />);
    fireEvent.click(screen.getByRole("button", { name: "the docs" }));
    fireEvent.click(screen.getByRole("button", { name: /chart/i }));
    expect(openBrowser).toHaveBeenNthCalledWith(1, "https://example.com/docs");
    expect(openBrowser).toHaveBeenNthCalledWith(2, "https://example.com/chart.png");
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.innerHTML).not.toContain("onerror");
  });

  it("renders raw HTML as text instead of creating active elements", () => {
    const view = render(<RunnerTranscript session={session([event("a", "agent", "<img src=https://example.com/a.png onerror=alert(1)>")])} openBrowser={vi.fn()} />);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector(".transcript-bubble")).toHaveTextContent("<img src=https://example.com/a.png onerror=alert(1)>");
  });

  it("navigates search matches and copies only the current DOM selection", () => {
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "selected text" } as Selection);
    render(<RunnerTranscript session={session([event("a", "agent", "one match and another match")])} openBrowser={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search transcript"), { target: { value: "match" } });
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next transcript match"));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Search transcript"), { key: "Enter", shiftKey: true });
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("selected text");
    selection.mockRestore();
  });

  it("updates a streaming event in place without duplicating its bubble", () => {
    const first = session([event("stream", "agent", "Hel", "delta")]);
    const view = render(<RunnerTranscript session={first} openBrowser={vi.fn()} />);
    view.rerender(<RunnerTranscript session={session([event("stream", "agent", "Hello", "completed")])} openBrowser={vi.fn()} />);
    expect(view.container.querySelectorAll(".transcript-message.agent")).toHaveLength(1);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByText("Hel")).not.toBeInTheDocument();
  });

  it("restores session scroll and follows updates only while already near the bottom", () => {
    const first = session([event("a", "agent", "first")], "first");
    const second = session([event("b", "agent", "second")], "second");
    const view = render(<RunnerTranscript session={first} openBrowser={vi.fn()} />);
    const host = view.container.querySelector(".transcript-scroll") as HTMLDivElement;
    Object.defineProperties(host, { scrollHeight: { configurable: true, value: 500 }, clientHeight: { configurable: true, value: 100 } });
    host.scrollTop = 300;
    view.rerender(<RunnerTranscript session={session([...first.events, event("a2", "agent", "new")], "first")} openBrowser={vi.fn()} />);
    expect(host.scrollTop).toBe(300);
    host.scrollTop = 350;
    view.rerender(<RunnerTranscript session={session([...first.events, event("a3", "agent", "newer")], "first")} openBrowser={vi.fn()} />);
    expect(host.scrollTop).toBe(500);
    host.scrollTop = 123;
    view.rerender(<RunnerTranscript session={second} openBrowser={vi.fn()} />);
    expect(host.scrollTop).toBe(500);
    host.scrollTop = 42;
    view.rerender(<RunnerTranscript session={first} openBrowser={vi.fn()} />);
    expect(host.scrollTop).toBe(123);
  });

  it("renders semantic tables and keyboard-focusable transcript content", () => {
    const view = render(<RunnerTranscript session={session([event("a", "agent", "| Name | State |\n| --- | --- |\n| Ship | Ready |")])} openBrowser={vi.fn()} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(view.container.querySelector(".transcript-scroll")).toHaveAttribute("tabindex", "0");
  });
});
