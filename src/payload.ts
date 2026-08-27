/**
 * `npm run payload` — how big is what the tool hands the model?
 *
 * Calls the real toolset against the real fixtures for every account and prints
 * the size of each result. No credentials, no model call, nothing spent: this is
 * the fast loop for changing the *shape* of what the tool returns, without
 * paying for a turn to find out.
 *
 * Token counts here are the four-chars-per-token estimate from `src/usage.ts`.
 * The exact figure for a turn comes from the provider, and is shown per turn in
 * the chat UI.
 */

import { NooksClient } from './nooksClient.mock';
import { createTools } from './tools';
import { estimateTokens, formatBytes, formatTokens } from './usage';

async function main(): Promise<void> {
  const client = new NooksClient();
  const tools = createTools({ client }) as Record<
    string,
    { execute: (input: unknown, options: unknown) => Promise<unknown> }
  >;

  const rows: Array<{ name: string; bytes: number; tokens: number; parts: string }> = [];

  for (const account of client.listAccounts()) {
    const output = await tools.getAccount.execute({ account: account.id }, {});
    const json = JSON.stringify(output);
    const record = output as {
      prospects?: unknown[];
      calls?: unknown[];
      emails?: unknown[];
    };
    rows.push({
      name: account.name,
      bytes: json.length,
      tokens: estimateTokens(json),
      parts:
        `${record.prospects?.length ?? 0} prospects, ` +
        `${record.calls?.length ?? 0} calls, ` +
        `${record.emails?.length ?? 0} emails`,
    });
  }

  rows.sort((a, b) => b.tokens - a.tokens);

  const width = Math.max(...rows.map((r) => r.name.length));
  console.log('getAccount payload, per account:\n');
  for (const row of rows) {
    console.log(
      `  ${row.name.padEnd(width)}  ${formatBytes(row.bytes).padStart(9)}  ` +
        `≈ ${formatTokens(row.tokens).padStart(6)} tokens   ${row.parts}`,
    );
  }

  const total = rows.reduce((sum, r) => sum + r.tokens, 0);
  const biggest = rows[0];
  console.log(
    `\n  ${rows.length} accounts, ≈${formatTokens(total)} tokens in total. ` +
      `The largest, ${biggest.name}, is ` +
      `${(biggest.tokens / (total / rows.length)).toFixed(1)}× the average.`,
  );
  console.log(
    '\n  Remember the model pays for a tool result on every step that follows it,\n' +
      '  so a payload this size is billed more than once per turn.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
