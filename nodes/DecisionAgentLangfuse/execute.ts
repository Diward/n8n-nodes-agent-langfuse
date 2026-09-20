import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { createObservationAttributes, getLangfuseTracerProvider } from '@langfuse/tracing';

import { withTracing, type TraceCapture } from '../shared/tracing';
import { resolveBaseUrl } from '../AgentLangfuse/langfuse';
import type { LangfuseCredentials, LangfuseMetadata } from '../AgentLangfuse/types';
import {
  decisionsEndpoint,
  flattenAnswers,
  normalizeQuestions,
  usageFromResponse,
  type DecisionAnswer,
  type DecisionUsage,
  type QuestionInput,
} from './decisions';

const TRACER_NAME = 'n8n-nodes-agent-langfuse';

interface DecisionResponse {
  model?: string;
  id?: string;
  provider?: string;
  answers?: Record<string, DecisionAnswer>;
  usage?: DecisionUsage;
}

export async function decisionAgentExecute(
  this: IExecuteFunctions,
): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const results: INodeExecutionData[] = [];

  const langfuseCreds = (await this.getCredentials(
    'agentLangfuseApi',
  )) as unknown as LangfuseCredentials;
  const routerCreds = (await this.getCredentials('openRouterApi')) as unknown as {
    url?: string;
  };
  const endpoint = decisionsEndpoint(routerCreds?.url);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    try {
      const model = this.getNodeParameter('model', itemIndex) as string;
      const state = this.getNodeParameter('state', itemIndex) as string;
      const questionInputs = this.getNodeParameter(
        'questions.question',
        itemIndex,
        [],
      ) as QuestionInput[];
      const metadata = this.getNodeParameter(
        'langfuseMetadata',
        itemIndex,
        {},
      ) as LangfuseMetadata;
      const options = this.getNodeParameter('options', itemIndex, {}) as { timeout?: number };

      const questions = normalizeQuestions(questionInputs);
      if (Object.keys(questions).length === 0) {
        throw new NodeOperationError(
          this.getNode(),
          'Add at least one question: a decision model with nothing to decide returns nothing',
          { itemIndex },
        );
      }

      const traceName = metadata.traceName || this.getNode().name;
      const capture: TraceCapture = {};

      const response = await withTracing(
        langfuseCreds,
        {
          sessionId: metadata.sessionId,
          userId: metadata.userId,
          environment: metadata.environment,
        },
        async () => {
          // The span is created inside withTracing so the RoutingSpanProcessor
          // can attribute it to this credential's project, and so the trace
          // identity lands on it as the root.
          const tracer = getLangfuseTracerProvider().getTracer(TRACER_NAME);
          const span = tracer.startSpan(traceName);

          try {
            const body = { model, state, questions };
            const raw = (await this.helpers.httpRequestWithAuthentication.call(
              this,
              'openRouterApi',
              {
                method: 'POST',
                url: endpoint,
                body,
                json: true,
                timeout: options.timeout ?? 30000,
              },
            )) as DecisionResponse;

            const { usageDetails, costDetails } = usageFromResponse(raw.usage);
            const { confidences } = flattenAnswers(raw.answers);

            span.setAttributes(
              createObservationAttributes('generation', {
                // The resolved snapshot the provider answered with, which is
                // more specific than what was asked for (a request for
                // `typesafe/jev-1.13` comes back as `jev-1.13-20260917`).
                model: raw.model ?? model,
                input: { state, questions },
                output: raw.answers,
                usageDetails,
                // Priced by whoever billed it, not by a lookup table.
                costDetails,
                metadata: {
                  provider: raw.provider,
                  generationId: raw.id,
                  // Langfuse scores do not travel over OpenTelemetry, so the
                  // calibration rides in metadata for now. Promoting it to a
                  // real score needs the scores API.
                  confidences,
                },
              }),
            );

            return raw;
          } finally {
            span.end();
          }
        },
        undefined,
        capture,
      );

      const { values, confidences } = flattenAnswers(response.answers);

      results.push({
        json: {
          ...values,
          answers: response.answers ?? {},
          confidences,
          model: response.model,
          usage: response.usage,
          langfuseTrace: capture.traceId
            ? {
                id: capture.traceId,
                url: `${resolveBaseUrl(langfuseCreds).replace(/\/+$/, '')}/trace/${capture.traceId}`,
              }
            : undefined,
        },
        pairedItem: { item: itemIndex },
      });
    } catch (error) {
      if (this.continueOnFail()) {
        results.push({
          json: { error: (error as Error).message },
          pairedItem: { item: itemIndex },
        });
        continue;
      }
      throw error;
    }
  }

  return [results];
}
