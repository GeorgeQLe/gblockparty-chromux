# Chromux Next 0.18.1 UAT

1. Launch the packaged macOS arm64 app with Fleet enabled against the private
   control-plane endpoint and an isolated user-data directory.
2. Enroll with a one-time code. Restart the app and confirm the encrypted
   device enrollment remains available without entering the code again.
3. Attach to a daemon-owned running terminal. Confirm the packaged app does
   not crash while sending its masked attach frame and remains connected after
   durable-history status arrives.
4. Confirm the terminal starts read-only. Request control, send a harmless
   command to a disposable qualification session, and keep the attachment open
   beyond the 15-second lease TTL to verify renewal.
5. Release control and confirm the terminal immediately returns to read-only.
6. Confirm initial resize events no longer surface IPC errors while the socket
   is connecting and the latest dimensions reach the server after open.
7. Run `npm run verify` and inspect the packaged app metadata for version
   `0.18.1`.
8. Sign and notarize the update artifacts, then publish
   `chromux-next-v0.18.1` as a non-draft prerelease titled
   `GBlockParty Chromux Next v0.18.1`. Confirm legacy `/releases/latest`
   remains unchanged.
