# Verification

Local Windows checks: 28 Node tests passed. Three Electron UI tests passed: no-key chat flow with explicit test reply, settings/copy/reset, masked password fields, renderer Node isolation and inert HTML text. Live AI is not simulated as a real answer in QA mode.

Cloudflare dry run and Windows packaging are being validated. GitHub macOS CI results and real server live-check results must be recorded before a user release.

Mac automatic updates need Apple Developer ID signing/notarization; without those secrets the build is an unsigned preview with manual downloads. An old portable ZIP cannot receive updates retroactively.
