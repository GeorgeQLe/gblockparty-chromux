# Vercel shipping UAT — v0.71.0

Status: **BLOCKED — LIVE ACCOUNT GATE NOT COMPLETE**

Date: 2026-07-28

## Completed local evidence

- Vercel CLI `50.40.0` is installed and `vercel whoami` succeeds for the local
  account without exposing a token.
- The repository is linked to the non-production `chromux-landing` Vercel
  project.
- The complete prototype matrix passes, including deterministic guarded Git,
  direct deploy, stale review, production confirmation, push-only recovery,
  cancel/retry, corrupt-store, secret-redaction, automatic restart recovery,
  loopback ownership/cleanup, preload isolation, live job events, and final URL
  presentation fixtures.
- Source and packaged Electron smoke tests pass. The packaged app and both
  bundle version fields report `0.71.0`.

These fixtures do not replace a real Vercel account deployment.

## External prerequisite

Create a public **Sign in with Vercel** application in the Vercel dashboard:

- client authentication: `none`;
- callback: exactly
  `http://127.0.0.1:47891/vercel/oauth/callback`;
- scopes: `openid profile offline_access`;
- resource permissions: sufficient to authenticate the Vercel CLI and deploy
  the mapped preview project.

Commit only the public client ID as `VERCEL_OAUTH_CLIENT_ID` in
`prototype/main.js`. Do not add a client secret. Vercel documents public-client
PKCE and the token endpoints in its
[Authorization Server API](https://vercel.com/docs/sign-in-with-vercel/authorization-server-api).

## Required live transcript

Run on a temporary non-production branch and record only sanitized values:

1. Complete the owned loopback OAuth flow and validate the resulting profile.
2. Create one direct preview deployment and inspect it to `ready`.
3. Push one Git-triggered preview and correlate it by the pushed commit SHA.
4. Cancel local monitoring once, restart Chromux, and verify the persisted job
   resumes to the same deployment URL.
5. Smoke the preview root plus representative public routes.
6. Record the temporary branch, commit SHA, deployment URL, terminal state, and
   route results here.
7. Remove the temporary local and remote branch.

If the OAuth token can identify the user but cannot deploy, keep this report
blocked and do not publish v0.71.0.
