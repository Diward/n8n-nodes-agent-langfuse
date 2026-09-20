// Runs against the compiled output: `npm run build` first (npm test does both).
//
// The decision agent talks to OpenRouter's /api/alpha/decisions, which is not a
// chat endpoint: no messages, no tools, no temperature. The shapes asserted here
// are the ones a real run returned (batch 18710), not invented:
//
//   answers.<name> = {type:'choice', choice, probabilities, confidence}
//                  | {type:'noul',   noul}          <- no confidence on noul
//   usage          = {input_tokens, output_tokens, cost}
//   model          = the resolved snapshot, e.g. 'typesafe/jev-1.13-20260917'
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  decisionsEndpoint,
  normalizeQuestions,
  usageFromResponse,
  flattenAnswers,
} = require('../dist/nodes/DecisionAgentLangfuse/decisions');

// A real response, trimmed. Keep it verbatim: inventing this shape is how the
// node ends up parsing something the API never sends.
const REAL_RESPONSE = {
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
  id: 'gen-dec-1789911974-XolJY9jiEVncZpT5PB6b',
  provider: 'TypeSafe',
};

test('the endpoint is derived from the OpenRouter credential, not hardcoded', () => {
  // n8n's openRouterApi credential carries the chat base url in a hidden field.
  // Deriving from it keeps a proxy or self-hosted gateway working.
  assert.equal(
    decisionsEndpoint('https://openrouter.ai/api/v1'),
    'https://openrouter.ai/api/alpha/decisions',
  );
  assert.equal(
    decisionsEndpoint('https://gateway.example.com/api/v1/'),
    'https://gateway.example.com/api/alpha/decisions',
  );
});

test('a missing credential url falls back to OpenRouter', () => {
  assert.equal(decisionsEndpoint(undefined), 'https://openrouter.ai/api/alpha/decisions');
});

test('the provider-reported cost becomes costDetails, not usage', () => {
  // Langfuse honours provided cost over its own price table. Putting the cost
  // in usageDetails instead would leave the observation priced by lookup, which
  // is what the four chat agents already suffer.
  const { usageDetails, costDetails } = usageFromResponse(REAL_RESPONSE.usage);

  assert.deepEqual(usageDetails, { input: 2486, output: 70, total: 2556 });
  assert.deepEqual(costDetails, { total: 0.000104412 });
});

test('usage survives a response that reports no cost', () => {
  const { usageDetails, costDetails } = usageFromResponse({ input_tokens: 10, output_tokens: 2 });

  assert.deepEqual(usageDetails, { input: 10, output: 2, total: 12 });
  assert.equal(costDetails, undefined);
});

test('answers flatten to plain values, choice by label and noul by probability', () => {
  const { values } = flattenAnswers(REAL_RESPONSE.answers);

  assert.deepEqual(values, { tipo_contenido: 'no_procesable', relevante: 0.48 });
});

test('confidence is reported only where the API sends it', () => {
  // A noul answer carries no confidence: its probability is the signal. Emitting
  // a zero or a null here would be inventing calibration the model never gave.
  const { confidences } = flattenAnswers(REAL_RESPONSE.answers);

  assert.deepEqual(confidences, { tipo_contenido: 0.7 });
});

test('a choice question keeps its criteria and a noul question has none', () => {
  const questions = normalizeQuestions([
    {
      name: 'tipo_contenido',
      type: 'choice',
      instructions: 'Que tipo de contenido trae la pagina.',
      criteria: { criterion: [{ key: 'resumible', description: 'Articulos y papers' }] },
    },
    { name: 'relevante', type: 'noul', instructions: 'Es relevante para el grupo.' },
  ]);

  assert.deepEqual(questions, {
    tipo_contenido: {
      type: 'choice',
      instructions: 'Que tipo de contenido trae la pagina.',
      criteria: { resumible: 'Articulos y papers' },
    },
    relevante: { type: 'noul', instructions: 'Es relevante para el grupo.' },
  });
});

test('a score question carries its levels as an ordered list', () => {
  const questions = normalizeQuestions([
    {
      name: 'gravedad',
      type: 'score',
      instructions: 'Como de grave es.',
      criteria: { criterion: [{ key: 'baja', description: '' }, { key: 'alta', description: '' }] },
    },
  ]);

  assert.deepEqual(questions.gravedad, {
    type: 'score',
    instructions: 'Como de grave es.',
    criteria: ['baja', 'alta'],
  });
});
