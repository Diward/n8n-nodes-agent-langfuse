// Runs against the compiled output: `npm run build` first (npm test does both).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ToolMessage, AIMessage, HumanMessage } = require('@langchain/core/messages');
const { applyLangChainV1MessageCompat } = require('../dist/nodes/AgentLangfuse/langchainCompat');

const MESSAGE_SYMBOL = Symbol.for('langchain.message');

// The brand check `@langchain/core` 1.x runs before it will read `tool_call_id`,
// transcribed from messages/base.js and messages/tool.js of 1.1.41. Reimplemented
// here so the test does not need a second core installed.
function isMessage(m) {
  return (
    typeof m === 'object' &&
    m !== null &&
    'type' in m &&
    'content' in m &&
    (typeof m.content === 'string' || Array.isArray(m.content))
  );
}
function baseIsInstance(m) {
  return typeof m === 'object' && m !== null && MESSAGE_SYMBOL in m && m[MESSAGE_SYMBOL] === true && isMessage(m);
}
const toolIsInstance = (m) => baseIsInstance(m) && m.type === 'tool';
const aiIsInstance = (m) => baseIsInstance(m) && m.type === 'ai';

// Must run first: node --test gives each file its own process, so until the
// shim is applied below the prototype is untouched. This is the bug of #7.
test('without the shim a core 1.x brand check rejects our ToolMessage', () => {
  const tm = new ToolMessage({ content: '8471', tool_call_id: 'call_1' });
  assert.equal(toolIsInstance(tm), false);
  assert.equal(tm.tool_call_id, 'call_1'); // the id is there, the brand is not
});

test('the shim makes a ToolMessage pass the core 1.x brand check', () => {
  applyLangChainV1MessageCompat();
  const tm = new ToolMessage({ content: '8471', tool_call_id: 'call_1' });
  assert.equal(toolIsInstance(tm), true);
  assert.equal(tm.type, 'tool');
  assert.equal(tm.tool_call_id, 'call_1');
});

test('the shim makes an AIMessage pass the core 1.x brand check', () => {
  applyLangChainV1MessageCompat();
  const ai = new AIMessage({
    content: '',
    tool_calls: [{ name: 'calculator', args: { input: '197*43' }, id: 'call_1', type: 'tool_call' }],
  });
  assert.equal(aiIsInstance(ai), true);
  assert.equal(ai.type, 'ai');
});

test('the shim reports the right type for every message class', () => {
  applyLangChainV1MessageCompat();
  assert.equal(new HumanMessage('hi').type, 'human');
  assert.equal(new AIMessage('hi').type, 'ai');
  assert.equal(new ToolMessage({ content: 'x', tool_call_id: 'c' }).type, 'tool');
});

test('the shim adds no enumerable properties and does not change serialisation', () => {
  const before = JSON.stringify(new ToolMessage({ content: 'x', tool_call_id: 'c' }));
  applyLangChainV1MessageCompat();
  const tm = new ToolMessage({ content: 'x', tool_call_id: 'c' });
  assert.equal(JSON.stringify(tm), before);
  assert.equal(Object.keys(tm).includes('type'), false);
  assert.equal(Object.prototype.propertyIsEnumerable.call(tm, 'type'), false);
});

test('the shim is idempotent and leaves the original API intact', () => {
  applyLangChainV1MessageCompat();
  applyLangChainV1MessageCompat();
  const tm = new ToolMessage({ content: 'x', tool_call_id: 'c' });
  assert.equal(tm._getType(), 'tool');
  assert.equal(tm.getType(), 'tool');
  assert.equal(tm.content, 'x');
  assert.equal(typeof tm.toJSON(), 'object');
});
