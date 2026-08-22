# GBlockParty fleet troubleshooting

- **Fleet is not visible:** fleet attachment is opt-in. Launch with
  `CHROMUX_NEXT_GBP_FLEET=1`. This does not change local runner sessions.
- **Fleet shows offline or an authentication error:** confirm the control plane
  is reachable at `CHROMUX_NEXT_CONTROL_PLANE_URL` (default
  `http://127.0.0.1:4400`). Non-dev deployments require a valid signed cookie
  in `CHROMUX_NEXT_CONTROL_PLANE_COOKIE`.
- **A terminal cannot attach:** the surface must belong to the authenticated
  user, be daemon-owned, and have an online host. Chromux Next never falls back
  to a legacy terminal URL for daemon surfaces.
- **A tab says reconnecting:** keep the tab open. Chromux Next retries with
  bounded backoff and the last sequence cursor. The daemon session continues
  independently of the client and control plane.
- **Terminal history was reset:** the requested cursor fell outside the
  daemon's bounded replay window or the daemon restarted without raw history.
  The visible reset is intentional; subsequent output remains live.
- **Closing a tab did not stop Codex:** expected. Close sends detach only. Stop
  or remove the session from the authoritative GBlockParty control plane.

Do not paste host credentials or signed cookies into bug reports. Safe reports
may include the sanitized Fleet status, opaque surface ID, app version, and the
time the failure occurred.
