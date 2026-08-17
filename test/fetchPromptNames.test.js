// Runs against the compiled output: `npm run build` first (npm test does both).
// The prompt list endpoint is paginated; the dropdown used to show only the
// first page. These tests drive fetchPromptNames with a mocked global fetch.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { fetchPromptNames } = require('../dist/nodes/AgentLangfuse/langfuse');

const CREDS = { publicKey: 'pk', secretKey: 'sk', url: 'https://lf.example.com' };
const NODE = { name: 'test-node', type: 'agentLangfuse', typeVersion: 1 };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function pageResponse(items, pageNum, totalPages) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ data: items, meta: { page: pageNum, totalPages } }),
  };
}

test('merges every page and keeps only chat prompts', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const page = Number(new URL(String(url)).searchParams.get('page') ?? '1');
    if (page === 1) {
      return pageResponse(
        [{ name: 'a', type: 'chat' }, { name: 'ignored', type: 'text' }],
        1,
        2,
      );
    }
    return pageResponse([{ name: 'b', type: 'chat' }], 2, 2);
  };

  const names = await fetchPromptNames(CREDS, NODE);
  assert.deepEqual(names, [
    { name: 'a', value: 'a' },
    { name: 'b', value: 'b' },
  ]);
  assert.equal(calls.length, 2);
});

test('a single page makes a single request', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return pageResponse([{ name: 'only', type: 'chat' }], 1, 1);
  };

  const names = await fetchPromptNames(CREDS, NODE);
  assert.deepEqual(names, [{ name: 'only', value: 'only' }]);
  assert.equal(calls.length, 1);
});

test('a response without meta is treated as a single page', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [{ name: 'x', type: 'chat' }] }),
    };
  };

  const names = await fetchPromptNames(CREDS, NODE);
  assert.deepEqual(names, [{ name: 'x', value: 'x' }]);
  assert.equal(calls.length, 1);
});

test('every request carries an abort signal, so a hung server cannot block forever', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return pageResponse([], 1, 1);
  };

  await fetchPromptNames(CREDS, NODE);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].init.signal instanceof AbortSignal, 'fetch init.signal must be an AbortSignal');
});
