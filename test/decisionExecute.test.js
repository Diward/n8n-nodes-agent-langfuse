// Runs against the compiled output: `npm run build` first (npm test does both).
//
// Drives the decision agent's execute against a real HTTP server and a real
// OpenTelemetry exporter. Only n8n's execution context is faked, because n8n is
// not installable here; the request that goes on the wire and the span that
// comes out are the real ones.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { SimpleSpanProcessor, InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
const { LangfuseOtelSpanAttributes } = require('@langfuse/tracing');

const { decisionAgentExecute } = require('../dist/nodes/DecisionAgentLangfuse/execute');
const {
  resetTracingForTests,
  installTracingForTests,
} = require('../dist/nodes/shared/tracing');

// A real response from batch 18710, trimmed.
const RESPONSE = {
  model: 'typesafe/jev-1.13-20260917',
  answers: {
    tipo_contenido: {
      type: 'choice',
      choice: 'no_procesable',
      probabilities: { no_procesable: 0.8, explicable: 0, resumible: 0.2 },
      confidence: 0.7,
    },
    relevante: { type: 'noul', noul: 0.48 },
  },
  usage: { input_tokens: 2486, output_tokens: 70, cost: 0.000104412 },
  id: 'gen-dec-1789911974',
  provider: 'TypeSafe',
};

function startProvider(received) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received.push({ url: req.url, body: JSON.parse(raw || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(RESPONSE));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const PARAMS = {
  model: 'typesafe/jev-1.13',
  state: 'el texto del recurso',
  'questions.question': [
    {
      name: 'tipo_contenido',
      type: 'choice',
      instructions: 'Que tipo de contenido.',
      criteria: { criterion: [{ key: 'resumible', description: 'Articulos' }] },
    },
    { name: 'relevante', type: 'noul', instructions: 'Es relevante.' },
  ],
  langfuseMetadata: { sessionId: 'recurso-991', environment: 'dev' },
  options: {},
};

function fakeContext(origin) {
  return {
    getInputData: () => [{ json: {} }],
    getNode: () => ({ name: 'AI Agent - Selector v3' }),
    continueOnFail: () => false,
    getNodeParameter: (name, _i, fallback) => (name in PARAMS ? PARAMS[name] : fallback),
    getCredentials: async (type) =>
      type === 'agentLangfuseApi'
        ? { url: 'https://langfuse.example.com', publicKey: 'pk-test', secretKey: 'sk-test' }
        : { apiKey: 'or-key', url: `${origin}/api/v1` },
    helpers: {
      httpRequestWithAuthentication: async function (_credType, options) {
        const res = await fetch(options.url, {
          method: options.method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(options.body),
        });
        return res.json();
      },
    },
  };
}

let exporter;

beforeEach(() => {
  resetTracingForTests();
  exporter = new InMemorySpanExporter();
});

async function run() {
  const received = [];
  const server = await startProvider(received);
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  // Collect the spans instead of shipping them to a Langfuse that does not
  // exist. This has to be installed before the node runs: ensureProvider builds
  // its own on first use and setLangfuseTracerProvider is a single global, so a
  // provider swapped in afterwards loses the race.
  installTracingForTests(() => new SimpleSpanProcessor(exporter));

  const ctx = fakeContext(origin);
  let out;
  try {
    out = await decisionAgentExecute.call(ctx);
  } finally {
    server.close();
  }
  return { received, out, spans: exporter.getFinishedSpans() };
}

test('the request carries model, state and the normalized questions to the alpha path', async () => {
  const { received } = await run();

  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/api/alpha/decisions');
  assert.equal(received[0].body.model, 'typesafe/jev-1.13');
  assert.equal(received[0].body.state, 'el texto del recurso');
  assert.deepEqual(received[0].body.questions.relevante, {
    type: 'noul',
    instructions: 'Es relevante.',
  });
  assert.deepEqual(received[0].body.questions.tipo_contenido.criteria, { resumible: 'Articulos' });
});

test('the answers reach the item flattened, with the raw answers kept alongside', async () => {
  const { out } = await run();
  const item = out[0][0].json;

  assert.equal(item.tipo_contenido, 'no_procesable');
  assert.equal(item.relevante, 0.48);
  assert.equal(item.answers.tipo_contenido.probabilities.no_procesable, 0.8);
  assert.deepEqual(item.confidences, { tipo_contenido: 0.7 });
});

test('the span is a generation priced by the provider, not by a lookup table', async () => {
  const { spans } = await run();

  assert.equal(spans.length, 1, 'the node ended no span');
  const attrs = spans[0].attributes;

  assert.equal(attrs[LangfuseOtelSpanAttributes.OBSERVATION_TYPE], 'generation');
  // The resolved snapshot, not what was asked for.
  assert.equal(attrs[LangfuseOtelSpanAttributes.OBSERVATION_MODEL], 'typesafe/jev-1.13-20260917');
  assert.deepEqual(JSON.parse(attrs[LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS]), {
    input: 2486,
    output: 70,
    total: 2556,
  });
  assert.deepEqual(JSON.parse(attrs[LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS]), {
    total: 0.000104412,
  });
});

test('the span is named after the node, which is what name-matching scoring needs', async () => {
  const { spans } = await run();

  assert.equal(spans[0].name, 'AI Agent - Selector v3');
});

test('the span is emitted under the tracer name Langfuse exports under', async () => {
  // LangfuseSpanProcessor drops, in silence, any span whose instrumentation
  // scope is not LANGFUSE_TRACER_NAME (or a known LLM instrumentor, or carrying
  // gen_ai.* attributes): see isDefaultExportSpan in @langfuse/otel. Naming the
  // tracer after this package produced a node that returned a trace id and
  // sent nothing, which is the worst possible shape of this bug.
  const { LANGFUSE_TRACER_NAME } = require('@langfuse/core');
  const { spans } = await run();
  const scope = spans[0].instrumentationScope ?? spans[0].instrumentationLibrary;

  assert.equal(scope.name, LANGFUSE_TRACER_NAME);
});
