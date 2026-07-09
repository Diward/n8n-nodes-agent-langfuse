import { BaseMessage } from '@langchain/core/messages';

// The brand `@langchain/core` 1.x stamps on every message it builds. It is a
// global registry symbol, so any two core 1.x copies recognise each other.
const MESSAGE_SYMBOL = Symbol.for('langchain.message');

/**
 * Make the messages this package builds recognisable to `@langchain/core` 1.x.
 *
 * n8n instantiates the chat model from its own LangChain copy, currently core
 * 1.x, while this package builds the conversation with core 0.3. Core 1.x guards
 * message handling with brand checks:
 *
 *   ToolMessage.isInstance(m) === m[Symbol.for('langchain.message')] === true
 *                                && 'type' in m && 'content' in m
 *                                && m.type === 'tool'
 *
 * A core 0.3 message carries neither the symbol nor `type`, so the check fails.
 * In `@langchain/openai` 1.x that silently drops `tool_call_id` from the tool
 * result, and every OpenAI compatible provider answers 400 to a `role: "tool"`
 * message without it. Tool calling was therefore broken on any recent n8n.
 *
 * Both descriptors are non enumerable, so `JSON.stringify` of a message is
 * unchanged, and `getType`, `_getType`, `toJSON` and `content` are untouched.
 * This is a stopgap. The real fix is to share a LangChain major with n8n.
 *
 * See https://github.com/Diward/n8n-nodes-agent-langfuse/issues/7
 */
export function applyLangChainV1MessageCompat(): void {
  const proto = BaseMessage.prototype as unknown as Record<PropertyKey, unknown>;

  if (!(MESSAGE_SYMBOL in proto)) {
    Object.defineProperty(proto, MESSAGE_SYMBOL, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }

  if (!('type' in proto)) {
    Object.defineProperty(proto, 'type', {
      get(this: BaseMessage): string {
        const self = this as unknown as { getType?: () => string; _getType: () => string };
        return typeof self.getType === 'function' ? self.getType() : self._getType();
      },
      enumerable: false,
      configurable: true,
    });
  }
}
