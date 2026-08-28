# GBlockParty fleet troubleshooting

- **Fleet is not visible:** fleet attachment is opt-in. Launch with
  `CHROMUX_NEXT_GBP_FLEET=1`. This does not change local runner sessions.
- **Fleet asks to enroll:** create a one-time external-device code in the
  authenticated GBlockParty web control plane, then enter its endpoint, code,
  and a recognizable Mac label. Codes are single-use and expire.
- **Fleet shows revoked:** the server closed this enrolled device's authority
  and Chromux deleted its protected credential. Generate a new one-time code
  and enroll again. Local Chromux sessions are unaffected.
- **A terminal cannot attach:** the surface must belong to the authenticated
  user, be daemon-owned, and have an online host. Chromux Next never falls back
  to a legacy terminal URL for daemon surfaces.
- **A tab says reconnecting:** keep the tab open. Chromux Next retries with
  bounded backoff and the last sequence cursor. The daemon session continues
  independently of the client and control plane.
- **Typing does nothing:** enrolled devices attach read-only. Select **Request
  control**. If another device is the writer, its label is shown; retry after
  it releases or its 15-second server lease expires. Disconnects and expiry
  always return Chromux to read-only.
- **Terminal history was reset:** the requested cursor fell outside the
  daemon's bounded replay window or the daemon restarted without raw history.
  The visible reset is intentional; subsequent output remains live.
- **Closing a tab did not stop Codex:** expected. Close sends detach only. Stop
  or remove the session from the authoritative GBlockParty control plane.

Do not paste host credentials or signed cookies into bug reports. Safe reports
may include the sanitized Fleet status, opaque surface ID, app version, and the
time the failure occurred.
