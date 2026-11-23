# Anna's test report — Flisk Chat on Android (small phone, Android 11, font scale 1.3, light theme, en-GB)

## Device
Nexus 5 emulator, Android 11, screen 1080×1920, font scale ×1.3, light theme, locale en-GB. App: si.flisk.chat (WebView shell loading https://chat.flisk.si).

## 5-line summary
The app opened but showed a completely blank screen for the entire test — no chat input, no welcome text, no example chips, nothing tappable. The emulator has no network connectivity (every host, including 1.1.1.1 and google.com, replies "Destination Host Unreachable" via gateway 10.0.2.2), so the WebView shell that loads chat.flisk.si remotely cannot render anything. I could not complete anna's goal of asking Flisk Chat a real question. This is a blocker: the app cannot be used at all on this device without network.

## Issues

### 1. Blank screen — app never loads (blocker)
- **Screenshot:** 01–14
- **Steps to reproduce:** Open the app (si.flisk.chat) on the Android emulator; wait.
- **Actual result:** Screen stays white apart from the status bar (time, battery) and the navigation bar. At one point a "Flisk Chat" label appeared near the bottom, but no content ever renders — no heading, no input box, no suggestion chips, no sign-in button.
- **Expected result:** The Flisk Chat home page should load, showing "Ask for a website, an app or a whole system" with example chips and a message input box.
- **Root cause:** The emulator has no network connectivity — ping to 1.1.1.1, google.com and chat.flisk.si all fail with "Destination Host Unreachable". The Capacitor shell loads https://chat.flisk.si as a remote URL (see testers/chat-wrapper/capacitor.config.json), so nothing can render without it.
- **Severity:** blocker

### 2. Cannot complete anna's goal (consequence of #1)
- **Screenshot:** 01–14
- **Actual result:** No input field exists on screen, so there is nothing to type into and no way to ask Flisk Chat anything or follow up.
- **Expected result:** anna, a retired teacher, should be able to type a real question in en-GB, get an answer, follow up once, and judge usefulness.
- **Severity:** blocker

## Device-specific layout problems
None could be assessed because the screen never renders content. The only visible element at times was the "Flisk Chat" text near the bottom of the screen (centre=(540, 924) in half-size screenshot coordinates), which appears to be part of the shell's header area but nothing around it loads.

## Anna's opinion — would she keep the app?
Score: 0/10 — the app shows a blank screen and does nothing. A retired teacher with low patience for jargon would not be able to use it at all, and there is no error message explaining why (no "no internet" banner, no retry button). She would delete it immediately.

---

**Note:** The blocker is the test environment's network, not necessarily the app itself — on a device with network the WebView should load chat.flisk.si normally. This needs re-testing once the emulator can reach the network.