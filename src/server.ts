/**
 * Web server for the assistant.
 *
 * POST /api/chat streams agent events over SSE using a deliberately tiny
 * protocol (see AgentEvent in agent.ts): `text`, `tool-call`, `tool-result`,
 * `error`, `done`.
 *
 * Chat sessions live in memory for the life of the process. The UI is where you
 * read a draft the way a rep would — and where each turn reports what it cost in
 * tokens and wall-clock, per tool call and per turn.
 *
 * `npm run dev` reloads on every save: `tsx watch` restarts this process when
 * anything under `src/` changes, and GET /api/live tells the open page about it
 * (see the live-reload section below), so you can edit the prompt or the tool
 * and just send the next message.
 */

import './env';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { ModelMessage } from 'ai';
import { NooksClient } from './nooksClient.mock';
import { runAgentTurn } from './agent';

const PORT = Number(process.env.PORT ?? 3100);
const WEB_DIR = path.join(__dirname, '..', 'web');

const app = express();
app.use(express.json());
// No caching: an edit to web/index.html should show up on the next reload.
app.use(express.static(WEB_DIR, { etag: false, lastModified: false, maxAge: 0 }));

const client = new NooksClient();

/** sessionId → full conversation, including tool traffic. */
const sessions = new Map<string, ModelMessage[]>();

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body as {
    sessionId?: string;
    message?: string;
  };
  if (!sessionId || !SAFE_ID.test(sessionId) || !message) {
    res.status(400).json({ error: 'sessionId and message are required' });
    return;
  }

  const history = sessions.get(sessionId) ?? [];
  history.push({ role: 'user', content: message });
  sessions.set(sessionId, history);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // The whole conversation goes back to the model, tool results included.
    const { responseMessages } = await runAgentTurn({
      client,
      messages: history,
      onEvent: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
    });
    history.push(...responseMessages);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: messageText })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  }
  res.end();
});

// ---------------------------------------------------------------------------
// Live reload
// ---------------------------------------------------------------------------

/**
 * The open page holds a long-lived SSE connection to /api/live and reacts to
 * two things:
 *
 *   - **This process restarted.** `tsx watch` does that whenever a file under
 *     `src/` changes. The browser's EventSource reconnects on its own, sees a
 *     new `bootId`, and starts a fresh chat — server-side history died with the
 *     old process, so carrying the old session id forward would silently drop
 *     the conversation the model is being sent.
 *   - **A file under `web/` changed.** That does not restart this process, so
 *     the watcher below pushes a `reload` and the page reloads itself.
 */
const BOOT_ID = randomUUID();
const liveClients = new Set<express.Response>();

app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  // Reconnect fast, so a restart costs a moment rather than the browser's
  // three-second default.
  res.write('retry: 400\n\n');
  res.write(`data: ${JSON.stringify({ type: 'hello', bootId: BOOT_ID })}\n\n`);

  liveClients.add(res);
  // Keep proxies and idle-socket timeouts from closing the channel.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    liveClients.delete(res);
  });
});

function broadcastReload(): void {
  for (const res of liveClients) {
    res.write(`data: ${JSON.stringify({ type: 'reload' })}\n\n`);
  }
}

/** Watch `web/`, debounced — editors write a file more than once per save. */
function watchWebAssets(): void {
  let pending: NodeJS.Timeout | null = null;
  try {
    fs.watch(WEB_DIR, { recursive: true }, () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(broadcastReload, 100);
    });
  } catch {
    // Not every platform supports recursive watching; live reload is a
    // convenience, so losing it must not stop the server coming up.
  }
}

app.listen(PORT, () => {
  watchWebAssets();
  // eslint-disable-next-line no-console
  console.log(`Nooks prospecting assistant → http://localhost:${PORT}`);
});
