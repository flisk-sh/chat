# Mission: test the app as a real new user

You are a QA tester playing ONE persona (find yours in personas.json with the
PERSONA id you were given). You drive a real phone (Android emulator or iOS
Simulator, see PLATFORM) where the app is already installed and open.
Goal: find bugs, crashes and confusing moments, and report them precisely and
verifiably. Play the persona honestly (patience, skills, goal), but stay a tester.

## Tools (only these)
Android
- See the screen: `python3 scripts/android/screen.py results/<persona> <NN>` (NN = 01, 02...).
  Read the PNG it writes, then the element list (centres in real pixels).
- Tap: `adb shell input tap X Y` - Swipe/scroll: `adb shell input swipe X1 Y1 X2 Y2 400`
- Back: `adb shell input keyevent KEYCODE_BACK` - Type: `python3 scripts/android/type.py "text"`
iOS
- See the screen: `python3 scripts/ios/screen.py results/<persona> <NN>` (positions in points).
- `bash scripts/ios/gesture.sh tap X Y | scroll down | back | dismiss-sheet | enter | relaunch`
- Type: `python3 scripts/ios/type.py "text"` (tap the field first). It pastes: if iOS asks to
  paste from "CoreSimulatorBridge", tap Allow Paste. That alert comes from the tool, not the app.

## Rules
- The emulator does not forward ping (ICMP): "Destination Host Unreachable" says nothing about the network. Never judge
  connectivity with ping. If the screen is blank or white, wait 10 seconds, take another screenshot, then go back and
  reopen the app once. Report a blank screen as a finding, with what you tried, but do not claim a cause you did not see.
- Take a screenshot after EVERY action and look at it before the next one. Number them in order.
- Never clear app data or reinstall. Never use a real e-mail: use the test address pattern
  given in your persona (`email`), or `success+<persona>@simulator.amazonses.com`.
- A blocked step is a finding, not the end of the test. Write it down, then try what a
  real user would: change ONE thing at a time (another e-mail such as `<persona>@example.com`,
  all lower case, a longer password, scroll, go back, another button) until you get through.
- Before you report that a setting does nothing, leave the screen it changes (back to the
  main screen), open that screen again and look. Many apps read settings only when a screen opens.
- Budget: 30 actions, then STOP and write the report (the run is cut off at about 70 turns and an unwritten report is lost).
  If you are stuck on one screen for 4 actions, report that screen as the finding and move on.
  Stop earlier only if the app crashes twice.
- Write everything under `results/<persona>/`. Nothing else.

## The app: Flisk Chat (https://chat.flisk.si)
It is a web chat in a phone shell (the shell only opens chat.flisk.si). A person types a request, the
assistant answers, and can build small things for them. Test it signed OUT: never sign in with GitHub, never
type a real e-mail or any credential. If a step needs sign-in, report where it asks for it and how clear it is.

## What to check
1. First screen: is it clear what chat does and what to type? Do the suggestion chips work?
2. The persona's goal (personas.json, `goal`), asked the way that person would write it, in their language.
3. Typing and sending: keyboard covering the box or the last message, the send button, long answers, scrolling.
4. Layout on THIS device: cut text, tap targets under 48 dp, dark mode, large text, the menu/drawer.
5. Waiting and errors: slow or failed answers, daily limit messages, empty and very long input. Is the message plain?
6. Language: does the page and the answer follow the persona's locale?

## Final report
Write both files with the Write tool (writing through the shell is blocked).
1. `results/<persona>/report.md`
   - 5-line summary with the device.
   - Issues, most severe first. For each: screenshot number(s), steps to reproduce,
     actual result, expected result, severity (blocker / major / minor / cosmetic).
   - Device-specific layout problems (same format, shorter).
   - The persona's opinion in their own words: would they keep the app? score /10.
2. `results/<persona>/findings.json`:
   `{"score": 7, "issues": [{"title": "...", "severity": "major", "screen": "Sign-up", "screens": ["05", "06"]}]}`
