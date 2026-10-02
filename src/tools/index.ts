/**
 * The agent's toolset — one tool.
 *
 * `getAccountContext` returns the account record.
 *
 * Adding a capability means adding a file here and one line below.
 */

import type { ToolSet } from 'ai';
import type { ToolContext } from './types';
import { createGetAccountContextTool } from './get-account-context';

export type { ToolContext } from './types';

export function createTools(ctx: ToolContext): ToolSet {
  return {
    getAccountContext: createGetAccountContextTool(ctx),
  };
}
