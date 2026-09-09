// Runs against the compiled output: `npm run build` first (npm test does both).
//
// Guards the token breakdown. n8n builds the chat model from its own copy of
// @langchain/core, so the AIMessage that reaches this package is not an instance
// of the AIMessage this package resolves. `@langfuse/langchain` checks with
// `instanceof` before reading `usage_metadata` and, on a miss, falls back to the
// coarse `llmOutput.tokenUsage`, which carries no cache or reasoning split.
// In production that fallback ran every single time: 1153 generations over 90
// days, not one `input_cache_read` and not one `output_reasoning`.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} = require('@opentelemetry/sdk-trace-base');
const { setLangfuseTracerProvider, LangfuseOtelSpanAttributes } = require('@langfuse/tracing');
// The copy n8n runs (1.2.8) against the copy this package resolves (1.2.2).
// Aliased as a devDependency so the test reproduces the real pair instead of
// approximating it with a hand-rolled object.
const { AIMessage: ForeignAIMessage } = require('@langchain/core-foreign/messages');

const { AgentLangfuseCallbackHandler } = require('../dist/nodes/AgentLangfuse/execute');

// The detailed shape a reasoning model with prompt caching reports.
const USAGE_METADATA = {
  input_tokens: 1000,
  output_tokens: 200,
  total_tokens: 1200,
  input_token_details: { cache_read: 400 },
  output_token_details: { reasoning: 150 },
};

// What the provider also puts in llmOutput. Same totals, no split: this is the
// object the handler falls back to, and the reason the split went missing.
const COARSE_TOKEN_USAGE = { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 };

// A real AIMessage, built by the other copy: same shape and same methods,
// different class object, so `instanceof AIMessage` is false in this one.
// That is the whole bug.
function foreignMessage(usageMetadata) {
  return new ForeignAIMessage({ content: 'ok', usage_metadata: usageMetadata });
}

let exporter;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  setLangfuseTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
  );
});

async function usageOfOneGeneration(message) {
  const handler = new AgentLangfuseCallbackHandler({});
  const runId = 'run-usage-metadata';

  await handler.handleLLMStart({ lc: 1, type: 'constructor', id: ['ChatOpenAI'] }, ['hi'], runId);
  await handler.handleLLMEnd(
    { generations: [[{ text: 'ok', message }]], llmOutput: { tokenUsage: COARSE_TOKEN_USAGE } },
    runId,
  );

  const span = exporter.getFinishedSpans().at(-1);
  assert.ok(span, 'the handler ended no span');
  return JSON.parse(span.attributes[LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS]);
}

test('the cache and reasoning split survives a message from another @langchain/core copy', async () => {
  const usage = await usageOfOneGeneration(foreignMessage(USAGE_METADATA));

  assert.equal(usage.input_cache_read, 400);
  assert.equal(usage.output_reasoning, 150);
});

test('the parent buckets drop what the detail buckets already count', async () => {
  // Langfuse prices every bucket, so leaving the cached tokens inside `input`
  // as well would bill them twice. The handler subtracts them once it sees the
  // detail, which it only does when the split arrives.
  const usage = await usageOfOneGeneration(foreignMessage(USAGE_METADATA));

  assert.equal(usage.input, 600);
  assert.equal(usage.output, 50);
});

test('a message with no usage_metadata still reports the coarse totals', async () => {
  const usage = await usageOfOneGeneration(new ForeignAIMessage({ content: 'ok' }));

  assert.equal(usage.input, 1000);
  assert.equal(usage.output, 200);
  assert.equal(usage.total, 1200);
});
