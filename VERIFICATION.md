# Verification — 2026-10-18

- 30 Node tests and 3 Electron UI tests pass locally on Windows (no-key chat flow, settings, masked key fields, renderer isolation, inert HTML).
- GitHub Actions: Windows and macOS jobs pass tests and packaging (Windows NSIS Setup, macOS universal DMG/ZIP, ad-hoc signed without a Developer ID).
- Local Windows Setup builds as a one-click installer; the installer and app executable carry the new U+N icon; app.asar contains the tray icons and the fixed release feed.
- Cloudflare gateway is deployed. Two Workers-only bugs were fixed before it answered: `fetch` called as a method ("Illegal invocation") and `redirect: 'error'` (unsupported). A live `/chat` request returned a real Gemini answer; `/health` reports ready.
- Icons: the vector `assets/icon.svg` matches the source image on all but 0.13% of pixels (edge anti-aliasing only). All ICO sizes (16–256) load through the Windows icon API.
- Download page renders on desktop and phone widths and is live on GitHub Pages.

Not verified: installing the Mac DMG on a real Mac (Gatekeeper prompt, menu-bar icon, multi-monitor). Mac automatic updates stay off until the app is signed with an Apple Developer ID and notarized.
