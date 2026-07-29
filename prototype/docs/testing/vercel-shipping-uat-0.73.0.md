# Vercel shipping UAT — v0.73.0

Status: **BLOCKED — DEPLOYMENT-CAPABLE OAUTH APP NOT AVAILABLE**

Date: 2026-07-28

## Completed local evidence

- Vercel CLI `50.40.0` is installed and `vercel whoami` succeeds for the
  sanitized account label `george-9471` without exposing a token.
- The non-production UAT target is
  `George Le's projects/chromux-landing`.
- The complete prototype matrix passes, including deterministic guarded Git,
  direct deploy, stale review, production confirmation, push-only recovery,
  cancel/retry, corrupt-store, secret-redaction, automatic restart recovery,
  loopback ownership/cleanup, preload isolation, live job events, and final URL
  presentation fixtures.
- The complete website build and route regression pass, including `/`,
  `/designs`, and `/mobile/01-mission-control`.
- Source and packaged Electron smoke tests pass. The packaged ASAR and both
  bundle version fields report `0.73.0`.

These fixtures do not replace a real Vercel account deployment.

## External blocker

Create a public **Sign in with Vercel** application in the Vercel dashboard:

- client authentication: `none`;
- callback: exactly
  `http://127.0.0.1:47891/vercel/oauth/callback`;
- scopes: `openid profile offline_access`;
- resource permissions: sufficient to authenticate the Vercel CLI and deploy
  the mapped preview project.

The current official Vercel documentation states that permissions for API and
team-resource access are in private beta. The release must remain blocked if
this account's Apps dashboard exposes only the identity scopes above. An
identity-only token and the existing CLI login cannot substitute for a real
OAuth-backed preview deployment.

Commit only the public client ID in `prototype/main.js`; the
`CHROMUX_VERCEL_OAUTH_CLIENT_ID` environment override retains precedence. Do
not create or store a client secret.

## Required live transcript

Run on a temporary non-production branch and record only sanitized values:

1. Complete the owned loopback OAuth flow and validate the resulting profile.
2. Create one direct preview deployment and inspect it to `ready`.
3. Cancel direct-deployment discovery or inspection, close Chromux, relaunch
   with the same isolated profile, choose retry, and verify the same URL reaches
   `ready`.
4. Interrupt a second active monitor by restarting Chromux without canceling
   and verify automatic SHA/URL recovery.
5. Create `uat/vercel-oauth-v0.73.0`, add one controlled marker, switch the
   mapping to Git-triggered preview, and correlate by the pushed commit SHA.
6. Smoke `/`, `/designs`, and `/mobile/01-mission-control`.
7. Record the commit SHA, both deployment URLs, terminal phases, and route
   statuses here.
8. Revoke the OAuth profile, delete the isolated Chromux data, and delete the
   temporary local and remote branch. Retain only the preview deployments.

If the OAuth token can identify the user but cannot deploy, keep this report
blocked and do not publish v0.73.0.
