# Chromux Next 0.14.2 Updater UAT

## 2026-08-24 result: PARTIAL PASS — bootstrap gate remains open

Public v0.14.2 is correctly published and independently trusted. Its helper
passes both successful exact replacement and the required real-timeout
same-bundle-ID rollback. The original public v0.12.0-to-successor forward lane
cannot pass, because v0.12.0 always launches its own embedded pre-fix helper;
target app code is not available until after that helper relaunches.

| Gate | Result | Evidence |
| --- | --- | --- |
| Public v0.14.2 release | PASS | Non-draft prerelease with ZIP and manifest |
| Public asset size/SHA/GitHub digest | PASS | 120,040,322 bytes; `07dd99b31dfc77139c473c970f62818573bee0a2654e428bf80945d400df0991` |
| Extracted trust/version/arm64 | PASS | Strict codesign, Team `NC56VXK48K`, Gatekeeper, stapler, 0.14.2, arm64 |
| Legacy `/releases/latest` isolation | PASS | Remained `chromux-v0.81.0` |
| Authenticated turn/thread/draft | PASS | Exact `UPDATE-UAT-READY`; thread and unsent draft survived failed forward attempts |
| Download/install cancellations | PASS | Staging remained explicit and intact |
| Active-turn blocker/recovery | PASS | Named active turn disabled install; Stop restored staged |
| Genuine question blocker/recovery | PASS | One real `request_user_input` disabled install; Cancel restored staged |
| Public 0.12.0 managed forward install | FAIL | Embedded old helper inherited `ELECTRON_RUN_AS_NODE`, timed out, and safely restored 0.12.0 |
| Public v0.14.2 helper successful replacement | PASS | Exact 0.14.2 process, marker consumed, backup removed, thread/draft retained |
| Public v0.14.2 helper 45-second rollback | PASS | Signed 0.14.2 restored while same-ID peer stayed live; distinct exact process and isolated marker appeared; backup removed |
| Relaunch environment | PASS | Restored process retained isolated `CHROMUX_NEXT_SMOKE_USER_DATA` and `CODEX_HOME`; helper mode was absent |

Evidence is preserved at
`/private/tmp/chromux-next-managed-update-uat-0.14.1.idJjiT`. The first empty-app
rollback fixture was rejected because LaunchServices could satisfy it from its
registration cache; the deterministic rerun used a real app bundle with its
executable unavailable and exercised the full timeout. Both temporary UAT
processes were stopped after verification.

The next gate decision is explicit: publish a new manually installed bootstrap
whose embedded helper contains the fix, or accept a controlled replacement of
the immutable v0.12.0 artifact. Do not close the v0.12.0 gate based only on
target-version helper proof.

## Corrective gate

1. Run `npm run verify` and the signed `npm run make:update` release build.
2. Confirm helper coverage proves `/usr/bin/open -n`, exact installed bundle
   targeting, explicit isolated Chromux/Codex profile arguments, and removal of
   `ELECTRON_RUN_AS_NODE` from the LaunchServices process environment.
3. Publish `chromux-next-v0.14.2` as a non-draft prerelease, redownload the ZIP
   and manifest, and independently verify size/SHA-256, GitHub digest, bundle
   ID/version/arm64, Team `NC56VXK48K`, strict codesign, Gatekeeper, and stapler.
4. Using fresh public 0.12.0 and greatest-successor artifacts, repeat the 0.14.1
   matrix for authenticated turn, draft/thread persistence, both confirmation
   cancellations, active-turn and genuine-question blockers, managed
   replacement, marker consumption, backup cleanup, and exact relaunch.
5. From public 0.14.2, run the real 45-second timeout rollback while another
   bundle-ID instance is active. Confirm trusted prior-bundle restoration, an
   exact distinct-process relaunch with isolated profiles, marker creation, and
   no adjacent backup.
6. Confirm legacy GitHub `/releases/latest` remains unchanged.
