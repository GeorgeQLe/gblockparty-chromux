# Lessons

## 2026-07-15 — Update attention should resolve the update decision

- Avoid routing a queued update's primary action to a blocker session when the user is deciding what to do with the update; focusing an already active blocker is visibly inert.
- Prefer a direct `EXECUTE` action for managed updates and require explicit warning confirmation for both execution and dismissal.
- Apply this pattern whenever a global attention item represents a pending destructive or state-changing operation rather than a session-navigation task.
- Correction enforcement: `prototype/scripts/test-update-queue-renderer.js` now requires managed queued updates to expose `EXECUTE`, verifies cancel/confirm behavior for execution and dismissal, and requires unavailable managed installs to fall back to `DETAILS`.

## 2026-07-13 — Risk warnings need inspectable evidence

- When a product warning is grounded in a recent security controversy, include user-visible links to the primary research, reproducible evidence, independent reporting, and the provider's current policy—not only an uncited summary.
- Keep the warning scoped to what the evidence demonstrates. For the Grok Build finding, distinguish transmission and storage observed in version 0.2.93 from unproven training use and from behavior that may change in later versions.
- Correction enforcement: `prototype/scripts/test-grok-warning-renderer.js` requires the Grok warning to expose the research, reproduction, independent-reporting, and provider-policy resources.
