# Mobile Gallery Release Audit

Date: 2026-07-12

## Verdict

**Ship-ready as static prototypes.**

The mobile gallery is suitable for publishing as a set of seven comparative design prototypes. Its static implementation is intentional: it communicates navigation, information hierarchy, intervention safety, and visual direction without claiming to be a working remote-control client.

## Validation scope and result

- Gallery contract: the index exposes seven clean `/mobile/*` routes and the website build emits a matching HTML artifact for every route.
- Shared product state: each prototype follows `mobile-prototypes/SPEC.md`, including fleet status, the `checkout-flow · claude` drill-in, layered context, intervention modes, evidence, and send-payload concepts.
- Static safety boundary: no prototype depends on application credentials, remote hosts, or production services.
- Production contract: `scripts/build-website.sh` emits `dist-site/mobile`; Vercel serves the static artifact with clean URLs and the headers configured in `vercel.json`.
- Release checks: package JSON parsing, JavaScript syntax, route regression coverage, generated-artifact inspection, production content smoke tests, clean URLs, and response headers are required before publication.

Result: pass. Production-specific evidence is recorded in the matching GitHub Release after the pushed commit is deployed and smoke-tested.

## Findings and dispositions

- Resolved: the mobile gallery was added to the website build, landing-page navigation, and route regression suite.
- Resolved: all seven directions use the shared layered-context contract and fabricated fleet state, making comparison meaningful.
- Resolved: earlier audit gaps in Command Lens fleet/offline visibility, Timeline naming, and narrow-screen overflow were corrected before the mobile gallery release.
- Rejected: Browser Field Kit preview tiles do not need to repeat session names; the browser-first layout already retains fleet and host context and remains consistent with its chosen direction.
- Resolved: the untracked root `main.js` was stale and could be mistaken for a second Electron entrypoint. It was deleted; `prototype/package.json` resolves `main.js` within `prototype/`, so `prototype/main.js` is the sole entrypoint.

## Explicit limitation

These files are static prototypes. They do **not** implement real SSH connections, terminal sessions, browser sessions, authentication, remote command execution, evidence capture, or message delivery. Those behaviors require separate product and infrastructure work and are outside this release.

## Release evidence

The canonical production URL, deployed commit SHA, Vercel deployment result, route/content smoke-test outcome, and latest GitHub Release verification are recorded on `GBlockParty Chromux v0.24.1` after deployment.
