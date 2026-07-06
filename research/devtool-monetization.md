# Chromux - Devtool Monetization Research

_Producing skill: `$devtool-monetization` · Status: approved canonical research · Date: 2026-07-05 · Concept slug: `chromux`_

## Approval Record

Final artifact approval was received from `alignment/devtool-monetization-chromux.html` with no unanswered required questions and no section feedback.

| Gate | Approved answer | Effect |
| --- | --- | --- |
| Artifact Approval | `approve` | Canonicalize the reviewed monetization packet. |
| Canonical Path | `approve` | Write the approved artifact to `research/devtool-monetization.md`. |

Stage 1 scope was also approved with these inputs: cover free/open-source stance, packaging, usage limits, team conversion, enterprise triggers, and unit economics; include GBlockParty managed-infra as a deferred monetization lens; prioritize the builder's personal daily-driver path.

## Executive Recommendation

Chromux should not monetize v1. The best near-term stance is **free personal tooling, likely private or source-available until the daily-driver loop is proven**, with an explicit option to become permissive OSS after the stack spike and capture loop work. Paid packaging should wait until Chromux has evidence that other agent-driven developers repeatedly use the session-paired browser review loop.

The first monetizable version should not be "Chromux Pro" by default. The stronger path is:

1. Keep the local desktop cockpit free.
2. Make paid value attach to hosted or managed surfaces only when they exist: sync, cloud sessions, managed browsers, capture history, team policy, fleet deployment, or GBlockParty-backed managed infra.
3. Use team and enterprise triggers as evidence gates, not roadmap commitments.

This matches current market structure: AI coding tools commonly use free entry tiers, paid individual usage tiers, usage credits, and team/enterprise controls. Chromux does not yet have the expensive hosted compute or validated team workflow that would justify those mechanics.

## Proposed Monetization Stance

### V1 Free / Open-Source Stance

**Claim:** V1 should be free and personal-first, with monetization explicitly deferred.

**Evidence:**

- `research/idea-brief.md` defines the primary beneficiary as the builder and lists productization / GBlockParty monetization as deferred out of v1.
- `research/devtool-positioning.md` says to defer account systems, teams, sync, cloud sessions, and monetization.
- Cursor has a free Hobby tier and monetizes individual/team/enterprise usage around agents and cloud agents (`https://cursor.com/pricing`).
- GitHub Copilot has a Free plan, paid individual plans, AI credits, and paid usage continuation (`https://github.com/features/copilot/plans`).
- PostHog reports that more than 90% of companies use its product free, then charges usage-based rates after free tier limits (`https://posthog.com/pricing`).

**Inference:** Free entry is normal for developer tools, but Chromux has an even stronger reason to be free: local-only v1 has low marginal infrastructure cost and the product is not externally validated.

**Decision impact:** Do not add licensing, plans, payments, account gates, cloud entitlements, or usage metering to v1.

**Recommended stance:** Start as private or source-available while the builder validates the workflow. Move to permissive OSS once the architecture is stable enough that outside users can run it without support-heavy handholding. Avoid copyleft or artificial commercial restrictions unless a real hosted business emerges.

### Packaging

**Claim:** The durable packaging split is local-free vs. managed-paid, not feature-crippled local free vs. local pro.

| Package | Timing | Price posture | Included value | Avoid |
| --- | --- | --- | --- | --- |
| Local personal app | V1 | Free | Terminal sessions, paired panes, local/file preview detection, manual capture payloads, local history | Account requirement, plan gates, watermarking, forced telemetry |
| OSS/source release | After daily-driver proof | Free | Buildable app, documented setup, local-only capture contract, transparent storage | Promising support SLAs or cross-platform support too early |
| Paid binary/support | Optional later | Low-confidence | Signed/notarized releases, auto-update, priority fixes, docs, issue triage | Charging before installation and support burden are known |
| Hosted sync/cloud sessions | Later only | Usage or seat-based | Remote session state, capture history, artifacts, managed previews | Bundling with local-only v1 before cloud value exists |
| GBlockParty managed infra front end | Deferred revisit | Lead-gen, usage, or managed service | Managed browser/agent infra, team sandboxes, persistent artifacts, policy controls | Forcing GBlockParty into the v1 personal workflow |

**Inference:** Local desktop value can create adoption, but the clean paid boundary is where Chromux starts carrying costs or org risk: managed sessions, storage, policy, support, and deployment.

**Decision impact:** Design v1 storage and payloads so they can later support paid hosted surfaces, but do not introduce billing architecture now.

### Usage Limits

**Claim:** V1 should use local resource guardrails, not commercial limits.

Recommended v1 guardrails:

- Sessions: no paid limit; warn when panes or agents exceed local machine comfort.
- Capture payload history: local retention setting, default short retention; no cloud quota.
- Screenshots: local path visibility and retention controls; no upload by default.
- Console logs: bounded tail size per capture to avoid huge payloads.
- Profiles/cookies: isolate by session or project where practical; document persistence.
- Local storage: show where captures and screenshots live; make deletion obvious.

Future paid/hosted limits, only after managed services exist:

- Cloud sessions or managed browsers per user.
- Artifact/capture history retention.
- Screenshot and trace storage.
- Shared workspace seats.
- Team-wide usage budgets.
- GBlockParty managed infrastructure minutes, environments, or parallel workers.

**Evidence:** Cursor, GitHub Copilot, Warp, and PostHog all use usage allowances, credits, or resource limits for paid plans; those limits map to real compute, hosted features, or organizational management rather than pure local desktop use.

**Decision impact:** Keep v1 limits framed as reliability and privacy controls. Do not condition local usage on a paid plan.

## Team Conversion

**Claim:** Team conversion is plausible but unproven; the right trigger is repeated shared workflow demand, not "teams exist in competitor pricing."

Evidence-backed market pattern:

- Cursor Teams adds centralized billing, team marketplace, code review, shared team context, usage analytics, privacy mode, SAML/OIDC SSO, and enterprise controls.
- Claude Team and Enterprise add central billing/admin, SSO, connector controls, deployment, no training by default, spend limits, RBAC, SCIM, audit logs, retention controls, network controls, and HIPAA-ready options.
- Warp Business adds team usage metrics, admin data controls, and SAML SSO; Enterprise adds custom credit pools, governance, BYO LLM, self-hosted cloud agents, custom indexing, onboarding, and support.
- Sentry moves from one-user free Developer to paid Team/Business/Enterprise with unlimited users, advanced quota management, SAML/SCIM, technical account management, and dedicated support.

Chromux-specific team triggers:

- More than one developer wants to inspect the same agent-generated preview or capture.
- A team wants a shared review queue or persistent capture evidence across machines.
- A manager/security owner asks for policy controls around agent browser access.
- A company wants managed installation, update control, audit trails, or retention rules.
- A GBlockParty customer wants a UI for managed agent/browser infrastructure.

**Decision impact:** Do not build team features until at least two triggers recur. If they recur, start with team workspace evidence sharing and admin controls, not collaboration theater.

## Enterprise Triggers

**Claim:** Enterprise value attaches to control, observability, deployment, and risk management.

Potential enterprise triggers for Chromux:

- SSO/SAML/OIDC, SCIM, RBAC.
- Audit logs for browser captures, prompt payloads, screenshots, and destination agent/session.
- Repository/project access controls.
- Browser/network policy controls.
- Screenshot, DOM, log, cookie, and retention policy.
- Fleet deployment and managed auto-update.
- Private/self-hosted cloud sessions or managed browsers.
- BYO LLM / model allowlist.
- Budget and usage caps for hosted sessions, model pass-through, or GBlockParty infrastructure.
- Dedicated support, implementation help, and security documentation.

**Evidence:** These are the same classes of controls exposed by Cursor Enterprise, Claude Enterprise, Warp Enterprise, and Sentry Business/Enterprise.

**Decision impact:** Treat enterprise as a future architecture constraint: keep capture payloads auditable and storage boundaries clear, but do not implement enterprise surfaces in v1.

## GBlockParty Managed-Infra Lens

**Claim:** GBlockParty is the best monetization lens only after Chromux becomes a daily-driver UI and there is a credible managed-infra offering behind it.

What GBlockParty could sell:

- Managed browser/agent sandboxes for projects.
- Persistent remote sessions and previews.
- Capture history with searchable evidence.
- Team-scoped sandboxes and policy controls.
- Hosted runners with predictable concurrency and cleanup.
- Compliance and audit records around agent/browser actions.

Natural packaging:

- Chromux local app remains free and acts as the cockpit.
- GBlockParty account is optional and unlocks managed infrastructure.
- Pricing can be usage-based around sandbox hours, parallel workers, storage, and retention, with team seats for admin/audit features.

Risks:

- If local Chromux is not part of the builder's daily workflow, a GBlockParty UI will be premature.
- If hosted infra is not materially better than local previews, users will not tolerate account setup.
- If capture payloads include sensitive screenshots, DOM, logs, cookies, or local URLs, GBlockParty needs explicit privacy, retention, and deletion controls before sale.

**Decision impact:** Keep GBlockParty as a deferred lead-gen/managed-infra path. The revisit trigger from `research/idea-brief.md` remains correct: "Chromux is part of my daily workflow."

## Unit Economics

### Local-Only V1

Marginal cost is near zero per user if the app is local-only and does not ship cloud services. Real costs are development time, support, signing/notarization, distribution, docs, issue triage, and compatibility testing. Apple Developer Program membership is a likely annual cost if distributing signed/notarized apps through Apple developer channels; Apple lists paid membership at 99 USD per membership year.

V1 economics therefore favor free distribution and low support commitments.

### Paid Binary / Support

Possible costs:

- Release signing/notarization and update pipeline.
- Support time for Electron/Chromium, macOS permissions, CLI auth state, local ports, and file permissions.
- Documentation and troubleshooting surface.
- Regression testing across macOS versions and agent CLI changes.

This can justify paid support later, but it is a poor first monetization surface because the support load may exceed revenue until demand is proven.

### Hosted / Managed Surface

Cost drivers:

- Browser/agent sandbox compute.
- Persistent storage for screenshots, captures, logs, traces, artifacts.
- Network egress and artifact downloads.
- Model/API pass-through if Chromux invokes paid models directly.
- Team security/compliance work.
- Support and incident response.

Pricing model:

- Free local app.
- Optional paid managed infra with included credits.
- Usage overages for sandbox/runtime/storage.
- Team seats for admin/audit/control features.
- Enterprise custom pricing for self-hosting, BYO LLM, network controls, retention, and support.

## Alternatives Considered

| Alternative | Why it is tempting | Why not now |
| --- | --- | --- |
| Immediate paid app | Captures value from power users early | No external validation; local-only marginal cost is low; support risk is unknown |
| Open-core local features | Common devtool model | Feature gating local capture would weaken the wedge and slow adoption |
| Sponsorship/donations | Low overhead for OSS | Unlikely to fund serious support or hosted infra; useful only as optional community signal |
| Hosted-first SaaS | Clear pricing and enterprise path | Conflicts with personal-first local cockpit and v1 deferrals |
| GBlockParty-first | Could create a business model | Premature until Chromux and managed infra both prove daily value |

## Rejected Or Lower-Confidence Findings

- **Rejected:** "Charge for local session count." This would monetize a local resource that costs Chromux nothing and would undermine the parallel-session value proposition.
- **Rejected:** "Team pricing should drive v1 architecture." Team willingness to pay is unvalidated, and current docs explicitly defer team/collab features.
- **Lower confidence:** "Permissive OSS is definitely best." It probably maximizes adoption, but the builder may prefer private iteration until the fork base and capture architecture settle.
- **Lower confidence:** "Paid binary/support can work." It can work only if installation demand exists and support load is manageable.

## Source Coverage Gaps

- No live GBlockParty public pricing or product source was found; the GBlockParty section is an inference from local project context, not external evidence.
- No interviews with non-builder users were available.
- No hands-on usage or support-load data exists for Chromux.
- No current `cmux` codebase inspection was available in this checkout, so distribution/support effort is still uncertain.
- Supabase pricing was considered as an adjacent OSS-hosted pattern, but the accessible primary page did not expose stable text through the browser tool in this pass; PostHog and Sentry carry the open-source/hosted pricing evidence instead.

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Assumption status | Decision impact |
| --- | --- | --- | --- | --- | --- |
| V1 should not monetize | `research/idea-brief.md` and `research/devtool-positioning.md` both defer monetization/team/cloud surfaces | Monetization would add product surface before the personal workflow is proven | High | Evidence-backed locally | Keep v1 free and local-first |
| Free entry is market-normal | Cursor Hobby Free; GitHub Copilot Free; PostHog free tier; Sentry Developer free | Free v1 will not look abnormal in devtool markets | High | Evidence-backed externally | Use free as adoption/default, not as a discount |
| Paid value maps to usage or org controls | Cursor, GitHub Copilot, Claude, Warp, PostHog, and Sentry expose credits, usage tiers, admin, SSO, audit, controls, or support | Chromux should charge only when it bears cost or reduces org risk | High | Evidence-backed externally | Defer billing until hosted/team/enterprise surfaces exist |
| Local usage limits should be reliability controls | Local-only Chromux has no marginal infra cost; competitors meter hosted/agent/cloud usage | Charging for local sessions would be weak and user-hostile | Medium-high | Inferred from cost structure | Add local guardrails, not paid caps |
| GBlockParty is deferred but strategically coherent | Local idea brief records GBlockParty monetization as a deferred revisit candidate | A free cockpit could later feed managed-infra demand | Medium | Local evidence plus inference | Preserve optional integration path without v1 dependency |
| Enterprise triggers are policy/audit/deployment driven | Cursor, Claude, Warp, and Sentry enterprise plans emphasize SSO, SCIM, audit, controls, governance, support | Enterprise Chromux only exists if browser/agent evidence becomes company-risky enough to govern | High | Evidence-backed externally | Keep auditability/privacy boundaries in architecture |

## Assumptions And Confidence Register

| Assumption | Confidence | Why | What would change it |
| --- | --- | --- | --- |
| Personal-first remains the right lens | High | Approved Stage 1 gate and existing canonical docs | User chooses a commercial/GBlockParty-first path |
| Other agent-driven developers may use Chromux | Low-medium | Plausible from positioning research but unvalidated | External installs, issues, interviews, or repeated requests |
| Managed infra is the cleanest paid boundary | Medium | Matches market pricing and cost structure | Evidence that paid local binary/support demand appears first |
| Enterprise demand is future-only | Medium-high | No team buyer evidence and v1 defers team features | A company asks for policy, audit, or deployment controls early |
| GBlockParty can monetize Chromux later | Medium | Strategically coherent, but no public source or validated demand | Daily-driver proof plus managed-infra customer interest |

## Sources

- Local: `research/idea-brief.md`
- Local: `research/devtool-positioning.md`
- Cursor pricing: `https://cursor.com/pricing`
- Claude pricing: `https://claude.com/pricing`
- GitHub Copilot plans: `https://github.com/features/copilot/plans`
- Warp pricing: `https://www.warp.dev/pricing`
- PostHog pricing: `https://posthog.com/pricing`
- Sentry pricing: `https://sentry.io/pricing/`
- Apple Developer membership comparison: `https://developer.apple.com/support/compare-memberships/`
