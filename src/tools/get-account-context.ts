import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

/**
 * `getAccountContext` is the agent's only tool. Today it returns the account
 * record and nothing else: no prospects, no calls, no emails.
 */

export function createGetAccountContextTool(ctx: ToolContext) {
  return tool({
    description:
      'Look up an account by name, domain, or ID (acc_...). Returns the ' +
      'account record: industry, size, stage, and enrichment research.',
    inputSchema: z.object({
      account: z.string().describe('Account name, domain, or ID (acc_...).'),
    }),
    // The parameter type is spelled out because the AI SDK's generic inference
    // gives up on this signature (see the typecheck note in the README).
    execute: async ({ account }: { account: string }) => {
      const found = account.startsWith('acc_')
        ? ctx.client.getAccount(account)
        : ctx.client.findAccountByName(account);

      if (found === null) {
        return {
          error: `No account matches "${account}".`,
          knownAccounts: ctx.client.listAccounts().map((a) => a.name),
        };
      }
      // More than one match: say so instead of silently picking one.
      if (Array.isArray(found)) {
        return {
          error: `"${account}" matches more than one account — ask which one.`,
          matches: found.map((a) => ({
            id: a.id,
            name: a.name,
            domain: a.domain,
          })),
        };
      }

      return { account: found };
    },
  });
}
