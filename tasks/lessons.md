# Lessons

## 2026-07-13 — Risk warnings need inspectable evidence

- When a product warning is grounded in a recent security controversy, include user-visible links to the primary research, reproducible evidence, independent reporting, and the provider's current policy—not only an uncited summary.
- Keep the warning scoped to what the evidence demonstrates. For the Grok Build finding, distinguish transmission and storage observed in version 0.2.93 from unproven training use and from behavior that may change in later versions.
- Correction enforcement: `prototype/scripts/test-grok-warning-renderer.js` requires the Grok warning to expose the research, reproduction, independent-reporting, and provider-policy resources.
