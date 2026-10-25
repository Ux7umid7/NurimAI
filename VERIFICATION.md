# Verification — 0.8.2, 2026-10-25

- 96 Node tests and 18 Electron UI tests pass locally on Windows. New UI coverage: the Mavzu choice in both apps (Tizim / Yorug‘ / Qorong‘i) switches the palette and the phone's theme-color at once, beats the system's mode, follows the system on "Tizim" (also when it changes) and is applied before the first paint after a reload. Screenshots of both settings screens in light and dark were checked by eye.
- Out of 7 full UI runs, 5 passed and 2 had one failure each: a 3D-pet mood timing check ("Nur catches files…") and one `toHaveCount` check whose test was not recorded; reruns passed, and two runs without the theme change also passed.
- Live server (deployed by the user): news, weather and currency questions answered from the internet with sources; cbu.uz times out from Cloudflare, so the market rate (ExchangeRate-API) stands in and says it is not official. `/health` reports `fallback: true` (Workers AI bound). Gemma 4 on Workers AI was tried in a scratch worker: correct Uzbek ("Surat/Maxraj"), 13–17 neurons per answer with thinking off.
- Not verified: an answer actually served by Workers AI on the live server (it only runs once Gemini and Groq are both used up), and the theme choice on a real phone.

# Verification — 0.8.1, 2026-10-24

- Found while checking 0.8.0 live on the site: after an answer the phone app kept the "Tayyor!" Pufak panel open, because rendering the answer cancelled the panel's timer. Fixed; a new UI test waits for the panel to close and fails on the 0.8.0 code.
- Live on the site (0.8.0): a real question got a step-by-step Uzbek answer in the new design, read-aloud played and stopped, and the drawer, new chat, bottom menu, Ustoz, settings and the practice card all worked.

# Verification — 0.8.0, 2026-10-24

- 74 Node tests and 17 Electron UI tests pass locally on Windows, with new UI coverage: the wide window's chats sidebar (current chat, search), the week streak row and the gold practice card, the full-screen listening view on both apps, the phone's bottom menu (home screen only) and the 2D avatar.
- Every phone screen was screenshotted in headless Chrome in dark and light (home, drawer, settings, attach sheet, what's new, files, answer + notice, quiz question, quiz result, cards study, reminders) with no page errors; two issues found there were fixed (the "done" dots under "Tayyor!", a two-line placeholder with files).
- The desktop window was checked wide (1000×700) and narrow (440×700), dark and light, plus settings, history, Ustoz and the listening view from the Electron test run.
- Not verified yet: the new design on a real Android phone and a real iPhone.

# Verification — 0.7.2, 2026-10-24

- 74 Node tests and 17 Electron UI tests pass locally on Windows. New UI coverage: "---" and "* * *" lines in an answer become an hr as wide as the answer text in both chats, "---" inside a code block stays text, and read-aloud skips it.
- Checked by hand in the phone app (375×812, QA mode) in dark and light: a Gemini-style answer with two "---" lines shows two thin full-width lines.

# Verification — 0.7.1, 2026-10-24

- 74 Node tests and 17 Electron UI tests pass locally on Windows. New coverage: LaTeX math in answers turns into plain text (fractions, powers, roots, degrees, Greek letters, \(…\), $$…$$, aligned lines), while money ("10$ va 20$", "$5 dan $10 gacha"), code blocks, inline code and file paths stay as written; AI quizzes and cards get the same cleanup; both chat windows show "$\frac{1}{2}$" as "1/2".
- Checked by hand in the phone app (375×812, QA mode): a Gemini-style answer with fractions, powers, a root and degrees shows as 1/2, 2³, √16, 90°, with no console errors.
- The instruction asking the AI to avoid LaTeX takes effect only after the worker is deployed again (`npx wrangler deploy` in server/). Until then the apps clean up LaTeX on their own.
- Not verified: how the TTS voice reads the new symbols (², √) aloud.

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
