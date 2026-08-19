import { Component, type ErrorInfo, type ReactNode } from "react";

export function normalizeTerminalViewport(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function rendererDiagnostic(error: Error): string {
  const message = (error.message.trim() || error.name).replace(/\s+/g, " ");
  return message.length <= 240 ? message : `${message.slice(0, 239)}…`;
}

interface RendererErrorBoundaryProps {
  children: ReactNode;
  reloadRenderer?: () => void;
}

interface RendererErrorBoundaryState {
  error?: Error;
}

export class RendererErrorBoundary extends Component<RendererErrorBoundaryProps, RendererErrorBoundaryState> {
  state: RendererErrorBoundaryState = {};

  static getDerivedStateFromError(reason: unknown): RendererErrorBoundaryState {
    return { error: reason instanceof Error ? reason : new Error(String(reason)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Chromux Next renderer failure", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const diagnostic = rendererDiagnostic(this.state.error);
    return (
      <main className="renderer-recovery" role="alert">
        <section className="renderer-recovery-card">
          <span className="renderer-recovery-kicker">Renderer recovery</span>
          <h1>Chromux Next couldn’t render</h1>
          <p>An unexpected interface error stopped this window from rendering. Your persisted sessions remain stored.</p>
          <p className="renderer-recovery-diagnostic"><strong>Diagnostic:</strong> {diagnostic}</p>
          <button
            className="renderer-recovery-action"
            type="button"
            onClick={() => (this.props.reloadRenderer ?? (() => window.location.reload()))()}
          >
            Reload Chromux Next
          </button>
        </section>
      </main>
    );
  }
}
