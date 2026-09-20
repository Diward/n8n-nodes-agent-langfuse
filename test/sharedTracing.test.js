// Runs against the compiled output: `npm run build` first (npm test does both).
//
// Two guards for the move of tracing.ts into nodes/shared/, so the decision
// agent can reuse it without a second copy.
//
// The first one is not stylistic. `setLangfuseTracerProvider` is a GLOBAL setter
// in @langfuse/tracing, and that package is hoisted and shared across every
// community node installed in an n8n instance (verified on the production
// container: /home/node/.n8n/nodes/node_modules/@langfuse/tracing, with no
// nested copy under this package). Two modules calling it means the last one to
// initialise wins, and the loser's spans get exported by the winner's processor,
// carrying the winner's credentials. One module, one provider.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('only the shared module registers the Langfuse tracer provider', () => {
  const callers = walk(DIST).filter((file) =>
    // tsc emits `(0, tracing_1.setLangfuseTracerProvider)(provider)`, so match
    // the bare name and not a call with a parenthesis after it.
    fs.readFileSync(file, 'utf8').includes('setLangfuseTracerProvider'),
  );

  assert.deepEqual(
    callers.map((f) => path.relative(DIST, f)),
    ['nodes/shared/tracing.js'],
  );
});

test('the agent node keeps its contract: one credential and a required chat model', () => {
  // The decision agent is a new node type, so nothing about this one should
  // move. If a refactor changes either line, it changes every existing user's
  // workflow.
  const { AgentLangfuse } = require('../dist/nodes/AgentLangfuse/AgentLangfuse.node');
  const { description } = new AgentLangfuse();

  assert.equal(description.name, 'agentLangfuse');
  assert.deepEqual(description.credentials, [{ name: 'agentLangfuseApi', required: true }]);
  assert.match(String(description.inputs), /ai_languageModel[^}]*required: true/);
});

test('the decision agent is a separate node type with both credentials', () => {
  const { DecisionAgentLangfuse } = require('../dist/nodes/DecisionAgentLangfuse/DecisionAgentLangfuse.node');
  const { description } = new DecisionAgentLangfuse();

  assert.equal(description.name, 'decisionAgentLangfuse');

  // Both always present, never gated by displayOptions: a credential that
  // appears and disappears with a mode is how a node ends up half configured,
  // and displayOptions only hides in the editor, it does not clear the value.
  assert.deepEqual(description.credentials, [
    { name: 'agentLangfuseApi', required: true },
    { name: 'openRouterApi', required: true },
  ]);

  // No model sub-node: the decision model is called over HTTP, not through
  // LangChain, so the agent's connectors would be dead sockets here.
  assert.deepEqual(description.inputs, ['main']);
});
