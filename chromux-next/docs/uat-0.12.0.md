# Chromux Next 0.12.0 Managed-Update UAT

## 2026-08-24 corrective rerun: still blocked by bootstrap helper

Public v0.14.1 and corrective v0.14.2 resolved stale staging, sanitized failure
classification, exact new-instance targeting, isolated profile continuity, and
the helper-only Electron environment leak. Public v0.14.2 independently passes
successful replacement and 45-second same-bundle-ID rollback when its own
helper is used.

The public v0.12.0 forward lane still fails safely: v0.12.0 invokes the helper
embedded in its current bundle, not the helper inside the staged successor.
That old helper inherits `ELECTRON_RUN_AS_NODE=1`, so the staged app exits before
writing its startup marker and v0.12.0 is restored after the real timeout. A
target-only release cannot retrofit this pre-relaunch code path. See
`docs/uat-0.14.2.md` for the signed result matrix and preserved evidence.

## 2026-08-23 result: FAIL

The public bootstrap and successor artifacts are trustworthy, the focused
automation passes, a live authenticated Codex turn succeeds, and the updater
correctly blocks installation for an active turn and a genuine unanswered
`request_user_input` interaction. The release gate remains open because two
live recovery paths failed:

1. After restarting `0.12.0` with a previously staged `0.14.0` bundle, the UI
   correctly requested that the package be prepared again, but every retry
   failed safely while removing the old staged tree. The surviving evidence
   was a 1.1 MB partial bundle containing only
   `Contents/Resources/app.asar`; no archive remained. This prevented proving
   interaction-cancel-to-staged, install confirmation cancellation, managed
   replacement, relaunch persistence, marker consumption, or success cleanup.
2. The shipped replacement helper timed out for the required 45 seconds and
   restored the signed `0.12.0` bundle with no adjacent backup, but its plain
   `/usr/bin/open <app>` relaunch reused another running instance with the same
   bundle ID. The restored rollback copy did not start with the isolated
   profile and wrote no startup marker.

No installed app or Chromux profile was replaced or modified. No release was
republished. The uniquely created evidence directory is intentionally
preserved at `/private/tmp/chromux-next-managed-update-uat.Zomtw6` until the
`0.14.1` fix is diagnosed and the gate is rerun.

## Result matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| Public `0.12.0` bootstrap release | PASS | Published, non-draft prerelease `chromux-next-v0.12.0` |
| Greatest public successor | PASS | Published, non-draft prerelease `chromux-next-v0.14.0` |
| Legacy `/releases/latest` | PASS | Stable `chromux-v0.81.0` remained latest |
| Manifest size and SHA-256 | PASS | Both public ZIPs matched their manifests and GitHub digests |
| Bundle ID, version, Team ID, arm64 | PASS | `dev.georgele.chromux.next`, `0.12.0`/`0.14.0`, `NC56VXK48K`, arm64 |
| Strict codesign, Gatekeeper, stapler | PASS | Both extracted public bundles passed |
| Focused updater/helper automation | PASS | 2 files, 13 tests |
| Authenticated Codex turn | PASS | Thread `01a03120-dfbf-7d03-85be-de9cdc236a95` returned `UPDATE-UAT-READY` |
| Unsent draft persistence before update work | PASS | `UNSENT-DRAFT-MARKER-2026-08-23` persisted in the isolated profile |
| Cancel “Download and verify” | PASS | App remained `0.12.0`; update stayed available |
| Initial signed staging | PASS | UI showed `0.14.0 staged`, 100%, trust verified |
| Active-turn install blocker | PASS | UI showed the named active-turn blocker and disabled install |
| Stop returns staged state | PASS | UI returned to `0.14.0 staged` |
| Genuine unanswered question blocker | PASS | Real `item/tool/requestUserInput` with two options appeared; Updates listed one unanswered interaction |
| Cancel question returns staged state | FAIL | Restart invalidated the in-memory stage; every “Prepare update” retry failed while deleting the prior staged tree |
| Cancel “Install and restart” | NOT RUN | Blocked by failed restaging |
| Managed install and relaunch to `0.14.0` | NOT RUN | Blocked by failed restaging |
| Session/thread/draft restoration | NOT RUN | Managed replacement was not attempted after the failure |
| Startup-marker consumption and success backup cleanup | NOT RUN | Managed replacement was not attempted after the failure |
| 45-second rollback restoration | PASS | Helper exited failure after the real timeout and restored signed `0.12.0` |
| Rollback trust and backup cleanup | PASS | Strict codesign, Team ID, Gatekeeper, stapler passed; adjacent backup absent |
| Rollback reopen with isolated profile | FAIL | No restored-copy process or isolated-profile startup marker appeared |

## Public artifact evidence

| Version | Asset bytes | Asset SHA-256 | Manifest SHA-256 |
| --- | ---: | --- | --- |
| `0.12.0` | `118687435` | `5275da426d0fe0f216173055ac99b4b94398100496973782f6d7406048ab33bd` | `705732098e33989b0057c1ee4c8c132b4b9fb3719e0d777eddaa79147402774b` |
| `0.14.0` | `120039640` | `e317003dc33f8866d92f1446de55d6e0ea1903430dd85d1b3e800d27889f6342` | `4f8f37560bb668197dbe6f445aae00746e09ae4498581bd9e3edd9b15656f056` |

Both manifests declare platform `darwin`, architecture `arm64`, bundle ID
`dev.georgele.chromux.next`, and Team ID `NC56VXK48K`.

## Sanitized command record

```sh
gh release view chromux-next-v0.12.0 -R GeorgeQLe/gblockparty-chromux --json tagName,name,isDraft,isPrerelease,publishedAt,assets,url
gh release view chromux-next-v0.14.0 -R GeorgeQLe/gblockparty-chromux --json tagName,name,isDraft,isPrerelease,publishedAt,assets,url
gh release view -R GeorgeQLe/gblockparty-chromux --json tagName,name,isDraft,isPrerelease,publishedAt,url
gh release download chromux-next-v0.12.0 -R GeorgeQLe/gblockparty-chromux --dir <uat-root>/release-0.12.0
gh release download chromux-next-v0.14.0 -R GeorgeQLe/gblockparty-chromux --dir <uat-root>/release-0.14.0
shasum -a 256 <uat-root>/release-0.12.0/* <uat-root>/release-0.14.0/*
npm test -- --run tests/updates.test.ts tests/update-helper.integration.test.ts
codesign --verify --deep --strict --verbose=2 <app>
codesign -dv --verbose=4 <app>
spctl --assess --type execute --verbose=4 <app>
xcrun stapler validate <app>
lipo -archs <app>/Contents/MacOS/chromux-next
open -n --env CHROMUX_NEXT_SMOKE_USER_DATA=<isolated-profile> <uat-root>/live/Chromux\ Next.app
env ELECTRON_RUN_AS_NODE=1 <rollback-app>/Contents/MacOS/chromux-next \
  <rollback-app>/Contents/Resources/update-helper.cjs 999999 \
  <rollback-app> <nonlaunchable-staged-app> <isolated-startup-marker>
```

The genuine question used an isolated temporary Codex configuration enabling
`features.default_mode_request_user_input`; it referenced the existing
authenticated rollout store without reading or copying credential contents.
The temporary launch environment used for the rollback profile was removed
immediately after the helper returned.

## Required `0.14.1` follow-up

- Make cleanup of a prior signed staged bundle reliable and cover a restart
  from persisted `staged: true`, followed by preparing the same successor.
- Make the replacement helper launch the exact restored bundle as a new
  instance, preserving the intended profile environment even when another
  `dev.georgele.chromux.next` instance is already running.
- Preserve sanitized underlying updater failure categories so filesystem and
  extraction failures are diagnosable without exposing paths or raw output.
- Rerun this complete matrix with fresh unique directories. Do not close the
  `v0.12.0` gate until install cancellation, successful managed replacement,
  persistence, marker consumption, success cleanup, and isolated rollback
  reopen all pass.
