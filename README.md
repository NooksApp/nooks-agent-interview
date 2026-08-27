# Nooks Prospecting Assistant

An AI agent that drafts outbound email for sales reps. It runs against a mock
Nooks data layer (`fixtures/data.json`) for a fictional seller, **Vector Labs**.

It shipped, reps are using it, and three complaints have come back. **Your job is
to work them.**

No sales background is needed. Everything the domain requires is the object
graph below, and domain questions to your interviewer are free.

## The data model

Vector Labs sells a data pipeline platform. Its **SDRs** (sales development
reps) do *outbound*: pick companies worth selling to, find the right humans
inside them, call and email those humans. The assistant in this repo is the tool
an SDR talks to while doing that — it reads their book of business and **drafts
the outreach**. A human sends it, so nothing here touches a real inbox, but the
draft goes out under the rep's name.

Four records:

```
workspace              the seller — one per install ("Vector Labs")
   │
   └── account         a company we sell TO ("Northwind Analytics", acc_001)
          │            has a stage and enrichment research
          │
          └── prospect a PERSON at that account ("Maya Chen", pro_001)
                 │     has a title, contact details, a status, and
                 │     enrichment research of their own
                 │
                 ├── call   one phone attempt. Has a disposition, a written
                 │          summary, and sometimes a transcript.
                 │
                 └── email  one message in the thread — sent by the rep
                            (outbound) or from the prospect (inbound).
                            The substance is in the body.
```

| Relationship | Rule |
|---|---|
| account → prospect | one-to-many. A prospect belongs to **exactly one** account. |
| prospect → call / email | one-to-many, each pointing back with `prospectId` + `accountId`. |

The workspace is 12 accounts, 60 people, and about 240 calls and emails, all
synthetic. Reading one account end to end in `fixtures/data.json` is worth two
minutes.

## Running it

```bash
npm install
npm run dev              # http://localhost:3100 — the chat UI reps use
```

Copy `.env.example` to `.env` and set the `INTERVIEW_GATEWAY_URL` +
`INTERVIEW_TOKEN` your interviewer gave you (or your own `ANTHROPIC_API_KEY`).
`AGENT_MODEL` overrides which model drafts.

`npm run dev` picks up every save: the server restarts when you change anything
under `src/`, the open page notices and starts a fresh chat, and an edit to
`web/index.html` reloads the browser on its own. Change something, send the next
message, read the difference.

The chat UI reports what every query cost: bytes, estimated tokens and wall-clock
on each tool call, then tokens in/out, model calls and latency for the turn.

## What to read

The whole agent is six files. These are the ones that matter, roughly in the
order worth reading them:

| File | What it is |
|---|---|
| `src/systemPrompt.ts` | Everything the model is told about who it is and what it's doing. Short. |
| `src/tools/get-account.ts` | The agent's only tool: an account, the people at it, and their call and email history. |
| `src/agent.ts` | The loop — what the model is given for a turn, how the turn runs, and how it gets measured. |
| `src/nooksClient.mock.ts` | Read-only in-memory data layer over `fixtures/data.json`. Stands in for the Nooks API. |
| `src/types.ts` | The four record types, field by field. |
| `src/usage.ts` | What the cost numbers mean — which are exact and which are estimates. |

Plus `fixtures/data.json`, which is the data itself: read it freely, it's the
only way to know what the agent *should* have said.

**Everything else is plumbing** — `src/server.ts` and `web/index.html` are the
dev server and the chat page, `src/model.ts` and `src/env.ts` are credentials.
You shouldn't need to read or change any of it, and nothing in these tickets is
hiding there.

## The three tickets

Work them in whatever order you like, and say out loud which you're on. Nobody
finishes all three — how you work one is worth more than half-finishing three.

### 1. "The emails aren't context-aware"

Several reps on large accounts say the drafts read as though the agent has no
idea what has already happened with the customer — it misses recent calls,
recent replies, and things the prospect explicitly asked for.

Reproduce it, find out why, and fix it. Start with this query in the chat UI:

> Meridian Telecom — Nadia Kaur asked us to come back to her when their change
> freeze lifts. Draft that follow-up.

### 2. "The emails are too long"

A few reps say the drafts are verbose — three paragraphs where two sentences would do,
and a lot of restating things the reader already knows. They edit every draft
down before sending, which defeats the point.

### 3. "It's too expensive"

Finance ran the numbers on the pilot. Per drafted email, the agent costs too much.

Make it cheaper for the agent to generate an email. Discuss why and what potential tradeoffs you are making.

## Ground rules

- Read anything, change anything in `src/` or `web/`.
- **Don't edit `fixtures/data.json`.** It's the workspace's data, not a config
  file — the bug reports are about the agent, not about the records.
- `nooksClient.mock.ts` stands in for the Nooks API. You *may* change it, but
  call it out — in production that's another team's service, and "fix it in the
  API" is a different proposal from "fix it in our agent."
- Leave your changes in the working tree — no need to commit.

### AI tools

- **Ticket 1 is AI-free.** Finding what's wrong is you, your editor, your
  terminal, grep and this repo — no Claude, Cursor, Copilot, or equivalent. The
  point of that ticket is watching you read an agent you didn't write, and a
  coding assistant does that part for you.
- **After that, AI tools are fair game** — writing the fix for ticket 1 once
  you've found the problem, and all of tickets 2 and 3. Say when you switch them
  on, and expect to be asked what you checked in what they gave you.
- Domain questions to your interviewer are free at any point.

## Notes

- `npm run typecheck` reports two `TS2589` "type instantiation is excessively
  deep" errors from the AI SDK's generics. Pre-existing, not yours; a bare
  `tool({…})` call reproduces it.
- You can drive the tool and the data layer from a scratch script with no
  credentials.
