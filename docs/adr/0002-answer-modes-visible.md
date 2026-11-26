---
status: accepted
---
# Answer modes: three visible choices above the composer

Supersedes the "no mode picker" part of [0001](0001-composer-no-mode-picker.md). The composer keeps its one row (+, text, send). Above it sits one control, "How to answer", with three choices: **Quick answer** (default), **Ask me first** and **Take your time**. `/fast`, `/ask` and `/long` at the start of the box pick the same choices, ⌘1, ⌘2 and ⌘3 do too, ⌘K opens a command menu with them, and holding ⌘ shows every shortcut.

The three choices are about how much the person wants to be involved, not about what is made. The Jev router still decides whether a message is a question, a site, a picture or a video, and the page still sends `mode: ask` to the server, so nothing server side changes and the 40 answers a day are not affected.

- **Quick answer** sends the words as typed.
- **Ask me first** shows three short questions (who is it for, what do you already have, what counts as a win) before anything is sent. The answers are added to the task. Skipping sends the task as typed. For a person who knows the topic and wants to steer.
- **Take your time** adds one line asking for a plan first and the whole job done.

## Considered options

- **Keep 0001 as it was.** Rejected by the owner: people who know the topic had no way to say so, and nobody could ask for a slower, fuller answer.
- **A mode chip inside the input.** Rejected in 0001 and still rejected: it competes with the input. The control sits above the composer instead.
- **Run the quick and the long answer side by side, with a pill that shows the long one cooking.** Mocked and liked, not built: it needs a background run on the server and doubles the cost of each message. Left for a separate decision.

## Consequences

- `Take your time` is only a request to the same model for now; it is not a longer run. Do not describe it as one.
- A person can pick a mode by accident. The choice is kept for the browser tab (`sessionStorage`) and the control always shows the current one.
- Shortcuts use the page's key events, so ⌘K and ⌘1 to ⌘3 also work while the box has focus.
