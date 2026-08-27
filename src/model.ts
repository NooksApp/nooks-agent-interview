/**
 * Model/provider resolution.
 *
 * Preferred setup (interview): your interviewer gives you INTERVIEW_GATEWAY_URL
 * and a short-lived INTERVIEW_TOKEN. The token only works against the gateway,
 * which holds the real Anthropic credentials server-side.
 *
 * Fallback: set ANTHROPIC_API_KEY to call the Anthropic API directly with your
 * own key.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

/** The model the agent drafts with. Override with AGENT_MODEL. */
export const AGENT_MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-5';

export function getModel(modelId: string = AGENT_MODEL): LanguageModel {
  const gatewayUrl = process.env.INTERVIEW_GATEWAY_URL;
  const token = process.env.INTERVIEW_TOKEN;

  if (gatewayUrl && token) {
    return createAnthropic({
      baseURL: gatewayUrl.replace(/\/+$/, '') + '/v1',
      apiKey: token,
    })(modelId);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return createAnthropic({})(modelId);
  }

  throw new Error(
    'No LLM credentials. Copy .env.example to .env and set ' +
      'INTERVIEW_GATEWAY_URL + INTERVIEW_TOKEN (provided by your interviewer), ' +
      'or set ANTHROPIC_API_KEY to use your own key.',
  );
}
