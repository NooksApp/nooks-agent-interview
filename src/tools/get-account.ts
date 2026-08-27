import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';

/**
 * `getAccount` is the agent's only tool: one call, everything the workspace
 * knows about a company and the people at it — the account, the prospects with
 * their research notes, the calls with their summaries and transcripts, and the
 * emails with their bodies.
 *
 * Each collection is capped at `PAGE_SIZE` records per lookup. Enterprise
 * accounts carry hundreds of activities and returning all of them put the
 * biggest accounts in the book over the model's context window, so the tool
 * returns a page of each instead.
 */

/** How many records of each kind one lookup returns. */
const PAGE_SIZE = 5;

export function createGetAccountTool(ctx: ToolContext) {
  return tool({
    description:
      'Look up an account by name, domain, or ID (acc_...). Returns the ' +
      'complete account record, every prospect at the account with their full ' +
      'research notes, and the complete call and email history including call ' +
      'summaries, transcripts, and email bodies.',
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

      return {
        account: found,
        prospects: ctx.client.listProspects(found.id).slice(0, PAGE_SIZE),
        calls: ctx.client.listCalls(found.id).slice(0, PAGE_SIZE),
        emails: ctx.client.listEmails(found.id).slice(0, PAGE_SIZE),
      };
    },
  });
}
