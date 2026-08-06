# Chromux Next v0.6.0 production UI polish UAT

## Automated release gate

From `chromux-next/`:

```sh
npm run typecheck
npm test
npm run package
npm run smoke:packaged
npm run smoke:runner-restoration
npm run visual:packaged -- /tmp/chromux-next-0.6.0-visual
```

The visual command must report 20 captures. Review onboarding and New Session
at standard and narrow widths; Projects, Groups, Appearance, and Diagnostics
Settings views; and Alignment at standard and narrow widths in all five
approaches.

## Interaction review

- Confirm the global header always exposes surfaces, Settings, and New
  Session. At narrow width, icon-only actions retain tooltips and accessible
  names.
- Switch among all five approaches with two active sessions. Confirm the
  selected session, draft, terminal viewport, interaction, active surface, and
  Alignment selection remain unchanged.
- Create and rename a custom group from session navigation and Settings.
  Confirm there is no browser prompt; Tab stays inside the dialog, Escape
  closes it, and focus returns to the opener.
- Exercise transcript search, previous/next match, copy, Composer send/steer,
  interrupt, approvals, questions, attention cards, and Alignment open/save,
  insert/reorder/remove/review/undo/contribution actions.
- Review comfortable and compact density. Review system, full, and reduced
  motion, including the operating-system reduced-motion preference.
- Confirm loading, empty, failure, disabled, selected, hover, pressed, and
  focus states remain readable at standard and narrow widths.

## Release checks

Publish `chromux-next-v0.6.0` as prerelease with title
`GBlockParty Chromux Next v0.6.0`. Confirm it does not replace the legacy
release returned by GitHub `/releases/latest`.
