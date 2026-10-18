# Verification — 0.4.0, 2026-10-18

- 46 Node tests and 5 Electron UI tests pass locally on Windows. New coverage: Word (paragraphs, tabs, tables), Excel (sheet names, shared/inline strings, column gaps), PowerPoint (slide order), UTF-8/UTF-16/Windows-1251 text, PDF and image handling, legacy/broken/empty/oversized files, zip-bomb guard, conversation limits, Gemini inline media vs. text-only providers, 422/413 handling, attachment validation on the server, drag-and-drop chips and quick actions, and safe rich-text rendering (no HTML execution).
- Real PNG/JPEG and .docx files dropped into the QA app produce a thumbnail chip and a DOCX chip. Electron's screen capture returns a full-resolution, non-empty image on this Windows machine (only its size was checked; the image was not viewed or stored).
- An upgraded 0.3.0 profile shows the "Nima yangi" card once.
- Windows 0.4.0 NSIS Setup builds and passes the package allowlist check; the Cloudflare worker passes a dry run.
- 0.3.0: GitHub Actions Windows/macOS builds, release assets and the live gateway were verified when it shipped.

Not verified yet: live Gemini answers with real images/PDFs (needs the updated worker deployed), macOS screen-recording permission flow and installing the DMG on a real Mac. Mac automatic updates stay off until the app is signed with an Apple Developer ID and notarized.
