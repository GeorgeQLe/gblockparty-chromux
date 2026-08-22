# Update troubleshooting

- **0.11.1 never offers an update:** it has no updater. Install 0.12.0
  manually once.
- **Manual only:** managed installation requires packaged macOS arm64, a
  writable app location, Team `NC56VXK48K`, and a notarized/stapled package.
  Use Release notes to update manually without privilege escalation.
- **Blocked:** finish or interrupt starting/active work and answer pending
  interactions. Clearing blockers does not install; select Install explicitly.
- **Verification failed:** retry preparation. Identity, checksum, architecture,
  signature, Team ID, or Gatekeeper mismatches are never installed.
- **Codex updater unsupported:** use the release link and displayed Homebrew,
  npm, or standalone guidance. The command runs only after its help probe.
- **Codex update failed:** the previous app-server is restarted and stored
  sessions restored. Raw command output is intentionally not displayed.

For local release qualification, store Apple notarization credentials with
`xcrun notarytool store-credentials` and set
`CHROMUX_NEXT_NOTARY_PROFILE` to the saved profile name. Apple ID environment
variables remain available for noninteractive CI, but the Keychain profile
keeps the app-specific password out of the shell environment.
