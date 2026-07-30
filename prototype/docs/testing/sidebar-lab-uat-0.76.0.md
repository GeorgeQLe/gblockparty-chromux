# Sidebar Lab no-model UAT — Chromux 0.76.0

Date: 2026-07-30

Result: **PASS** for the deterministic study pipeline and visual smoke. This is
not a human usability result.

## Coverage

- 10/10 variants and 6/6 scenarios (60 synthetic trials)
- Identical 18-session, four-project fixture across variants
- Schema-v1 sanitization, aggregate medians, task medians, spatial churn, and
  synthesized recommendation generation
- Gallery and Study Electron rendering in a temporary profile
- Desktop and 760px responsive layouts
- Reduced-motion rule and sanitized export
- Production session-rail regression

## Artifacts

- `sidebar-lab-uat-0.76.0.json` — deterministic no-model report
- `sidebar-lab-gallery-0.76.0.png` — representative Gallery capture
- `sidebar-lab-study-0.76.0.png` — representative Study capture

The no-model runner intentionally assigns deterministic timings and ratings to
exercise the complete report path. Those values must not be interpreted as
evidence that one concept is more usable. Run human Study trials before
selecting a production direction.

## Commands

```sh
npm run test:sidebar-lab
npm run uat:sidebar-lab
npm run test:session-rail-renderer
npm test
```

All commands passed. The complete prototype suite emitted no unresolved
warnings.
