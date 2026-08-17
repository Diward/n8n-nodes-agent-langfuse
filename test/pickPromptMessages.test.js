// Runs against the compiled output: `npm run build` first (npm test does both).
// A Langfuse chat prompt is reduced to one system + one user turn; any other
// turns used to be dropped silently. pickPromptMessages reports how many were
// ignored so the node can warn instead of losing few-shot turns in silence.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { pickPromptMessages } = require('../dist/nodes/AgentLangfuse/langfuse');

test('system + user prompt: both picked, nothing ignored', () => {
  const r = pickPromptMessages([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'usr' },
  ]);
  assert.equal(r.systemMessage, 'sys');
  assert.equal(r.userMessage, 'usr');
  assert.equal(r.ignoredTurns, 0);
});

test('system-only prompt: no user, nothing ignored', () => {
  const r = pickPromptMessages([{ role: 'system', content: 'sys' }]);
  assert.equal(r.systemMessage, 'sys');
  assert.equal(r.userMessage, undefined);
  assert.equal(r.ignoredTurns, 0);
});

test('few-shot prompt: assistant turns and later user turns are counted as ignored', () => {
  const r = pickPromptMessages([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'example in' },
    { role: 'assistant', content: 'example out' },
    { role: 'user', content: 'real question' },
  ]);
  assert.equal(r.systemMessage, 'sys');
  assert.equal(r.userMessage, 'example in');
  assert.equal(r.ignoredTurns, 2);
});

test('missing system message: undefined system, user still picked', () => {
  const r = pickPromptMessages([{ role: 'user', content: 'usr' }]);
  assert.equal(r.systemMessage, undefined);
  assert.equal(r.userMessage, 'usr');
  assert.equal(r.ignoredTurns, 0);
});

test('non-string content does not count as a picked turn', () => {
  const r = pickPromptMessages([
    { role: 'system', content: 'sys' },
    { role: 'user', content: [{ type: 'text', text: 'block' }] },
  ]);
  assert.equal(r.systemMessage, 'sys');
  assert.equal(r.userMessage, undefined);
  assert.equal(r.ignoredTurns, 1);
});
