/**
 * What a turn cost.
 *
 * Two different numbers live here and they measure different things:
 *
 *  - **Provider token usage** (`inputTokens`, `outputTokens`) is exact. It comes
 *    back from the model with every step, and it is what you are actually billed
 *    for. Note that it counts the *whole* prompt on every step, so a 30k-token
 *    tool result that the model reads and then answers from is paid for twice —
 *    once on the step that produced it, once on the step that used it.
 *
 *  - **Tool payload size** (`toolResultTokens`) is an estimate — four characters
 *    per token, no tokenizer — of how much of that prompt was tool output. It is
 *    approximate on purpose: it needs no credentials and no model call, so you
 *    can measure the shape of what you return without spending anything. Treat
 *    it as accurate to about ±10%, and use the provider numbers when the exact
 *    figure matters.
 *
 * Latency is wall-clock and therefore noisy — it moves with the gateway, the
 * model, and whatever else is on the wire. Optimise against tokens; read latency
 * as a symptom.
 */

/** Rough token count for a serialized payload. Four chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** What one tool call cost. */
export interface ToolMetrics {
  /** Wall-clock inside the tool's `execute`, ms. */
  durationMs: number;
  /** Serialized size of what the tool handed back. */
  bytes: number;
  /** Estimated tokens of that payload — see the note above. */
  estTokens: number;
}

/** What one turn cost, end to end. */
export interface TurnMetrics {
  /** Wall-clock for the whole turn, ms. */
  durationMs: number;
  /** Model round trips in this turn. Each one re-sends the whole prompt. */
  modelCalls: number;
  /** Exact input tokens billed across every step of the turn. */
  inputTokens: number;
  /** Exact output tokens billed across every step. */
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache, if any. */
  cachedInputTokens: number;
  /** Number of tool calls in the turn. */
  toolCalls: number;
  /** Serialized bytes of tool output handed to the model. */
  toolResultBytes: number;
  /** Estimated tokens of that tool output. */
  toolResultTokens: number;
  /** Wall-clock spent inside tools, ms. */
  toolDurationMs: number;
}

export function emptyTurnMetrics(): TurnMetrics {
  return {
    durationMs: 0,
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    toolCalls: 0,
    toolResultBytes: 0,
    toolResultTokens: 0,
    toolDurationMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Formatting — shared by the CLI and the chat UI's readouts
// ---------------------------------------------------------------------------

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatBytes(n: number): string {
  return n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

export function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

/** One-line cost readout for a turn. */
export function formatTurnMetrics(m: TurnMetrics): string {
  const share =
    m.inputTokens > 0
      ? ` (${Math.round((m.toolResultTokens / m.inputTokens) * 100)}% of it tool output)`
      : '';
  return (
    `${formatDuration(m.durationMs)} · ${m.modelCalls} model call(s) · ` +
    `${formatTokens(m.inputTokens)} in / ${formatTokens(m.outputTokens)} out${share}`
  );
}
