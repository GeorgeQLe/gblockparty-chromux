# Chromux Mobile MVP Lab

Three self-contained, interactive phone mockups test the same focused first-MVP
flow without changing either shipping Chromux application:

> Find a remote session → attach read-only → inspect bounded replay → acquire a
> single-writer control lease → send a harmless fixture command → release
> control → recover safely from transport or authority failures.

| Route | Direction | Emphasis |
|---|---|---|
| `/mobile/mvp-signal-inbox` | Signal Inbox | Warm editorial attention triage and plain-language summaries |
| `/mobile/mvp-session-relay` | Session Relay | Industrial session durability, replay cursors, and ownership |
| `/mobile/mvp-command-lens` | Command Lens | OLED search and compact session/action commands |

Every file contains its own HTML, CSS, scenario data, and JavaScript. The
fixtures are fabricated and credential-free. All three expose enrollment,
online/offline hosts, completed and input-needed sessions, a session controlled
from Mac, retained replay, contention, lease expiry semantics, reconnect by
cursor, explicit replay gaps, and revoked enrollment. Terminal input is disabled
until the user confirms control and disabled again on release.

The seven earlier explorations are indexed at `/mobile/archive/` and retain
their original `/mobile/01-*` through `/mobile/07-*` URLs unchanged. Their
broader browser, evidence, and desktop-adjacent concepts are historical and are
not part of the recommended phone MVP.

The website build copies these source files byte-for-byte into `dist-site/`.
Run `npm test` for route and browser interaction coverage.
