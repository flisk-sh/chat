---
status: accepted
---
# Answer modes: three visible choices above the composer

Supersedes the "no mode picker" part of [0001](0001-composer-no-mode-picker.md). The composer keeps its one row (+, text, send). Above it sits one control, "How to answer", with three choices: **Quick answer** (default), **Ask me first** and **Take your time**. `/fast`, `/ask` and `/long` at the start of the box pick the same choices, ⌘1, ⌘2 and ⌘3 do too, ⌘K opens a command menu with them and with the chat's own actions (new chat, plugins, AI model, computers, attach, dictate, voice talk, settings), and holding ⌘ shows every shortcut. Both extend the composer itself, upward inside the same rounded box (its drawer), not a modal or a floating card: ⌘K shows a filter box and the choices "How to answer" and "Chat" as a listbox (↑ ↓ move, Enter runs, Esc or ⌘K again closes and the focus goes back to the message box); the held-⌘ list is a row in that drawer whose items wrap, so nothing is cut off on a phone.

The three choices are about how much the person wants to be involved, not about what is made. The Jev router still decides whether a message is a question, a site, a picture or a video, and the page still sends `mode: ask` to the server, so nothing server side changes and the 40 answers a day are not affected.

- **Quick answer** sends the words as typed.
- **Ask me first** shows three short questions (who is it for, what do you already have, what counts as a win) before anything is sent. The answers are added to the task. Skipping sends the task as typed. For a person who knows the topic and wants to steer.
- **Take your time** answers quickly first, as Quick answer does. A second request, with one extra line asking for a plan first and the whole job done, runs at the same time. A pill under the quick answer shows it cooking. When it is ready its card opens by itself, with a preview and "Switch to this answer" (also Option+Enter), which replaces the quick answer.

## Considered options

- **Keep 0001 as it was.** Rejected by the owner: people who know the topic had no way to say so, and nobody could ask for a slower, fuller answer.
- **A mode chip inside the input.** Rejected in 0001 and still rejected: it competes with the input. The control sits above the composer instead.
- **Run the long answer on the server in the background.** Not needed to ship this: the page sends both requests itself. Revisit if long runs must survive closing the tab.

## Consequences

- `Take your time` sends two requests, so one message uses two of the 40 answers a day. The pill and the card say so only by showing the long answer; if people hit the limit sooner, count it as one on the server.
- The long run lives in the page: closing or reloading the tab loses it. A question from the long run to the person (the mock had one) is not built.
- A person can pick a mode by accident. The choice is kept for the browser tab (`sessionStorage`) and the control always shows the current one.
- Shortcuts use the page's key events, so ⌘K and ⌘1 to ⌘3 also work while the box has focus.
