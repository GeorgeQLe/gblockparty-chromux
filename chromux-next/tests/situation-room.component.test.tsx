// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SituationEvent } from "../src/renderer";
import { situationRoomApprovalFixture, situationRoomQuestionFixture } from "../src/fixtures/situation-room";
import type { RoomRequest } from "../src/runner/situation-room";

vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));

afterEach(cleanup);

function request(interaction = situationRoomQuestionFixture): RoomRequest {
  return {
    interaction,
    project: "Chromux Next",
    session: {
      schemaVersion: 1, id: interaction.sessionId, title: "Release qualification", projectPath: "/work/chromux",
      canonicalProjectPath: "/work/chromux", groupId: "project", threadId: interaction.threadId, status: "idle",
      permissionPreset: "workspace", historyHydration: "complete", draft: "", createdAt: interaction.at, updatedAt: interaction.at,
      events: [{ schemaVersion: 1, id: "context", sessionId: interaction.sessionId, at: interaction.at, kind: "agent", text: "Qualification passed.", links: [] }],
      interactions: [interaction]
    }
  };
}

describe("Situation Room event", () => {
  it("renders only offered approval choices and exact amendment", () => {
    render(<SituationEvent request={request(situationRoomApprovalFixture)} sending={false} error="" later={vi.fn()} respond={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Authorize once/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Apply policy amendment/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Cancel/ })).toBeNull();
    expect(screen.getByText("Allow npm run make")).toBeTruthy();
  });

  it("requires every answer and submits the exact runner payload answers", () => {
    const respond = vi.fn();
    render(<SituationEvent request={request()} sending={false} error="" later={vi.fn()} respond={respond} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit answers/ }));
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: /Internal operators/ }));
    fireEvent.change(screen.getByLabelText("Rollout free-form answer"), { target: { value: "After a 24-hour review" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit answers/ }));
    expect(respond).toHaveBeenCalledWith("accept", { audience: ["Internal operators"], rollout: ["After a 24-hour review"] });
  });

  it("defers through Later without responding", () => {
    const later = vi.fn(); const respond = vi.fn();
    render(<SituationEvent request={request()} sending={false} error="" later={later} respond={respond} />);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(later).toHaveBeenCalledOnce();
    expect(respond).not.toHaveBeenCalled();
  });

  it("disables actions while sending and exposes retryable errors", () => {
    const { rerender } = render(<SituationEvent request={request()} sending error="" later={vi.fn()} respond={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Submit answers/ }).hasAttribute("disabled")).toBe(true);
    rerender(<SituationEvent request={request()} sending={false} error="Runner unavailable" later={vi.fn()} respond={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("Runner unavailable");
    expect(screen.getByRole("alert").textContent).toContain("retry");
  });
});
