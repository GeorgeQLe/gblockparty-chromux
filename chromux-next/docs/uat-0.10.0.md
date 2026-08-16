# Chromux Next 0.10.0 Situation Room UAT

## Automated qualification

1. Run `npm run typecheck` and `npm test`.
2. Run `npm run package` followed by `npm run smoke:packaged`.
3. Run `npm run smoke:runner-restoration`, `npm run smoke:browser-evidence`,
   and `npm run visual:packaged -- /tmp/chromux-next-0.10.0-visual`.
4. Inspect standard and narrow captures for clipping, focus visibility, long
   content overflow, and the saved five-approach interface set.

## Manual live runner gate

1. Launch `npm run start:situation-room` and create two sessions in different
   projects. Trigger an approval in one and a two-question request in the other.
2. Confirm the older unresolved request opens first and both appear in the
   global queue with correct project, session, type, and arrival details.
3. Open the dossier and compare the request method, ID, and raw detail with the
   live runner request. Confirm no decision appears unless it was offered.
4. Select Later. Confirm no `runner.respond` occurs, the session remains
   blocked, the queue marks it Later, and selecting it reopens the same event.
5. For questions, confirm submit is rejected until every question has either an
   offered option or a non-empty free-form answer. Confirm free-form and offered
   choices are mutually exclusive and the live agent receives the exact values.
6. For approval, exercise authorize-once, session authorization, an offered
   policy amendment, and decline/cancel where each is offered. Confirm every
   resolved event disappears and the next eligible request opens.
7. Force a response transport failure. Confirm choices remain, an accessible
   error appears, controls become available again, and retry succeeds once the
   runner recovers.
8. Restart after deferring an unresolved event. Confirm it opens again. Launch
   normally with `npm start` and confirm the previously saved standard approach
   is unchanged and inline interaction cards still behave normally.
9. Repeat at 820×720 and with reduced motion enabled. Confirm focus containment,
   Escape deferral, keyboard traversal, scrolling, and browser hiding under the
   modal.
