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

The whole agent is six files. These are the ones that matter, roughly in the
order worth reading them:

| File | What it is |
|---|---|
| `src/systemPrompt.ts` | Everything the model is told about who it is and what it's doing. Short. |
| `src/tools/get-account-context.ts` | The agent's only tool. Today it returns the account record and nothing else. |
| `src/agent.ts` | The loop — what the model is given for a turn, how the turn runs, and how it gets measured. |
| `src/nooksClient.mock.ts` | Read-only in-memory data layer over `fixtures/data.json`. Stands in for the Nooks API. |
| `src/types.ts` | The four record types, field by field, including sync metadata. |
| `src/usage.ts` | What the cost numbers mean — which are exact and which are estimates. |

Plus `fixtures/data.json`, which is the data itself: read it freely, it's the
only way to know what the agent *should* have said.

**Everything else is plumbing** — `src/server.ts` and `web/index.html` are the
dev server and the chat page, `src/model.ts` and `src/env.ts` are credentials.
You shouldn't need to read or change any of it, and nothing in these tickets is
hiding there.

## The three tickets

Start with ticket 1; ticket 2 builds on it. Say out loud which one you're on.
Nobody finishes all three — how you work one is worth more than half-finishing
three.

### 1. "The emails aren't context-aware"

Reps say the drafts read as though the agent has no idea what has already
happened with the customer — it misses recent calls, recent replies, and things
the prospect explicitly asked for.

That's because it doesn't know. `getAccountContext` returns the account record
and nothing else: none of the people at the account, and none of their calls or
emails. **Give the agent the context it needs to write a good email.**

The catch is size. Meridian Telecom alone has about 40 people, 70 calls and 150
emails. Returning all of it puts the biggest accounts over the model's context
window, and every token a tool returns is paid for again on every step after it
(`npm run payload` shows the sizes). Before you write code, walk us through
your design.

You're done when this query in the chat UI produces a draft that reflects what
Nadia actually asked for:

> Meridian Telecom — Nadia Kaur asked us to come back to her when their change
> freeze lifts. Draft that follow-up.

### 2. "It emailed the wrong version of her"

A rep on Meridian Telecom asked for an intro email to Marisol Vega. The draft
used a title Marisol hasn't had in a year and went to an address that bounced.
The rep says Marisol's details are right in the CRM.

> Draft Marisol Vega at Meridian an intro to the parallel-run plan for the
> mediation feed.

Find out where the wrong details came from and fix it. Assume this isn't the
only person it happens to.

### 3. "It doesn't listen to me"

Two complaints from reps, about the same underlying problem.

One rep consistently complains that the agent ends every draft with a
different call to action. They want every email to close with the same line:

> Let me know when you have 15 minutes to chat.

Other reps say the agent doesn't listen to their style feedback. They tell it
"make it shorter" or "make it more casual", and the drafts come back the way
they were.

How would you fix these?

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

- **AI tools are fair game** for all three tickets. Say when you switch them
  on, and expect to be asked what you checked in what they gave you.
- **For ticket 1, explain your design before you generate code.** We want to
  hear what context you'd give the agent and why, in your own words.
- Domain questions to your interviewer are free at any point.

## Notes

- `npm run typecheck` reports two `TS2589` "type instantiation is excessively
  deep" errors from the AI SDK's generics. Pre-existing, not yours; a bare
  `tool({…})` call reproduces it.
- You can drive the tool and the data layer from a scratch script with no
  credentials.
