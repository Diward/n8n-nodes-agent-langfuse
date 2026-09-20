import type { INodeType, INodeTypeDescription } from 'n8n-workflow';

import { decisionAgentExecute } from './execute';

/**
 * An agent whose output is a decision, not text.
 *
 * It sits in the same slot as the chat agent of this package and traces to the
 * same Langfuse project, but it calls a decision model over HTTP: there is no
 * agent loop, no tools and no chat model sub-node, because the model does not
 * take messages and does not generate text.
 *
 * It is a separate node type and not a mode of the chat agent on purpose. A mode
 * would need `displayOptions` to hide the half that does not apply, and
 * displayOptions only hides in the editor: a value saved before the switch
 * survives and `getNodeParameter` still returns it. Two node types have no
 * conditional surface at all.
 *
 * The endpoint is OpenRouter's `/api/alpha/decisions`. The path says alpha, so
 * treat the contract as movable: pin the model and keep a fallback path in the
 * workflow.
 */
export class DecisionAgentLangfuse implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Decision Agent + Langfuse',
    name: 'decisionAgentLangfuse',
    icon: { light: 'file:icons/langfuse-light.icon.svg', dark: 'file:icons/langfuse-dark.icon.svg' },
    group: ['transform'],
    version: 1,
    description: 'Typed decisions from a decision model, traced to Langfuse with cost and latency',
    defaults: { name: 'Decision Agent + Langfuse' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'agentLangfuseApi', required: true },
      // n8n's own OpenRouter credential, reused so nobody re-enters a key that
      // is already configured. Only the API key is needed; the hidden base url
      // is read to derive the origin, never written.
      { name: 'openRouterApi', required: true },
    ],
    properties: [
      {
        displayName: 'Model',
        name: 'model',
        type: 'string',
        default: 'typesafe/jev-1.13',
        required: true,
        description:
          'Decision model to call. Pin a version: the endpoint is alpha and the moving alias can change under you.',
      },
      {
        displayName: 'State',
        name: 'state',
        type: 'string',
        typeOptions: { rows: 6 },
        default: '',
        required: true,
        description: 'The text the questions are asked about',
      },
      {
        displayName: 'Questions',
        name: 'questions',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: {},
        description: 'What to decide about the state. At least one is required.',
        options: [
          {
            name: 'question',
            displayName: 'Question',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                required: true,
                description: 'Key this answer appears under in the output',
              },
              {
                displayName: 'Type',
                name: 'type',
                type: 'options',
                default: 'noul',
                options: [
                  { name: 'Yes/No (Noul)', value: 'noul', description: 'Returns the probability of yes' },
                  { name: 'Choice', value: 'choice', description: 'Picks one of the criteria, with probabilities' },
                  { name: 'Score', value: 'score', description: 'Picks one of an ordered list of levels' },
                ],
              },
              {
                displayName: 'Instructions',
                name: 'instructions',
                type: 'string',
                typeOptions: { rows: 3 },
                default: '',
                description: 'What the model should weigh when answering',
              },
              {
                displayName: 'Criteria',
                name: 'criteria',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true, sortable: true },
                default: {},
                displayOptions: { show: { type: ['choice', 'score'] } },
                description:
                  'Options for a choice, or the ordered levels for a score. A score ignores the descriptions and keeps the order.',
                options: [
                  {
                    name: 'criterion',
                    displayName: 'Criterion',
                    values: [
                      { displayName: 'Key', name: 'key', type: 'string', default: '' },
                      { displayName: 'Description', name: 'description', type: 'string', default: '' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        displayName: 'Langfuse Metadata',
        name: 'langfuseMetadata',
        type: 'collection',
        placeholder: 'Add Metadata',
        default: {},
        options: [
          {
            displayName: 'Session ID',
            name: 'sessionId',
            type: 'string',
            default: '',
            description: 'Groups this decision with the rest of the run in Langfuse',
          },
          { displayName: 'User ID', name: 'userId', type: 'string', default: '' },
          {
            displayName: 'Environment',
            name: 'environment',
            type: 'string',
            default: '',
            description:
              'Langfuse environment for the trace (e.g. production, staging). Leave empty to use the Langfuse default.',
          },
          {
            displayName: 'Trace Name',
            name: 'traceName',
            type: 'string',
            default: '',
            description: 'Defaults to the node name. Scoring that matches traces by name depends on this.',
          },
        ],
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Timeout (Ms)',
            name: 'timeout',
            type: 'number',
            default: 30000,
            description: 'How long to wait for the decision before failing',
          },
        ],
      },
    ],
  };

  execute = decisionAgentExecute;
}
