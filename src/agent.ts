/**
 * The agent loop.
 *
 * One turn — one thing the rep typed, and everything the agent does about it —
 * is one call to `runAgentTurn`. It has three parts, and the file is laid out
 * in that order:
 *
 *   1. `buildTurnInput`  — assemble everything the model gets for this turn:
 *                          the system prompt, the toolset, the messages.
 *   2. `streamText`      — hand that to the model. It may call a tool, read the
 *                          result, and go round again, until it writes a final
 *                          answer or hits `MAX_STEPS`. Each round trip is a
 *                          "step", and each step re-sends the whole prompt so
 *                          far — including every tool result already in it.
 *   3. `recordPart`      — fold the streamed parts into a `TurnSummary` and
 *                          emit `AgentEvent`s, so the caller (the web server,
 *                          the CLI) can render the turn as it happens.
 *
 * Every turn is also measured: how long each tool call took, how big its result
 * was, and how many tokens the turn actually billed. Those numbers go out as
 * events (`ToolMetrics` / `TurnMetrics`, defined in `src/usage.ts`), which is
 * why the chat UI can tell you what a query cost. The measuring is passive —
 * nothing here changes what the model sees, it only counts.
 *
 * Where to make changes:
 *   - what the model is told      → `src/systemPrompt.ts`
 *   - what a tool returns         → `src/tools/get-account.ts`
 *   - a new tool                  → `src/tools/` + one line in `tools/index.ts`
 *   - anything else per-turn      → `buildTurnInput`, below
 */

import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from 'ai';
import { getModel } from './model';
import { NooksClient } from './nooksClient.mock';
import { buildSystemPrompt } from './systemPrompt';
import { createTools } from './tools';
import {
  emptyTurnMetrics,
  estimateTokens,
  type ToolMetrics,
  type TurnMetrics,
} from './usage';

/** Max model↔tool round trips in one turn. */
const MAX_STEPS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Streamed to the caller as the turn happens. */
export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: unknown;
      /** What this call cost: how long it took and how big the result is. */
      metrics: ToolMetrics;
    }
  | { type: 'error'; message: string }
  /** What the whole turn cost. Emitted once, just before `done`. */
  | { type: 'usage'; metrics: TurnMetrics }
  | { type: 'done' };

export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  state: 'output-available' | 'output-error';
  metrics: ToolMetrics;
}

/** Everything a caller needs to render, log, or measure a finished turn. */
export interface TurnSummary {
  query: string;
  toolCalls: ToolCallRecord[];
  assistantText: string;
  streamErrors: string[];
  /** Tokens and wall-clock for the turn. */
  metrics: TurnMetrics;
}

export interface RunTurnOptions {
  client: NooksClient;
  /** Full conversation so far, ending with the latest user message. */
  messages: ModelMessage[];
  onEvent?: (event: AgentEvent) => void;
}

export interface RunTurnResult {
  summary: TurnSummary;
  /** Assistant/tool messages to append to the conversation history. */
  responseMessages: ModelMessage[];
}

/** Everything the model is given for one turn. */
interface TurnInput {
  system: string;
  tools: ToolSet;
  messages: ModelMessage[];
}

// ---------------------------------------------------------------------------
// 1. Turn input — what the model knows
// ---------------------------------------------------------------------------

/**
 * Assemble the model's input for this turn. This is the single place where
 * "what does the agent know right now" is decided: three fields, nothing else
 * reaches the model.
 */
function buildTurnInput(options: RunTurnOptions): TurnInput {
  const { client, messages } = options;
  return {
    system: buildSystemPrompt(client.getWorkspace()),
    tools: createTools({ client }),
    messages,
  };
}

/**
 * Wrap every tool so we know how long it ran, keyed by `toolCallId`.
 *
 * Transparent: same inputs, same outputs, same errors. It exists so the UI can
 * report a tool's wall-clock without every tool having to time itself.
 */
function instrumentTools(
  tools: ToolSet,
  durations: Map<string, number>,
): ToolSet {
  const wrapped: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    // The casts are here for the same reason as the one in `get-account.ts`:
    // the AI SDK's tool generics do not survive being handled generically.
    const original = definition.execute as
      | ((input: unknown, options: { toolCallId: string }) => Promise<unknown>)
      | undefined;
    if (!original) {
      wrapped[name] = definition;
      continue;
    }
    wrapped[name] = {
      ...definition,
      execute: async (input: unknown, options: { toolCallId: string }) => {
        const startedAt = performance.now();
        try {
          return await original(input, options);
        } finally {
          durations.set(
            options?.toolCallId ?? name,
            performance.now() - startedAt,
          );
        }
      },
    } as ToolSet[string];
  }
  return wrapped;
}

// ---------------------------------------------------------------------------
// 2. The loop
// ---------------------------------------------------------------------------

export async function runAgentTurn(
  options: RunTurnOptions,
): Promise<RunTurnResult> {
  const input = buildTurnInput(options);

  // Everything the stream handler writes to as parts arrive.
  const turn: TurnRecorder = {
    emit: options.onEvent ?? (() => {}),
    toolDurations: new Map<string, number>(),
    summary: {
      query: extractText(lastUserMessage(options.messages)),
      toolCalls: [],
      assistantText: '',
      streamErrors: [],
      metrics: emptyTurnMetrics(),
    },
  };

  const startedAt = performance.now();

  // Runs the model, its tool calls, and any further steps, streaming as it goes.
  const result = streamText({
    model: getModel(),
    system: input.system,
    messages: input.messages,
    tools: instrumentTools(input.tools, turn.toolDurations),
    stopWhen: stepCountIs(MAX_STEPS),
  });

  // Text, tool calls and tool results, in the order the model produced them.
  for await (const part of result.fullStream) {
    recordPart(part, turn);
  }

  // Available once the stream is finished. `totalUsage` is the provider's own
  // count across every step of the turn — the exact number, not our estimate.
  const [usage, steps, response] = await Promise.all([
    result.totalUsage,
    result.steps,
    result.response,
  ]);

  turn.summary.metrics = {
    ...turn.summary.metrics,
    durationMs: performance.now() - startedAt,
    modelCalls: steps.length,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
  };

  turn.emit({ type: 'usage', metrics: turn.summary.metrics });
  turn.emit({ type: 'done' });

  return { summary: turn.summary, responseMessages: response.messages };
}

// ---------------------------------------------------------------------------
// 3. Recording the stream
// ---------------------------------------------------------------------------

/** The mutable state one turn is recorded into. */
interface TurnRecorder {
  summary: TurnSummary;
  emit: (event: AgentEvent) => void;
  /** Wall-clock per tool call, filled in by `instrumentTools`. */
  toolDurations: Map<string, number>;
}

/** Fold one stream part into the running summary and emit it to the caller. */
function recordPart(part: TextStreamPart<ToolSet>, turn: TurnRecorder): void {
  switch (part.type) {
    case 'text-delta': {
      turn.summary.assistantText += part.text;
      turn.emit({ type: 'text', delta: part.text });
      break;
    }
    case 'tool-call': {
      startToolCall(turn, part);
      break;
    }
    case 'tool-result': {
      finishToolCall(turn, part, { output: part.output });
      break;
    }
    case 'tool-error': {
      finishToolCall(turn, part, { error: String(part.error) });
      break;
    }
    case 'error': {
      const message =
        part.error instanceof Error ? part.error.message : String(part.error);
      turn.summary.streamErrors.push(message);
      turn.emit({ type: 'error', message });
      break;
    }
    default:
      // Step boundaries, reasoning parts, finish events: not recorded here.
      break;
  }
}

/** The model asked for a tool. Open a record for it; the result lands later. */
function startToolCall(
  turn: TurnRecorder,
  call: { toolCallId: string; toolName: string; input: unknown },
): void {
  turn.summary.toolCalls.push({
    toolCallId: call.toolCallId,
    toolName: call.toolName,
    input: call.input,
    output: undefined,
    state: 'output-available',
    metrics: { durationMs: 0, bytes: 0, estTokens: 0 },
  });
  turn.emit({
    type: 'tool-call',
    toolCallId: call.toolCallId,
    toolName: call.toolName,
    input: call.input,
  });
}

/**
 * The tool came back — with a result, or with an error the model will read as
 * one. Either way the model pays for what it says, so both are measured.
 */
function finishToolCall(
  turn: TurnRecorder,
  call: { toolCallId: string; toolName: string },
  outcome: { output: unknown } | { error: string },
): void {
  const failed = 'error' in outcome;
  // What the model actually receives back for this call.
  const payload = failed ? { error: outcome.error } : outcome.output;
  const metrics = measureToolResult(turn, call.toolCallId, payload);

  const record = turn.summary.toolCalls.find(
    (c) => c.toolCallId === call.toolCallId,
  );
  if (record) {
    record.output = failed ? outcome.error : outcome.output;
    record.state = failed ? 'output-error' : 'output-available';
    record.metrics = metrics;
  }

  turn.emit({
    type: 'tool-result',
    toolCallId: call.toolCallId,
    toolName: call.toolName,
    output: payload,
    metrics,
  });
}

/**
 * Size one tool result and add it to the turn's running totals.
 *
 * Measured on the serialized payload, because that is what gets pasted into the
 * next prompt — and paid for again on every step after this one.
 */
function measureToolResult(
  turn: TurnRecorder,
  toolCallId: string,
  output: unknown,
): ToolMetrics {
  const serialized = JSON.stringify(output ?? null);
  const metrics: ToolMetrics = {
    durationMs: turn.toolDurations.get(toolCallId) ?? 0,
    bytes: serialized.length,
    estTokens: estimateTokens(serialized),
  };

  const totals = turn.summary.metrics;
  totals.toolCalls += 1;
  totals.toolResultBytes += metrics.bytes;
  totals.toolResultTokens += metrics.estTokens;
  totals.toolDurationMs += metrics.durationMs;

  return metrics;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastUserMessage(messages: ModelMessage[]): ModelMessage | undefined {
  return [...messages].reverse().find((m) => m.role === 'user');
}

function extractText(message: ModelMessage | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content
    .map((part) => ('text' in part ? part.text : ''))
    .join('');
}
