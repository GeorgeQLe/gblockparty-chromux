# Chromux Next 0.10.3 Detection-Lease UAT

## Automated qualification

1. From `chromux-next/`, run `npm ci`, `npm run typecheck`, `npm test`, and
   `npm run package`.
2. Run `npm run smoke:packaged`, `npm run smoke:runner-restoration`, and
   `npm run smoke:browser-evidence`.
3. Run `npm run visual:packaged -- /tmp/chromux-next-0.10.3-visual` and inspect
   standard and narrow DETECT scanning, results, and configuration captures.

## Manual active-writer long-wait gate

1. Keep a real external Codex process active in a project with safely stored
   thread history. Do not stop or submit another turn from that process.
2. Open DETECT in Chromux Next and click **Continue** for that process.
3. Leave **Configure detected session** open for more than two minutes. While
   it remains open, optionally run another DETECT scan from a separate Chromux
   Next window or test instance to replace the short-lived scan cache.
4. Confirm the configured title, permission, model, and reasoning values remain
   unchanged, then click **Create continuation**.
5. Confirm a distinct Chromux-owned thread opens, the external Codex process is
   still active and untouched, and no start, resume, steer, or interrupt was
   sent to the source thread. A continuation must use `thread/fork`.
6. Repeat with **Start Fresh** and confirm it uses `thread/start` in the leased
   directory. Restart Chromux Next and confirm persisted created sessions still
   restore with `thread/resume`.
7. Exercise Back and dialog close and confirm returning to configuration needs
   a new reservation. Exercise a rejected fork/start and confirm the same form
   remains retryable. If renewal is forced to fail, confirm values remain and a
   direct **Rescan** action appears.

## Release gate

Publish `chromux-next-v0.10.3` as a prerelease titled
`GBlockParty Chromux Next v0.10.3`. Confirm the legacy stable release returned
by `/releases/latest` is unchanged.
