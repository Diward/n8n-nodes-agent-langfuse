// Runs against the compiled output: `npm run build` first (npm test does both).
// Images and PDFs were size-gated at 50 MB; text attachments were not, so an
// arbitrarily large file could be inlined into the prompt. These tests drive
// extractBinaryMessages with a fake context and no binary id (inline payload).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { extractBinaryMessages } = require('../dist/nodes/AgentLangfuse/binaryPassthrough');

const NODE = { name: 'test-node', type: 'agentLangfuse', typeVersion: 1 };

function ctxWith(binary) {
  return {
    getInputData: () => [{ binary }],
    getNode: () => NODE,
    logger: { debug: () => {} },
  };
}

test('a text attachment over the 50 MB limit is rejected', async () => {
  const oversized = Buffer.alloc(51 * 1024 * 1024, 0x41).toString('base64');
  const ctx = ctxWith({
    file: { mimeType: 'text/plain', fileName: 'big.txt', data: oversized },
  });
  await assert.rejects(
    () => extractBinaryMessages(ctx, 0, { passthroughBinaryImages: true }),
    /exceeds the 50\.0 MB limit/,
  );
});

test('a small text attachment passes through as a text block with its filename', async () => {
  const ctx = ctxWith({
    file: {
      mimeType: 'text/plain',
      fileName: 'note.txt',
      data: Buffer.from('hello world', 'utf-8').toString('base64'),
    },
  });
  const msg = await extractBinaryMessages(ctx, 0, { passthroughBinaryImages: true });
  const block = msg.content[0];
  assert.equal(block.type, 'text');
  assert.match(block.text, /File: note\.txt/);
  assert.match(block.text, /hello world/);
});
