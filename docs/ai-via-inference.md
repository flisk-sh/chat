# AI reaches chat only through inference

**Rule.** Chat (chat.flisk.si) gets AI only from models that inference (inference.flisk.si, `flisk-sh/flisk-inference`) serves.
Chat does not host, bundle or choose its own model. A new model, a browser model or a classifier is added to inference
first (catalog entry, assets, prompt format, limits); chat then uses it by asking inference for it.

Why: one place decides what the free models are, what they cost and what they may do; chat stays a thin client; every
product that wants a model gets the same one.

## What this means for the in-browser pieces

- **In-browser chat model** (runs in the visitor's tab on WebGPU, no server cost): first a catalog entry in inference
  (`runtime: webgpu`, model, weights URL, size, prompt format). Chat reads it from inference and uses it as the last tier
  before "busy": the server sends the web results it already has, the tab writes the answer from them.
- **jev2browser** (the decision and grading classifier, language and kind of ask, now `decide()` / `gradeReply()` in
  `src/model.js` on Workers AI): built and deployed in inference first, served from inference.flisk.si. Chat loads it from
  there and sends its answer to `/api/run` as a hint. The word lists still win when they are certain.
- Closest siblings: [linux2wasm](https://github.com/flisk-sh/linux2wasm) (Linux in the tab) and
  [cfworker2browser](https://github.com/flisk-sh/cfworker2browser) (a Worker in the tab): the page is the host, closing the
  tab ends it.

## Where chat does not follow the rule yet

`src/model.js` still calls Workers AI directly (`env.AI`) for the Llama fallback, Jev (`decide`, `gradeReply`) and
Pollinations/OpenRouter fallbacks. Those move behind inference over time; new AI features do not add to them.

## When no AI is available

A question is answered from the web with its sources (`answerFromWeb`, `src/search.js`), never with a bare "busy" error.
