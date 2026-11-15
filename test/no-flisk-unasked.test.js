import { describe, expect, test } from 'bun:test';
import { asksToBuild, runTask, SYSTEM } from '../src/loop.js';

const INSTALL = '{"run":"curl -fsSL https://flisk.sh/install.sh | sh; cd ~ && flisk create app --frontend vanilla --language node --yes"}';

function fakeComputer(ran) {
  return {
    start: async () => ({ data: { id: 'pod_1', provider: 'upstash' } }),
    run: async (_id, cmd) => (ran.push(cmd), { data: { exitCode: 0, stdout: 'ok', stderr: '' } }),
    stop: async () => ({ status: 200 }),
  };
}
const script = (replies, seen = []) => async (messages) => (seen.push(messages[messages.length - 1]?.content), { text: replies.shift() || '{"say":"done"}' });

describe('Flisk only when the user asked for an app', () => {
  test('a plain question about the flisk GitHub repo is not a build', () => {
    expect(asksToBuild('see Referring sites to https://github.com/flisk-sh/flisk')).toBe(false);
    expect(asksToBuild('how many stars does github.com/flisk-sh/flisk have?')).toBe(false);
    expect(asksToBuild('Build a small CRM with flisk: contacts with name, email')).toBe(true);
    expect(asksToBuild('now add a search box', [{ role: 'user', content: 'a shop' }])).toBe(true);
  });

  test('the question from chat.flisk.si: Flisk is refused and the model is told to answer instead', async () => {
    const ran = [];
    const seen = [];
    const r = await runTask({
      task: 'see Referring sites to https://github.com/flisk-sh/flisk',
      model: script([INSTALL, '{"run":"gh api repos/flisk-sh/flisk/traffic/popular/referrers"}', '{"say":"github.com, google.com"}'], seen),
      computer: fakeComputer(ran),
      publish: async () => ({}),
    });
    expect(ran.some((c) => c.includes('flisk create') || c.includes('install.sh'))).toBe(false);
    expect(ran).toContain('gh api repos/flisk-sh/flisk/traffic/popular/referrers');
    expect(JSON.stringify(seen[1])).toContain('asked a question, not for an app');
    expect(r.answer).toBe('github.com, google.com');
  });

  test('an app request still installs Flisk and makes the project', async () => {
    const ran = [];
    await runTask({ task: 'build me a to-do app', model: script([INSTALL, '{"say":"ok"}']), computer: fakeComputer(ran), publish: async () => ({}) });
    expect(ran.some((c) => c.includes('flisk create app'))).toBe(true);
  });

  test('the instructions say questions about a repo named flisk are never an app', () => {
    expect(SYSTEM).toContain('even a repo named flisk');
  });
});
