---
status: superseded in part by 0002 (the answer modes are visible again)
---
# Composer: no mode picker, one + menu

The chat composer shows only a + menu, the input and send. The Ask / Build / Search switch in the top bar is gone, and so are the separate mic and speaker icons. The + menu (an Astryx `DropdownMenu`) holds Dictate, Voice talk, Attach files, Choose computers and Choose AI model. The router model (Jev, `decision.type` in `src/loop.js`) already reads each message and decides whether it is a question, a website, a video, a picture or a fact lookup, so asking the person to pick a mode first is redundant. The old bar also had a grey placeholder and a bare speaker icon (Voice talk) that read as a 0 to 100 volume control.

## Considered options

- **Keep Ask / Build / Search and add Video and Computer to the + menu (what shipped before).** Rejected: the person describes what they want, Jev decides what it is. Picking a mode first is work the product can do.
- **A searchable menu (Astryx `CommandPalette`) with Mode, Make, Voice and Setup groups.** Built and dropped: with the modes gone only five actions are left, so search adds nothing.
- **A mode chip inside the input, or mic and speaker kept on the bar.** Rejected: more controls competing with the input.

## Consequences

- A person can no longer force Build, Video or Search mode. The server still accepts `mode`, the page just sends `ask`; Jev's `decision.type` and the fact lookup in `runTask` cover web lookups, websites and videos. If Jev gets a case wrong there is no manual override. Watch for this and bring a mode back only as a correction after a wrong answer, not as a first step.
- Voice talk is now one tap deeper (+ then Voice talk). The Oracle screen and its "Only me" to "Whole room" slider are unchanged. That slider is the one real 0 to 100 control, which is why a bare speaker icon must never look like it.
- Corner radius follows the repo rule (`bun run check:radius`: every radius is `var(--radius)`, 0 or 50%); the design uses only Astryx components, so it inherits the theme radius.
- `src/page.js` (/classic) is unchanged.


## Follow-up

The page now always sends `ask`; the saved `chat_mode` is no longer read. Explain mode was widened: a press on any explained control opens an animated modal card (a live scene of the control inside), and press-and-hold opens the same card outside Explain mode.
