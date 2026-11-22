---
status: proposed
---
# Composer: a clean bar with one searchable + menu

The chat composer shows only +, the input and send. Modes, task categories, voice, files, computers and the AI model move into one searchable + menu (open with +, or `/`). Anything switched on (a mode other than Chat, Read aloud, a non-default computer, an attached file) shows as a removable chip above the input. We did this because the old bar had a grey placeholder in a dark inset box, a bare speaker icon that read as a 0 to 100 volume control, and too many controls competing in one row.

## What moves where

| Control | Before | After |
|---|---|---|
| Modes (Chat, Build, Create, Search, Computer, Voice) | segmented row in the bar | Mode group in the + menu; current mode shown as a chip when not Chat |
| Task categories (Website, App, System, Answer, Video, Check) | tiles in the + menu | Make group in the + menu |
| Dictate, Voice talk | icons in the bar or menu | Voice group in the + menu |
| Read answers aloud | bare speaker icon | switch row in the Voice group, plus a "Read aloud" chip when on |
| Attach files, Computers, AI model | bar and menu | Setup group in the + menu |

Phones keep the bottom sheet the app already uses under 860px, with the same search and groups.

## Considered options

- **All controls visible in one row.** Rejected: too crowded at 760px, and every control keeps competing with the input.
- **Mode chip inside the input.** Rejected by the product owner as the mode switcher.
- **Mic and Read aloud kept on the bar, rest in the menu.** Rejected: two special cases, and the speaker problem comes back.
- **Wide two-column menu, taller two-line box, example-prompt placeholder.** Not chosen.

## Consequences

- Switching mode costs one extra tap. The mode chip above the input is the only visible sign of a non-Chat mode.
- The Oracle (Voice talk) screen and its "Only me" to "Whole room" slider are unchanged. That slider is the one real 0 to 100 control, which is why a bare speaker icon must never look like it.
- The task text, history and model code keep their ids (`#task`, `#plus`, `#voice`, `#orbbtn`, `#mp`); only placement and styling move.
- **Corner radius.** The repo enforces sharp corners (`bun run check:radius`: every radius is `var(--radius)`, 0 or 50%). The rounded pill shown in the design mock (999px) is therefore not allowed. The composer keeps its existing `var(--radius)` card; only the send button, switch knob and dots are round (50%). The mock was a reference for layout, not for corners.
