/*
 * The wire format of OpenRouter's /api/alpha/decisions, kept apart from the n8n
 * plumbing so it can be tested without a workflow.
 *
 * It is not a chat endpoint. There are no messages, no tools and no
 * temperature: the body is a `state` plus typed `questions`, and the answer is
 * a typed decision with calibrated probabilities.
 */

/** One question as the node's UI collects it. */
export interface QuestionInput {
  name: string;
  type: string;
  instructions?: string;
  criteria?: { criterion?: Array<{ key: string; description?: string }> };
}

/** One question as the API expects it. */
export interface Question {
  type: string;
  instructions?: string;
  criteria?: Record<string, string> | string[];
}

export interface DecisionUsage {
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
}

export interface DecisionAnswer {
  type: string;
  choice?: string;
  noul?: number;
  score?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
}

const DEFAULT_ORIGIN = 'https://openrouter.ai';
const DECISIONS_PATH = '/api/alpha/decisions';

/**
 * Builds the decisions endpoint from the chat base url of the credential.
 *
 * n8n's `openRouterApi` credential keeps its base url in a hidden field
 * (`https://openrouter.ai/api/v1`) that the public API refuses to write. We only
 * need the key from it, but deriving the origin from that field instead of
 * hardcoding the host keeps a proxy or a self-hosted gateway working.
 */
export function decisionsEndpoint(credentialUrl?: string): string {
  const raw = (credentialUrl ?? '').trim();
  if (!raw) return `${DEFAULT_ORIGIN}${DECISIONS_PATH}`;

  const withoutTrailingSlash = raw.replace(/\/+$/, '');
  const origin = withoutTrailingSlash.replace(/\/api\/v\d+$/, '');
  return `${origin}${DECISIONS_PATH}`;
}

/**
 * Turns the UI's collection into the `questions` object of the request body.
 *
 * `choice` names its options and describes each one, so its criteria is a map.
 * `score` is an ordered list of levels, so the descriptions are dropped and only
 * the order survives. `noul` is a yes/no and carries no criteria at all.
 */
export function normalizeQuestions(items: QuestionInput[]): Record<string, Question> {
  const questions: Record<string, Question> = {};

  for (const item of items ?? []) {
    if (!item?.name) continue;

    const question: Question = { type: item.type };
    if (item.instructions) question.instructions = item.instructions;

    const criteria = item.criteria?.criterion ?? [];
    if (criteria.length > 0) {
      question.criteria =
        item.type === 'score'
          ? criteria.map((c) => c.key)
          : Object.fromEntries(criteria.map((c) => [c.key, c.description ?? '']));
    }

    questions[item.name] = question;
  }

  return questions;
}

/**
 * Splits the API's `usage` into what Langfuse counts and what it charges.
 *
 * The cost goes to `costDetails` on purpose: Langfuse honours a provided cost
 * over its own price table, so the observation is priced by the provider that
 * billed it instead of by a lookup that can drift or miss the model entirely.
 */
export function usageFromResponse(usage: DecisionUsage | undefined): {
  usageDetails: Record<string, number>;
  costDetails?: Record<string, number>;
} {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;

  return {
    usageDetails: { input, output, total: input + output },
    costDetails: usage?.cost == null ? undefined : { total: usage.cost },
  };
}

/**
 * Flattens the answers into plain values, and collects the confidences apart.
 *
 * A `choice` answers with a label and a confidence; a `noul` answers with the
 * probability itself and **no confidence**. Filling that gap with a zero or a
 * null would invent calibration the model never reported, so the confidence map
 * only holds the questions that actually came with one.
 */
export function flattenAnswers(answers: Record<string, DecisionAnswer> | undefined): {
  values: Record<string, string | number | undefined>;
  confidences: Record<string, number>;
} {
  const values: Record<string, string | number | undefined> = {};
  const confidences: Record<string, number> = {};

  for (const [name, answer] of Object.entries(answers ?? {})) {
    values[name] = answer.choice ?? answer.noul ?? answer.score;
    if (typeof answer.confidence === 'number') confidences[name] = answer.confidence;
  }

  return { values, confidences };
}
