# Add a widget or a tool to Flisk Chat

A **widget** is a card the chat draws from data (weather, a chart, the services of a Flisk project) instead of one paragraph of text. A **tool** is something the model can use on the Linux computer (a command-line program, a Flisk resource). This page shows how to add each one.

## How a widget works

```text
model sends   {"widget": {"kind": "weather", "place": "London"}}
loop.js       finds "weather" in the registry, checks the data, runs it
              → emits {type: "widget", kind: "weather", data: {...}}
page.js       WIDGET_DRAW.weather(data) builds the card from DOM nodes
```

The model only sends **data**. It never sends HTML or script, so a widget cannot put anything unsafe on the page. Widgets that need no computer (weather, charts) run in the Worker and cost no computer time.

Built in today:

| Widget | What it draws | Needs a computer |
| --- | --- | --- |
| `weather` | Now, the next 24 hours and 7 days, from Open-Meteo (free, no key) | no |
| `chart` | A line or bar chart, up to 60 points and 4 series | no |
| `services` | Each service of the Flisk project running on the computer, with its state, from `flisk status --json` | yes |

## Add a widget: three edits

**1. Register it in `src/widgets.js`.** One entry in `WIDGETS`:

```js
stocks: {
  id: 'stocks', title: 'Price',
  prompt: '{"widget": {"kind": "stocks", "symbol": "<ticker>"}} for the price of a share. Then "say" one sentence on the move.',
  clean: (i) => (str(i.symbol, 8) ? { symbol: str(i.symbol, 8).toUpperCase() } : null),   // null = invalid, the model is told and retries
  run: async ({ symbol }, { fetch }) => {
    // ...fetch the data here...
    return { data: { symbol, price: 123.4 }, summary: `Price card shown for ${symbol}: 123.4.` };
  },
},
```

- `prompt` is the line the model reads. It is added to the system prompt for you; nothing else to edit in `loop.js`.
- `clean` checks and trims what the model sent. Return `null` when it is not valid.
- `run` returns `{ data, summary }` or `{ error }`. `data` goes to the page; `summary` goes back to the model so its final answer can talk about the card. Add `needsComputer: true` if `run` needs the computer: it then gets `ctx.computer` and `ctx.podId`.

**2. Draw it in `src/page.js`.** One function in `WIDGET_DRAW`, named like the id:

```js
stocks(d){const c=node('div','wg');c.appendChild(node('div','wtitle',d.symbol));c.appendChild(node('div','wtemp',String(d.price)));return c;},
```

Build the card with `node(tag, class, text)` and `sv(...)` for SVG. Never put model data into `innerHTML`. Use `var(--radius)`, `0` or `50%` for corners (`bun run check:radius`).

**3. Test it in `test/widgets.test.js`.** Give `run` a fake `fetch`, and check `parseWidget` rejects bad data. The registry test already checks that the prompt line is in the system prompt and that the page has a drawer for the id.

## Add a tool the model can use on the computer

The model works on a real Linux computer from your own sandbox provider. If it needs a program that is not installed, it installs it in the task (`pip install`, `npm i`, `curl`). To make that reliable, add a line to the rules in `src/loop.js` (the `SYSTEM` prompt) with the exact commands, as the rule for multi-service apps does.

To give the computer a Flisk project (a database, a backend, a frontend), the model uses Flisk in local-process mode, where each service declares a `command`:

```bash
flisk tool add postgresql      # or react, fastapi, rag ... see the list with: flisk tool add
flisk up
```

Then the `services` widget draws what is running. `flisk tool add` and its catalog live in the Flisk repository; see its `docs/add-a-tool.md`. Cloud providers (AWS, Google Cloud, Azure) are refused there on purpose: Flisk runs locally and never creates cloud resources.

## Rules for every widget

- Data in, DOM out. No HTML, no script, no remote images from the model.
- Keep `run` short and fast. A widget that needs no computer should answer in a second or two.
- Cap everything the model sends (lengths, counts), as `chart` does.
- One card should answer one question. Put the explanation in the model's `say`, not in the card.
