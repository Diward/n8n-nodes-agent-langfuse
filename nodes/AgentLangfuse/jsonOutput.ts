// Parses an agent text output into a JSON object for the "Parse Output as JSON"
// toggle, so the agent structured answer becomes the item and a downstream
// Code/Set parse node is no longer needed. Cleans common wrappers (code fences,
// surrounding prose) before giving up.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripWrappers(text: string): string {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  const starts = [s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0);
  if (starts.length) {
    const start = Math.min(...starts);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (end > start) s = s.slice(start, end + 1);
  }
  return s.trim();
}

export function parseAgentJsonOutput(raw: unknown): Record<string, unknown> {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== 'string') {
    throw new Error('Agent output is not JSON text');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON.parse(stripWrappers(raw));
    } catch {
      throw new Error('Agent output is not valid JSON');
    }
  }
  if (!isPlainObject(parsed)) {
    throw new Error('Parsed output is not a JSON object');
  }
  return parsed;
}
