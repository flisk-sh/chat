# Alexa skill (Echo speaker at home)

`POST /alexa?key=ALEXA_KEY` answers an Alexa custom skill with the Flisk Oracle prompt. Alexa does the listening and speaking.

Set on the Worker: `bunx wrangler secret put ALEXA_KEY` (long random) and, after the skill exists, `ALEXA_SKILL_ID` (amzn1.ask.skill...).
In the Alexa developer console make a Custom skill, invocation name `flisk`, paste `docs/alexa-interaction-model.json` in the JSON editor,
endpoint HTTPS `https://chat.flisk.si/alexa?key=<ALEXA_KEY>` (certificate type: "wildcard certificate"), build, then test in "Alexa Simulator"
or say "Alexa, open Flisk" on any Echo signed in to the same Amazon account (development skills need no review).
Limit: 300 answers a day for the home speaker (scope `alexa-limit`).
