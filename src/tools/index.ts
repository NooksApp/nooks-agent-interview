/**
 * The agent's toolset — one tool.
 *
 * `getAccount` returns everything the workspace knows about a company and the
 * people at it, in full. That is deliberately the whole toolset: the exercise
 * is about what the agent *writes* with that context, not about wiring up more
 * retrieval.
 *
 * Adding a capability means adding a file here and one line below.
 */

import type { ToolSet } from 'ai';
import type { ToolContext } from './types';
import { createGetAccountTool } from './get-account';

export type { ToolContext } from './types';

export function createTools(ctx: ToolContext): ToolSet {
  return {
    getAccount: createGetAccountTool(ctx),
  };
}
