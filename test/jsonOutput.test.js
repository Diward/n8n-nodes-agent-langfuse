// Runs against the compiled output: `npm run build` first (npm test does both).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseAgentJsonOutput } = require('../dist/nodes/AgentLangfuse/jsonOutput');

test('parses a clean JSON object', () => {
  assert.deepEqual(parseAgentJsonOutput('{"a":1,"b":true}'), { a: 1, b: true });
});

test('parses JSON wrapped in a ```json fence', () => {
  assert.deepEqual(parseAgentJsonOutput('```json\n{"a":1}\n```'), { a: 1 });
});

test('parses JSON wrapped in a bare fence', () => {
  assert.deepEqual(parseAgentJsonOutput('```\n{"a":1}\n```'), { a: 1 });
});

test('parses JSON with surrounding prose', () => {
  assert.deepEqual(
    parseAgentJsonOutput('Sure, here it is: {"a":1} hope it helps'),
    { a: 1 },
  );
});

test('returns a plain object input as-is', () => {
  const obj = { a: 1 };
  assert.equal(parseAgentJsonOutput(obj), obj);
});

test('throws on non-JSON garbage', () => {
  assert.throws(() => parseAgentJsonOutput('not json at all'));
});

test('throws on a JSON array', () => {
  assert.throws(() => parseAgentJsonOutput('[1,2,3]'));
});

test('throws on a JSON primitive', () => {
  assert.throws(() => parseAgentJsonOutput('42'));
});

test('throws on an empty / whitespace string', () => {
  assert.throws(() => parseAgentJsonOutput('   '));
});

test('throws on a non-string, non-object input', () => {
  assert.throws(() => parseAgentJsonOutput(42));
});
