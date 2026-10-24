# Verification — 0.7.0, 2026-10-24

- 71 Node tests and 17 Electron UI tests pass locally on Windows, including 4 for the phone app (docs/app opened in a 390×844 window in QA mode): a typed question and answer actions, history and search in the menu, a photo plus Word and text files as chips (the Word file is read in the browser with the shared Office parser and DecompressionStream), an old .doc refused, a voice question with transcript and read-aloud, the Ustoz quiz and streak, settings, and history after a reload. Unit tests check that the phone app carries the same shared code as the desktop app and that the versions match.
- Checked by hand in a phone-sized browser, light and dark: welcome screen, chat, menu with history, Ustoz test, attach sheet.
- Live, after the worker was deployed: a request with the GitHub Pages origin got CORS headers and an Uzbek answer; another origin was refused (403).
- GitHub Actions passed on Windows, macOS and Android for the 0.7.0 branch; the Android job builds the APK with Capacitor 8.5.3.
- Not verified yet: installing the APK on a real Android phone (microphone, camera, notifications) and the web app on a real iPhone (Safari, Bosh ekranga qo‘shish, voice recording in MP4).

# Verification — 0.6.1, 2026-10-23

- 67 Node tests and 13 Electron UI tests pass locally on Windows. New coverage: quiz/flashcard JSON parsing and validation, prompts, Leitner review, streak, quiz results and mistake cards, reminders (once/daily, late start, practice reminder), practice data persistence; Gemini TTS request shape and errors, raw PCM → WAV, voice recordings as Gemini-only inline audio, server audio validation, `/speak` validation and its separate budget; app messages for an old server and the speech limit. UI: the Ustoz panel end to end (quiz, mistakes → cards, review, streak, teacher style), reminders, a voice question with transcript and read-aloud, and the talk/listen pet moods.
- All nine mascot clips were rendered and checked frame by frame on dark and white backgrounds (no haze box or floor line); the mouth layer changes per mood.
- Live, after the worker was deployed (2026-10-24): `/speak` returned a 4.9 s, 24 kHz mono WAV in 4.7 s; that same audio sent back to `/chat` as a voice question came back as “Savolingiz: Kasr nima?” followed by an Uzbek answer. GitHub Actions passed on Windows and macOS for the 0.6.1 branch.
- Not verified yet: the microphone and the Accessibility/microphone prompts on a real Mac.

# Verification — 0.6.0, 2026-10-23

- 54 Node tests and 9 Electron UI tests pass locally on Windows. New coverage: encrypted chat history (save/reload, safe fields only, caps, search with any apostrophe style, broken or unencrypted storage), the history setting, selected-text capture (clipboard restored, nothing selected, clipboard with copied files left alone, Ctrl+Insert before Ctrl+C, terminal guard in the Ctrl+C script), mascot moods in the pet window (catch on a dropped file, sad on an error, sleep, wave on hover, happy then idle), the shortcut flow end to end in QA mode, and history search/reopen/continue/delete in the UI.
- Real Windows check of `src/selection.cjs` in Electron 44: a selected textarea is captured with Ctrl+Insert (~0.6 s) and with the guarded Ctrl+C (~0.9 s); the previous clipboard (text + HTML) comes back afterwards; with nothing selected the result is empty and the clipboard is unchanged. The foreground-process lookup used by the terminal guard returns the right process name.
- All seven mascot clips play in the pet window; with the chat hidden the app stays at about 0–3% CPU while idle or asleep.
- Windows 0.6.0 NSIS Setup builds and passes the package allowlist check; the package contains the seven clips, `src/chats.cjs` and `src/selection.cjs`.
- Fixed: since 0.5.0 the chat window did not open on start (its `ready-to-show` handler had ended up inside a comment).

Not verified yet: the Ctrl+Alt+E shortcut inside other real apps (Word, browsers, Telegram) and in a real terminal window; the macOS Accessibility prompt and ⌘+⌥+E on a real Mac; installing the 0.6.0 builds from GitHub Actions.

# Verification — 0.4.0, 2026-10-18

- 46 Node tests and 5 Electron UI tests pass locally on Windows. New coverage: Word (paragraphs, tabs, tables), Excel (sheet names, shared/inline strings, column gaps), PowerPoint (slide order), UTF-8/UTF-16/Windows-1251 text, PDF and image handling, legacy/broken/empty/oversized files, zip-bomb guard, conversation limits, Gemini inline media vs. text-only providers, 422/413 handling, attachment validation on the server, drag-and-drop chips and quick actions, and safe rich-text rendering (no HTML execution).
- Real PNG/JPEG and .docx files dropped into the QA app produce a thumbnail chip and a DOCX chip. Electron's screen capture returns a full-resolution, non-empty image on this Windows machine (only its size was checked; the image was not viewed or stored).
- An upgraded 0.3.0 profile shows the "Nima yangi" card once.
- Windows 0.4.0 NSIS Setup builds and passes the package allowlist check; the Cloudflare worker passes a dry run.
- 0.3.0: GitHub Actions Windows/macOS builds, release assets and the live gateway were verified when it shipped.

Not verified yet: live Gemini answers with real images/PDFs (needs the updated worker deployed), macOS screen-recording permission flow and installing the DMG on a real Mac. Mac automatic updates stay off until the app is signed with an Apple Developer ID and notarized.
