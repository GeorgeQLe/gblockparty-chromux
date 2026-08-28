import React, { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Cloud, LockKeyhole, Monitor, RefreshCw, ShieldCheck, Unplug, UnlockKeyhole, X } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, IconButton } from "../ui/components";
import type { AttachmentEvent, FleetState, RemoteTab } from "./contracts";
import "@xterm/xterm/css/xterm.css";

export function FleetFeature({ fleet, open, close, refresh, fail, onTabsChanged }: {
  fleet: FleetState;
  open: boolean;
  close(): void;
  refresh(): void;
  fail(reason: unknown): void;
  onTabsChanged?(tabs: RemoteTab[]): void;
}) {
  const [tabs, setTabs] = useState<RemoteTab[]>([]);
  const [activeSurfaceId, setActiveSurfaceId] = useState<string>();
  const [endpoint, setEndpoint] = useState(fleet.enrollment.endpoint ?? "http://127.0.0.1:4400");
  const [code, setCode] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Chromux Next on Mac");
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => window.chromuxNext.fleet.onAttachment((event) => {
    if (event.type !== "state") return;
    setTabs((current) => current.some((tab) => tab.surfaceId === event.tab.surfaceId)
      ? current.map((tab) => tab.surfaceId === event.tab.surfaceId ? event.tab : tab)
      : [...current, event.tab]);
  }), []);
  useEffect(() => onTabsChanged?.(tabs), [tabs, onTabsChanged]);
  useEffect(() => {
    const activate = (event: Event) => {
      const surfaceId = (event as CustomEvent<string>).detail;
      if (tabs.some((tab) => tab.surfaceId === surfaceId)) setActiveSurfaceId(surfaceId);
    };
    window.addEventListener("chromux:fleet-activate", activate);
    return () => window.removeEventListener("chromux:fleet-activate", activate);
  }, [tabs]);

  const attach = (surfaceId: string, title: string) => {
    const existing = tabs.find((tab) => tab.surfaceId === surfaceId);
    if (existing) { setActiveSurfaceId(surfaceId); close(); return; }
    void window.chromuxNext.fleet.attach(surfaceId, title).then((tab) => {
      setTabs((current) => [...current.filter((item) => item.surfaceId !== tab.surfaceId), tab]);
      setActiveSurfaceId(tab.surfaceId); close();
    }).catch(fail);
  };
  const detach = (surfaceId: string) => {
    void window.chromuxNext.fleet.detach(surfaceId).catch(fail);
    setTabs((current) => current.filter((tab) => tab.surfaceId !== surfaceId));
    setActiveSurfaceId((active) => active === surfaceId ? undefined : active);
  };
  const enroll = (event: React.FormEvent) => {
    event.preventDefault(); setEnrolling(true);
    void window.chromuxNext.fleet.enroll({ endpoint, code, deviceLabel }).then(() => setCode("")).catch(fail).finally(() => setEnrolling(false));
  };
  const forget = () => { void window.chromuxNext.fleet.forgetEnrollment().catch(fail); };

  return <>
    {open && <Dialog className="fleet-dialog" eyebrow="GBlockParty" title="Fleet terminals" description="Attach to daemon-owned sessions without launching, stopping, or exposing host paths." close={close} footer={<>{fleet.enrollment.status === "enrolled" && <Button icon={RefreshCw} loading={fleet.connection === "loading"} onClick={refresh}>Refresh fleet</Button>}<Button tone="quiet" onClick={close}>Done</Button></>}>
      {fleet.enrollment.status !== "enrolled" ? <form className="fleet-enrollment" onSubmit={enroll}>
        <div className="fleet-enrollment-heading"><ShieldCheck size={20} /><div><strong>{fleet.enrollment.status === "revoked" ? "Device access revoked" : "Enroll this device"}</strong><p>Use a one-time code from GBlockParty. The resulting device credential is encrypted with macOS protected storage and never enters renderer state.</p></div></div>
        {(fleet.enrollment.error || fleet.error) && <p className="fleet-error">{fleet.enrollment.error ?? fleet.error}</p>}
        <Field label="Control-plane endpoint"><input type="url" required value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://fleet.example.com" /></Field>
        <div className="fleet-enrollment-grid"><Field label="One-time enrollment code"><input type="password" required minLength={16} maxLength={256} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /></Field><Field label="Device label"><input required maxLength={120} value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} /></Field></div>
        <Button type="submit" icon={ShieldCheck} tone="primary" loading={enrolling}>Enroll securely</Button>
      </form> : <>
        <div className="fleet-device"><div><ShieldCheck size={17} /><span><strong>{fleet.enrollment.deviceLabel}</strong><small>{fleet.enrollment.endpoint}</small></span></div>{fleet.enrollment.deviceId && <Button tone="quiet" onClick={forget}>Forget device</Button>}</div>
      <div className="fleet-summary"><Badge tone={fleet.connection === "ready" ? "success" : fleet.connection === "error" ? "danger" : "neutral"}>{fleet.connection}</Badge><span>{fleet.items.length} terminal{fleet.items.length === 1 ? "" : "s"}</span>{fleet.refreshedAt && <small>Updated {new Date(fleet.refreshedAt).toLocaleTimeString()}</small>}</div>
      {fleet.error && <p className="fleet-error">{fleet.error}</p>}
      <div className="fleet-list">{fleet.items.map((item) => <article className="fleet-row" key={item.surfaceId}>
        <div className="fleet-row-main"><span className={`fleet-status ${item.hostStatus}`} /><div><strong>{item.sessionName}</strong><p>{item.workspaceName} · {item.toolId}</p></div></div>
        <div className="fleet-row-meta"><span>{item.hostName}</span><Badge tone={item.attention === "error" ? "danger" : item.attention === "approval_required" ? "warning" : item.attention === "completed" ? "success" : "neutral"}>{item.status.replaceAll("_", " ")}</Badge></div>
        <Button icon={Monitor} tone={item.attachable ? "primary" : "quiet"} disabled={!item.attachable} onClick={() => attach(item.surfaceId, item.sessionName)}>{tabs.some((tab) => tab.surfaceId === item.surfaceId) ? "Open tab" : "Attach"}</Button>
      </article>)}{fleet.connection !== "loading" && !fleet.items.length && <EmptyState icon={Cloud} title="No fleet terminals" description="Start the local control plane and host daemon, then refresh. Local Chromux Next sessions remain available." />}</div></>}
    </Dialog>}
    {tabs.length > 0 && <div className={`remote-tab-dock ${activeSurfaceId ? "active" : ""}`}>
      <nav aria-label="GBlockParty terminal tabs"><button className={!activeSurfaceId ? "active" : ""} onClick={() => setActiveSurfaceId(undefined)}>Local workspace</button>{tabs.map((tab) => <div className="remote-tab" key={tab.surfaceId}><button className={activeSurfaceId === tab.surfaceId ? "active" : ""} onClick={() => setActiveSurfaceId(tab.surfaceId)}><span className={`fleet-status ${tab.status}`} />{tab.title}</button><IconButton icon={X} label={`Detach ${tab.title}`} onClick={() => detach(tab.surfaceId)} /></div>)}</nav>
      {tabs.map((tab) => <RemoteTerminalPane key={tab.surfaceId} tab={tab} active={activeSurfaceId === tab.surfaceId} fail={fail} />)}
    </div>}
  </>;
}

function RemoteTerminalPane({ tab, active, fail }: { tab: RemoteTab; active: boolean; fail(reason: unknown): void }) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);
  useEffect(() => {
    if (!host.current) return;
    const instance = new Terminal({ cursorBlink: true, convertEol: true, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, theme: { background: "#0d0f10", foreground: "#e7e9e8", cursor: "#9fc5ad" }, scrollback: 10_000 });
    const fitAddon = new FitAddon(); instance.loadAddon(fitAddon); instance.open(host.current); terminal.current = instance; fit.current = fitAddon;
    instance.options.disableStdin = tab.control !== "controlled" && tab.control !== "unleased";
    const input = instance.onData((data) => void window.chromuxNext.fleet.input(tab.surfaceId, data).catch(fail));
    const sendSize = () => { try { fitAddon.fit(); void window.chromuxNext.fleet.resize(tab.surfaceId, instance.cols, instance.rows).catch(() => undefined); } catch { /* hidden pane */ } };
    const observer = new ResizeObserver(sendSize); observer.observe(host.current); if (active) sendSize();
    const off = window.chromuxNext.fleet.onAttachment((event: AttachmentEvent) => {
      if (event.type === "state") return;
      if (event.surfaceId !== tab.surfaceId || !terminal.current) return;
      if (event.type === "output") terminal.current.write(event.data);
      if (event.type === "reset") { terminal.current.clear(); terminal.current.write("\r\n\x1b[33mTerminal history reset: replay gap detected.\x1b[0m\r\n"); }
    });
    return () => { off(); observer.disconnect(); input.dispose(); instance.dispose(); terminal.current = undefined; };
  }, [tab.surfaceId]);
  useEffect(() => { if (terminal.current) terminal.current.options.disableStdin = tab.control !== "controlled" && tab.control !== "unleased"; }, [tab.control]);
  useEffect(() => { if (active) requestAnimationFrame(() => { try { fit.current?.fit(); } catch { /* pane not measurable yet */ } }); }, [active]);
  return <section className={`remote-terminal-workspace ${active ? "active" : ""}`} aria-hidden={!active}>
    <header><div><span>GBlockParty terminal</span><h2>{tab.title}</h2></div><div className="remote-terminal-state"><Badge tone={tab.status === "connected" ? "success" : tab.status === "error" ? "danger" : "warning"}>{tab.status}</Badge><Badge tone={tab.control === "controlled" || tab.control === "unleased" ? "success" : tab.control === "contended" ? "warning" : "neutral"}>{tab.control.replaceAll("_", " ")}</Badge>{tab.resetCount > 0 && <Badge tone="warning">history reset</Badge>}{tab.authority === "leased" && tab.status === "connected" && (tab.control === "controlled" ? <Button icon={UnlockKeyhole} tone="quiet" onClick={() => void window.chromuxNext.fleet.releaseControl(tab.surfaceId).catch(fail)}>Release control</Button> : <Button icon={LockKeyhole} tone="primary" loading={tab.control === "requesting"} onClick={() => void window.chromuxNext.fleet.requestControl(tab.surfaceId).catch(fail)}>Request control</Button>)}</div></header>
    {tab.control === "contended" && <div className="remote-terminal-notice"><LockKeyhole size={16} />Read-only: terminal control is held by {tab.leaseHolder ?? "another device"}.</div>}
    {tab.authority === "leased" && tab.control === "read_only" && <div className="remote-terminal-notice"><LockKeyhole size={16} />Read-only. Request control before typing; the server remains the authority boundary.</div>}
    {tab.error && <div className="remote-terminal-error"><Unplug size={16} />{tab.error}</div>}
    <div className="remote-terminal-host" ref={host} />
  </section>;
}
