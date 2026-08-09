import type { ReactNode } from "react";

export type CenterSurface = "runner" | "alignment" | "deck" | "canvas" | "browser";

interface PersistentSurfacesProps {
  active: CenterSurface;
  runner: ReactNode;
  alignment: ReactNode;
  deck: ReactNode;
  canvas: ReactNode;
  browser: ReactNode;
}

/**
 * Keeps every workspace mounted while presentations change. Hidden surfaces
 * retain terminal viewports, drafts, selection, and document editor state.
 */
export function PersistentSurfaces({ active, runner, alignment, deck, canvas, browser }: PersistentSurfacesProps) {
  return <>
    <div className={`surface-pane runner-pane ${active === "runner" ? "active" : ""}`} aria-hidden={active !== "runner"}>{runner}</div>
    <div className={`surface-pane ${active === "alignment" ? "active" : ""}`} aria-hidden={active !== "alignment"}>{alignment}</div>
    <div className={`surface-pane ${active === "deck" ? "active" : ""}`} aria-hidden={active !== "deck"}>{deck}</div>
    <div className={`surface-pane ${active === "canvas" ? "active" : ""}`} aria-hidden={active !== "canvas"}>{canvas}</div>
    <div className={`surface-pane ${active === "browser" ? "active" : ""}`} aria-hidden={active !== "browser"}>{browser}</div>
  </>;
}
