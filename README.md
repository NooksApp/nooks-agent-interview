# Nooks Email Agent

An AI agent that drafts emails for revenue teams. It runs against a mock
Nooks data layer (`fixtures/data.json`) for a fictional customer, **Vector Labs**.

It shipped, reps are using it, and three complaints have come back. **Your job is
to address them and make the agent better.**

## The data model

Vector Labs sells a data pipeline platform. The assistant in this repo is the tool
a seller for Vector Labs talks to while doing that — it reads their book of business and **drafts
emails**. 

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

Edit `.env` and set the `INTERVIEW_GATEWAY_URL` +
`INTERVIEW_TOKEN` your interviewer gave you (or your own `ANTHROPIC_API_KEY`).
`AGENT_MODEL` overrides which model drafts.

`npm run dev` picks up every save: the server restarts when you change anything
under `src/`, the open page notices and starts a fresh chat, and an edit to
`web/index.html` reloads the browser on its own. Change something, send the next
message, read the difference.

The chat UI reports what every query cost: bytes, estimated tokens and wall-clock
on each tool call, then tokens in/out, model calls and latency for the turn.

## What to read

| File | What it is |
|---|---|
| `src/systemPrompt.ts` | Everything the model is told about who it is and what it's doing. Short. |
| `src/tools/get-account.ts` | The agent's only tool: an account, the people at it, and their call and email history. |
| `src/agent.ts` | The loop — what the model is given for a turn, how the turn runs, and how it gets measured. |
| `src/nooksClient.mock.ts` | Read-only in-memory data layer over `fixtures/data.json`. Stands in for the Nooks API. |
| `src/types.ts` | The four record types, field by field, including sync metadata. |
| `src/usage.ts` | What the cost numbers mean — which are exact and which are estimates. |

Plus `fixtures/data.json`, which is the data itself: read it freely, it's the
only way to know what the agent *should* have said.

**Everything else is plumbing** — `src/server.ts` and `web/index.html` are the
dev server and the chat page, `src/model.ts` and `src/env.ts` are credentials.

## The three tickets

### 1. "The emails seem to lack context"

Several reps on large accounts say the drafts read as though the agent has no
idea what has already happened with the customer — it misses recent calls,
recent replies, and things the prospect explicitly asked for.

Reproduce it, find out why, and fix it. Start with this query in the chat UI:

> Meridian Telecom — Nadia Kaur asked us to come back to her when their change
> freeze lifts. Draft that follow-up.

### 2. "It emailed a duplicate prospect"

A rep on Meridian Telecom asked for an intro email to Marisol Vega. The draft
used a title Marisol hasn't had in a year and went to an address that bounced.
The rep says Marisol's details are right in the CRM.

> Draft Marisol Vega at Meridian an intro to the parallel-run plan for the
> mediation feed.

### 3. "It won't use my CTA"

One rep consistently complains that the agent ends every draft with a
different call to action. They want every email to close with the same line:
> Let me know when you have 15 minutes to chat.

How would you fix this?

## Ground rules

- Read anything, change anything in `src/` or `web/`.
- **Don't edit `fixtures/data.json`.** It's the workspace's data, not a config
  file. It comes from a CRM sync and is as messy as production data — handle
  bad records in code, not by cleaning up the file.
- `nooksClient.mock.ts` stands in for the Nooks API. You *may* change it, but
  call it out — in production that's another team's service, and "fix it in the
  API" is a different proposal from "fix it in our agent."
- Leave your changes in the working tree — no need to commit.

### AI tools

- **Debugging should be AI-free.** Important that you build a mental model of the codebase and understand root causes.
- **Use AI to implement fixes or solutions**
- **Feel free to ask your interviewer questions!**
