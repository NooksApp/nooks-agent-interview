/**
 * Single-shot CLI runner: `npm run agent -- "your query"`.
 *
 * Prints tool calls, streamed text, and what the turn cost in tokens and
 * wall-clock. Useful for fast iteration — including on the cost, which you can
 * watch move as you change what the tool returns.
 */

import './env';
import { NooksClient } from './nooksClient.mock';
import { runAgentTurn } from './agent';
import {
  formatBytes,
  formatDuration,
  formatTokens,
  formatTurnMetrics,
} from './usage';

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.error('Usage: npm run agent -- "<query>"');
    process.exit(1);
  }

  const client = new NooksClient();
  const { summary } = await runAgentTurn({
    client,
    messages: [{ role: 'user', content: query }],
    onEvent: (event) => {
      if (event.type === 'text') process.stdout.write(event.delta);
      if (event.type === 'tool-call') {
        console.log(
          `\n[tool-call] ${event.toolName}(${JSON.stringify(event.input)})`,
        );
      }
      if (event.type === 'tool-result') {
        const { bytes, estTokens, durationMs } = event.metrics;
        console.log(
          `[tool-result] ${event.toolName} → ${formatBytes(bytes)} ` +
            `≈ ${formatTokens(estTokens)} tokens in ${formatDuration(durationMs)}`,
        );
      }
      if (event.type === 'error') console.error(`\n[error] ${event.message}`);
    },
  });

  console.log(
    `\n\n--- turn summary: ${summary.toolCalls.length} tool call(s), ` +
      `${summary.assistantText.length} chars of text ---`,
  );
  console.log(`--- cost: ${formatTurnMetrics(summary.metrics)} ---`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
