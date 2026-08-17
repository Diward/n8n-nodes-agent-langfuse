// Runs against the compiled output: `npm run build` first (npm test does both).
// Regression suite for issue #9: the name-uniqueness check used to run BEFORE
// nested toolkits were unwrapped, so two MCP Client Tool wrappers (whose own
// `name` is undefined) collided on 'undefined' and the node threw.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { collectTools } = require('../dist/nodes/AgentLangfuse/execute');
const { Toolkit } = require('@langchain/classic/agents');

const fakeNode = { name: 'test-node', type: 'agentLangfuse', typeVersion: 1 };

function tool(name) {
  return { name, description: `tool ${name}` };
}

test('two MCP-style toolkit wrappers with distinct tools flatten without throwing (issue #9)', () => {
  const wrapperA = { tools: [tool('search'), tool('fetch')] };
  const wrapperB = { tools: [tool('list'), tool('read')] };
  const result = collectTools([wrapperA, wrapperB], fakeNode);
  assert.deepEqual(
    result.map((t) => t.name),
    ['search', 'fetch', 'list', 'read'],
  );
});

test('a single MCP-style wrapper flattens to its tools', () => {
  const result = collectTools([{ tools: [tool('a'), tool('b')] }], fakeNode);
  assert.deepEqual(result.map((t) => t.name), ['a', 'b']);
});

test('a Toolkit instance is unwrapped via getTools()', () => {
  class FakeToolkit extends Toolkit {
    constructor() {
      super();
      this.tools = [tool('tk1'), tool('tk2')];
    }
  }
  const result = collectTools([new FakeToolkit(), tool('plain')], fakeNode);
  assert.deepEqual(result.map((t) => t.name), ['tk1', 'tk2', 'plain']);
});

test('duplicate names across wrappers still throw, with the real name', () => {
  const wrapperA = { tools: [tool('dup')] };
  const wrapperB = { tools: [tool('dup')] };
  assert.throws(
    () => collectTools([wrapperA, wrapperB], fakeNode),
    /multiple tools with the same name: 'dup'/,
  );
});

test('plain tools pass through untouched', () => {
  const a = tool('x');
  const result = collectTools([a], fakeNode);
  assert.equal(result[0], a);
});

test('empty input yields an empty list', () => {
  assert.deepEqual(collectTools([], fakeNode), []);
});
