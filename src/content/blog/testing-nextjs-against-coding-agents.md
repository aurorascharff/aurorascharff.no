---
author: Aurora Scharff
pubDatetime: 2026-07-16T15:00:00Z
title: Testing Next.js Against Coding Agents
slug: testing-nextjs-against-coding-agents
featured: false
draft: true
tags:
  - Next.js 16
  - Coding Agents
  - Developer Experience
  - Cache Components
  - AI
description: More code is written by coding agents, and they trip in the same places developers do. Here is the friction-logging workflow I built to test Next.js against agents, and what it taught me about error messages, docs, and DX.
---

When a coding agent builds with Next.js, it reads the same error messages and docs I write, usually before any developer does. It takes them at face value, guesses when something is unclear, and gets stuck in the same places a developer would. So I started running agents against my own work to find those places on purpose.

In this post, I'll walk through the setup I built to test Next.js against coding agents, and what it taught me about error messages, docs, and DX.

## Table of contents

## Why Agents Make Good Test Subjects

Testing a feature with someone who has never seen it is one of the most useful things you can do in DX. They hit the confusing parts that the people who built it have learned to ignore. The catch is that you run out of fresh testers fast, because everyone is only new once. An agent starts fresh, and you can run it as often as you want.

This works because the agent doesn't remember. A developer hits a rough edge, works it out, and stops noticing it after a while. An agent starts over from scratch and hits it again. In production that's a problem, but for testing it's the point, since the friction never drops out of the logs.

It matters most for new features. On an older API the agent can fall back on training data, but that data is months out of date, so for anything new it has nothing to go on except the docs and error messages I wrote.

## What I Work On

I work on developer experience on the Next.js team at Vercel. A lot of it is the dev overlay and its error and insight system, the messages and fix cards you get when a build or a navigation goes wrong, and it runs through the docs, the codemods, and the adoption skills too. For 16.3 most of that was in service of Cache Components and [Instant Navigations](https://nextjs.org/blog/next-16-3-instant-navigations), which shipped with [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements).

All of it is about making a feature usable for whoever picks it up next, and these days that's an agent as often as a person.

## The Goal

I built this because agents were doing a bad job. Building with newer APIs like Cache Components, they weren't getting it right even though the docs were bundled in the project, and I wanted to understand what they actually did and why. At Vercel we build agents for everything, and I'd been wanting to automate my own DX work, so this felt like the thing to build.

It also became a way to test my own changes. Whenever I changed an error message or a docs page, I wanted to know whether it actually helped or whether I was shipping different red text, and I wanted to know it fast enough to matter during design instead of after merge.

The workflow that came out of it is a friction-logging skill, a Vercel Sandbox per run, models called through the AI SDK and AI Gateway, and a Slack bot plus a Next.js dashboard to drive them. I built it up one piece at a time and much later folded the whole thing into [eve](#letting-eve-own-the-plumbing). Here's what I learned along the way.

## Why Evals Weren't Enough

We already measure agents with evals, and the bundled docs work scored great on them. But an eval only tells you whether a task passed, and a task can pass while the agent guessed twice and misread an error on the way.

That was the situation I was in: good eval numbers, agents still stumbling through Cache Components. I wanted to see what happened during the task, not only how it ended.

## Logging While the Agent Works

My first attempt was to ask agents afterward what they struggled with, and it didn't work. The agent would tell me everything went fine and give a plausible reason for whatever it did, and the reason often wasn't the true one.

The run that made me drop this was one where Sonnet kept ignoring AGENTS.md and deviating from its guidance, and I couldn't tell why. Asking it directly got me plausible answers that didn't hold up, and it took asking the same question several times before I got the real reason. In that harness it had no tool to read into node_modules, which was what kept it from following the guidance. Prying one specific fact out of an agent after the fact was that hard, so the logging has to happen while it works.

## A Skill That Makes Friction Visible

Friction logging is an old practice I wasn't especially familiar with when I started: an engineer works through a task and writes down everything that confuses them along the way. That's genuinely valuable, but it's manual, and it only ever gives you the human's point of view. I wanted to automate it and get the agent's.

So I made a skill, [friction-log](https://github.com/aurorascharff/skills/tree/main/skills/friction-log), that changes how the agent behaves during a task. It logs gaps in real time instead of guessing past them, tags steps green, yellow, or red, and cites where its decisions came from, whether that's the docs, a web search, training data, or the sandbox.

What comes out is a structured markdown file rather than a loose stream of notes: a header, the prompt, a summary, a set of action items split into docs, framework, and DX or research, and the tagged log.

Here's one run's log, trimmed but kept whole so the shape is clear:

```text
# Friction Log: `cacheComponents` + `use cache` Root Layout with Cookie-Based Auth

**Model:** anthropic/claude-sonnet-4-6
**Harness:** DX Agent (Slack bot)
**Next.js version:** Next.js v16.3.0-canary.42
**Build time:** 26s (3 builds: 8.68s + 8.81s + 8.82s)

## Prompt

> Build an app with `cacheComponents` enabled where the root layout uses `'use cache'` and also checks auth by reading `cookies()`. The protected pages below should render their cached shell instantly.

## Summary

The task contains a structural contradiction: `use cache` and `cookies()` are mutually exclusive in the same scope, so the literal reading of the prompt is impossible. Two build failures were needed to discover that every async component reading `cookies()` must be wrapped in `<Suspense>` even in layouts and pages, not just leaf components.

## Action Items

### Docs
- 🔧 Add a dedicated "auth with cacheComponents" guide or prominent recipe to the `use cache` docs

### Framework
- 🔧 The build error "encountered uncached or runtime data during prerendering" should name the offending component and its missing `<Suspense>` ancestor

### DX / Research
- 🔍 Explore whether `use cache: private` on the root layout's auth function could replace the Suspense-based pattern

## Log

- 🟢 `use cache` docs include a key callout: "To use cookies or headers, read them **outside** cached scopes and pass values as arguments" [docs]
- 🔴 **First build failed on `/_not-found`**: "Next.js encountered uncached or runtime data during prerendering". The error cited `/_not-found`, but the actual problem was in `app/layout.tsx` [sandbox]
- 🔴 **Second build failed on `/dashboard`**: same error. Every async layout or page that calls `cookies()` needs its own `<Suspense>` ancestor [sandbox]
- 🟢 Build passed cleanly, all 6 routes compiled as Partial Prerenders (◐) [sandbox]
- 🟡 **Cache key per user-name creates unbounded entries**: `CachedShell` receives `userName` as a prop, so Alice's shell and Bob's shell are separate cache entries. The docs don't discuss this tradeoff. [training data]
```

This is an early run, before the error-message work in 16.3 landed. An agent hitting the same error on two builds, with the message pointing at the wrong file and no obvious fix, was a common shape then, and it's the friction that work was built to remove.

The summary and the action items are what I actually read. The action items are already sorted by where the fix belongs, so I turn the ones worth doing into tracked issues and come back to them later. The `[docs]`, `[training data]`, and `[sandbox]` tags on the log entries are there for tracing a finding back to its source.

There's also a passive companion, `friction-report`, that doesn't steer the run at all but scans the session at the end, drafts a report if it found friction, and stays silent if the run was clean. The skill is open source, and I [shared a full log](https://x.com/aurorascharff/status/2055328557480714309) when I published it.

```bash
npx skills add aurorascharff/skills/skills/friction-log
```

The excerpts in this post are trimmed pieces of logs like these. You can [see a full one in the viewer](https://agent-friction-skill.vercel.app/view#log=g:H4sIAAAAAAAC_41YzXIUyRG-z1NUiAOjkbqHBRuMYAmzAhGyMd4AbawjFMR2TXfNTKGert6qao3GJ5_8AI69E-tn8BPtE-wj-Musqp4eCQEXxPRfZX6Z-eWXeUecWF16bRrx2izEb__6RbxQl8JcKlvLjdg7Nu1GSCdaa1at3xNdUykrjmW5VOIYl0yjGu9Go8nkjbry-Qcn8KbD544mE_HNw_xBfi8rZSPtJn90D0-9kF7Rrfv37j_M7j3M7j_Gxe86XVfC6xXfuufE2HYN_ZxW6jJLtujmUjmvF5KsfSIaQ0ZVXTB-xp9olKpUtY9PPm9b-lYxXRt74VpZqum8hiWwOyvhUxYcKkajO3fE9_z_0eiZ8DhBePhWDUCg5yMAYq6k76zCM9KLpWxb1TixXqpGrJXonBJ8xBYZIZsK1-payLXUXjizUn6pmwUf_K5brQDNaPT7x4__FZPJGU5OJ7DhQjVV5k2GPznc-VH7pSiuHXEkvO1UwSfJBhHi-5Uo-ERcDx61cqFErS5VLcbAruiNLQ4Jy-Lpu86RN-pZsX8oigbhJBQKYaV2yvE39vqPV9JLUXUWngAaZRXlBX7sidPG6cXSsznhcnh3MsEdLxsvFp2uZFMqOBQhzsVLfFaYOT_pl1YBB30F-2yFbEiWienQbPya1aa8IBOs6bzap-ethq0awJt1gzOvJzDOnHXeI2M4gggtPS8RvbrOHIAsCXwAuQC0KejesF1lrduZgUniUksgJC8pGY3N-xv52mqvzgBdkY9GFE0-oEof0k7gu51uVL0RS8Akfu5krf3mCCZ47WtECDfFuED-4hE69fzpAt61z96LvafA5NkeIZPnOUVJikcwWrUCeJQXtUbyjiurLxXuzKxZO9Tqb__-j9AVvNHzjZhLXRNepakU37FKIkwdDj5gxCtTOr4h2YBWeq9sw1cQKvoEUIvVyVf5ZDbULYEhXGzueqHg7SYekIVHnJ7R0Y7MRmrQG8paY0MQBZcSijdgC5SUBVW8pCdOm7kZ7xe5OMWHL1FqHgeFpAphQnw05RaOp4ucuxlRR21MWwh3ocmwOdICGULmXcMoWmSE43rU_0TclrJZUCY1oq0l_WsNMg82LYEpcqcRqlwawpJTI-Efwz5PpIqnFYV9Mqm0Kynd5UxTxCcTKjsQCkqKnjzi76TixxtgWlN2K_hH6RgRi7lbyxmV8fXk3kf4FOO_kh71JJuNcEpaODNDhBHJFTkUPtRUNdUx4n0Y-KFDfErx_PtTwGDnYMxDYWwoyE2rRCNXwGNcEBvS56j-ihN9dYy8L_Zz8byJ0RjjrYp4xrTK7gvTII_muqmoLMVsI3C5SbgliiX_ECyq5ZyZ8XmA79SrlaMLd8QLWDrKxO8ff_kf0HxjRIKH-4FQV0DfiXk0-Ubjmorr9JPAJmJ9ZVXbJqOoVuwWoqJBsfy0QquplZtSbk0RS_wDg6YFn1gMWgTotBh2GPqZ-AE_lC9zFAUORuNAAiyZvhSIGbblN8g9X1VF72nI-XktF31C9NwrYCByAgmCLnhJv8kN07jUzvo-mvwPYe9pto_2wPiYbwguqttYtC8V4hJkwHVjKSUkn-WNQYXSSXS2K62eJXRTGLyc3bAgecUmSJeskHOAHGK2Nh36_EpeqJ16ofyipMzFOYXlPSfKx19TS9VXGZ0Q2A3fgS_4i_cik2WUpJQHTNncdMBVF0QJTCYfXG7sIkQcVeCQ6G6amk_WxyCrNqgSXd4heu7PGa-tbDPdZG7bxhg4QquuzTpLX0IVwQA8wMkcKgcpnOg20CUZ5lioERWpu5RFlLIWCQg-AqMAtIgiEGs9OkxwnNsY6Dt6wIoAgDmgPjNX70OZnVjUOWmPLYTfDUnn0uVDPiAQdYOTHCyGFURr66UG-Th45nDwOvFCIsANeyl-AM_Ijbu1R2-ZB2SYiCbv2SfkjsbJfH-34mIeJXQcsAX_ob1TEspkEHqBWKDwhSxB7o5BOgD_HcA0YEU5NUwyVEGtF0xdFGX8Gat8kffVSfQm3afZZ5vB-zGF0SzbIfiMdtKAqf0NhYO6KtH26BzyDhGCFJQV8PSa_KPsRX-coTK4a8nQr3UZ6JE6IWQ1SBn9_oBSY65tSBNHDFrG9t2i13lU4rat9-JrjmSdSVy1ypkaWvzwc83_8EbnDyLNcZLDH3ZJlj7KnJ6VOTaOpTx7qj2CWHYWJUbPYgrQ9EGo7QZ87MTGdKTMoh2JsI4pI4mjQi-j4xEe4EJUK-ENqBdATTnoN-Lwa-gwK1Qp5FhGIok7aGyMfZdJRhP4ff8D2wSuIw-5ZJeSiy-pDnyu7uXZmNph3wdJMXHeMV2xvmLXeqnWt5J9-uJCRW3PWcJ1lXJ-rmvFwn6J10ji4L_Hr0-5e4QCwQVSBLqBNYhMyyUnKXw6dhqHEhcDUUxMPThq-3pwk_mqtTo1qgf8wqxD1uLKAUEd2CsoHy4t3ByI14HECcocgwGs8al3bPW4FBcNUQuYMyQ4qQ5ScB7OQlOqJaEo2d1UcjAjZRckYRtOi2FAbtKkZXV7gxFf_ANp8lYFIZXq9K2CLZTDeAWKtY7jTq0pT45undEOYBLRbhYGsTSiYfDZnay-Ta2SRymUKhX1aqUqDVYAynAYF4FY8erlmZgWn2CSs4G8SnMYjLnJTRHwyQRyrW_GSOjxA1av0OvOpK68O8uAz1tVpfEINFES4fA3ougIIhARJvFMPYsCLwO_4cmqWwHvNxol5U1XLq9hTyuJ0eibPDh0HI4vZijfDONCwVVRfHKsf5LWEEF7X19ETCY5Iohy6jXe81cv35y9I7WV-lcF0EukykoFGfA5ETiwW5yHFMOn3o_u54FN3nHuqGpHdvcskkQMtDE11aixv05O8r0TY1-__huJcKatJeqXGOlrtSQ1W27FSY7KmelurkF6hobZbGDi2hPORKRq87kZppdmD2I8T6jkQhdftbXaSvkoLm9BPA13LDGHC6JpQVP0DlhBH8TFSKGD8oRmLxMmFGXgHe9kPZ97d0XgXr-eUXHyzSDVRJFXOele0ikQakh4UMFNsYJR7celCqOjidXInt_lYnx-GoN9N2KKSY6MLl7Fc_8KMitIZ9VdRQEq3KYpM23C0qfolSh32CKJw0QvGQOa3VTrJSppp_n9IeYruYbWTMrxL-8okEztcXQE5aPMPzMYEbroPtW1UMEHdZV_cKiWl1fe4vuqigKEdBk4cme61bdIw7Ef4I6jWHo5qavIbD2Ye4wDrKV5FFLIE5N1ZUmiIRyxFyhlb3fwoDWe--J6B2IQtKh2HOFuFjcyuwskSKIazD3E-o-xDGj5SZxIsK4AuKXOchTmjpx12oJdXX9x9ycKVvSUnqGTx_i7QXMJA0poMmO84ZQ_w2yBvKHmhEPXgla04_1iP5y4uypMwmG4LRw69TA6VcQrP_EGcdi5arNYRLhSe-ubmVU_d8r5IzHZe0uZLO5O7x6JtFhWGDMwCSlSIl_eQ06C-dtdYiv9MsxNxTkyTsnV-6IXt6j1c_4iru1sRotzLi66rK5aGoFp1vEiMgMaNWSxUzsgPIogvLDmE3qvhyZeKfaPeCVCBTXFiSz48GPv7yQMtXOAJHHwIFMlJ7IOyyThGtliQvc0pq_x8mQSHL-l2Tsa00gMDFs-vl0b1CHN7OHwvkthnt2Lgyf9VJJa9bsSJzThVHkZdMBw3552u22z2IHnT6mfR0f92qTN723mArU_q28eUTzw9zFyM2iJIDzdk7BLIo7ixSaFOklA3FnxhPjZeh6HA2nJeHNr--1wNXtwc-V6EAKSFpjDrSbP4rdsM09in4yzmOKhjjdgA7AeR0Z-o_x2qQh3rm0Tv2p7eG0cptE32y4GEbSGh9uwEtyuA0PO_XCax46t42ZituGRpF-BRtaPGof0Pknj3UXfjlAKcuD_iGA_AYIaAAA), the collapsible, severity-coded layout they come from, or paste your own at [agent-friction-skill.vercel.app](https://agent-friction-skill.vercel.app). Nothing leaves your browser, because the log travels as a URL fragment, which also makes the link shareable.

## Starting the Agent Cold

Claude Code keeps memory between sessions, which is great for real work and bad for testing, because a second run tests the framework plus whatever the agent learned last time. The friction disappears from the logs even though it's still there for real users, so for these runs I want a fresh agent with no history.

The cold starts have a side benefit too: the logs are honest in a way human ones aren't, because the agent doesn't know it's being tested and has no reason to smooth over or play up what it hit.

## A Vercel Sandbox per Run

A skill alone doesn't run code, and a cold agent needs a fresh place to work. I needed a real Next.js project with `next@canary` installed, somewhere the agent could build, edit, and run a dev server, and I was not about to spin up containers myself.

So we can give the agent a [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) per run, an ephemeral cloud machine that boots from a snapshot in a second or two, runs whatever the agent throws at it, and gets torn down at the end, with a nightly job keeping the snapshot on the latest canary. Three calls do almost everything I need, which is to create it, run a command, and read the log back.

```ts
const sandbox = await Sandbox.create({
  source: { type: "snapshot", snapshotId },
});

await sandbox.runCommand({ cmd: "pnpm", args: ["build"] });

const log = await sandbox.readFileToBuffer({
  path: "/workspace/friction-log.md",
});
```

Runs start from identical state, so two of them are comparable.

## Giving the Agent Real Tasks

The prompts are concrete tasks for the agent to do, and the friction shows up in the doing. They range from building an app to reproducing or triaging a bug from a GitHub issue, and most of mine center on Cache Components. Real ones from my runs:

- `Build a product catalog with cacheComponents where the list updates immediately after editing a product via a form, with no stale page`
- `Build a contact form with cacheComponents that validates on the server and shows inline error messages`
- `Try to reproduce vercel/next.js#95268: document.title dropped on client-side navigation with cacheComponents`
- `Triage vercel/next.js#95395: constructor as a route name crashes the dev overlay`

Runs are independent sessions with their own sandboxes, so they parallelize, and I lean on that in a few ways. I batch the same prompt several times to rule out one-offs, I group prompts into suites and run the whole set against a new canary or a PR preview, and I compare two runs to see what friction appeared or went away.

Comparing logs is what makes friction measurable, and any way of storing and comparing them would do.

## Comparing Models and Harnesses

A run is only a task in a fresh sandbox, and the log header records the model, the harness, and the Next.js version, so two runs are directly comparable. The model is a gateway string, so swapping it is a one-field change and the same task runs on a different model without anything else moving.

That makes it easy to hold the task fixed and change one thing at a time. The same prompt across a few models shows whether a rough error message trips all of them or only the weaker ones, and the same prompt in a different harness, like Claude Code, shows whether the friction is really about Next.js or about the tool reading it. It only holds up when one variable changes at a time, the model or the version but never both, otherwise the comparison stops meaning much.

## Driving It from Slack

I wired the agent up to Slack with the [chat SDK](https://chat-sdk.dev), Vercel's toolkit for building chat apps. This is where the pieces became the DX Agent, the thing I built to run all of this. A few lines turn it into a bot that listens for mentions:

```ts
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";

const chat = new Chat({
  userName: "dxagent",
  adapters: { slack: createSlackAdapter() },
  // ...
});

chat.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await handleMessage(thread, message);
});
```

I mention it with a task, and the run happens in the background as a durable [Vercel Workflow](https://vercel.com/docs/workflow), a way to run a long job so it survives restarts and retries instead of dying when a function times out. The run loop itself is a `DurableAgent` from `@workflow/ai`, which wraps an [AI SDK](https://ai-sdk.dev) model call in that workflow so it can pause for input mid-run and pick up where it left off. The model is a `provider/model` string that [AI Gateway](https://vercel.com/docs/ai-gateway) resolves, so there are no per-provider keys to juggle:

```ts
import { DurableAgent } from "@workflow/ai/agent";

const agent = new DurableAgent({
  model: "anthropic/claude-opus-4.7", // resolved by AI Gateway
  system: systemPrompt,
  tools: durableTools,
});
```

The result comes back in the thread when it's done. A few real mentions from the channel, and the card it posts back when a run finishes:

```text
@dxagent build a commerce app with Cache Components
@dxagent triage https://github.com/vercel/next.js/issues/95265
@dxagent test the dev overlay Copy prompt feature under cacheComponents

dxagent  📋 Triage: getAll() drops duplicate-named cookies (#95265)
         🔴 1 · 🟡 3 · 🟢 4 · 16.3.0-canary.69 · claude-opus-4.8 · 1m 35s
         [ View run ]  [ Browse source ]
```

## Turning the Logs into a Next.js Dashboard

By this point the runs lived in Slack threads and got hard to keep track of, so I built a Next.js dashboard around them. This is where the setup grew from a Slack bot into something with real features. A run shows its log with the severity dots and the source the agent produced next to it, and a red or yellow entry can become a tracked issue.

Suites group prompts so I can run a whole set at once, and the dashboard charts a suite's friction rate per version. When that rate drops from one canary to the next, the framework got easier to build against for whatever the suite covers. A goal ties a suite to a target, like keeping Cache Components under 20%, and shows whether it's there yet.

A run can also point at a specific branch, so I could test a PR's preview build before it merged.

The dashboard is a Next.js 16 app with Cache Components enabled, so it runs on the features it helps me test.

## Testing My 16.3 Work Before It Shipped

The error messages, Skills, and docs I worked on all shipped with [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements), and because a run can point at any branch, I could check them against a preview build before they merged. None of this was a fixed pipeline. It was a mix of automated and manual, and it was up to me what felt worth testing, but the option was always there.

Next.js publishes a preview build for PRs as an installable tarball, so a run can take a PR URL, resolve it to that tarball, and install it into the sandbox app before the agent starts. When a change felt worth checking, I could push the branch and watch how an agent reacted to it before it merged.

The nice part is being able to run this before a merge at all, and a sandbox is what makes it easy, with nothing to clean up afterward and a lot it handles that I'd otherwise get wrong myself.

### The Error Messages

With Cache Components, an await on the server is a choice, and [Instant Insights](https://nextjs.org/blog/next-16-3-instant-navigations#stream-cache-or-block) in the overlay present it as three fixes, Stream, Cache, or Block, all with a [**Copy prompt** button](https://nextjs.org/blog/next-16-3-ai-improvements#actionable-errors) and a [docs page](https://nextjs.org/docs/messages/blocking-prerender-dynamic). The same menu prints in the terminal, which is where agents actually read it:

```text
Ways to fix this:
  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] Cache the data access with `"use cache"` (does not apply to `connection()`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set `export const instant = false` to silence this error and allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
```

When I reworded one of those errors, I could point a run at the PR preview to see whether the agent picked the right fix or fell back to training data, using the same prompt and the same model before and after my change. Here's a run that went looking for the Copy prompt feature itself, from its log:

```text
## Log
- 🔴 No documentation exists for the "Copy as prompt" / Instant guidance feature.
   Grepping the bundled docs for `copy prompt` or `clipboard` returns nothing  [docs]
- 🟡 The fix-card docs anchors are runtime-only: the cards link to
   blocking-prerender-dynamic#... anchors with no entry point from the docs  [sandbox]
- 🟢 The overlay renders one "Copy as prompt" button per fix card, so the copied
   prompt is scoped to the specific fix the developer chose, not a generic dump  [sandbox]
```

The green line is the feature working. The problem is that it's undocumented, so an agent grepping for the Copy prompt affordance finds nothing, even though the affordance itself is good.

Runs like this shaped the details that shipped. Both docs findings became PRs. [#94564](https://github.com/vercel/next.js/pull/94564) moved the Insight error pages into canary so the sandbox app installs them offline and their links resolve, something only an agent stuck in a sandbox would notice was missing, and [#95193](https://github.com/vercel/next.js/pull/95193) restructured those pages to orient the reader and point at the new 16.3 guides. On the overlay side, I restructured the Copy prompt body into a step-by-step checklist ([#95186](https://github.com/vercel/next.js/pull/95186)) and dropped the fix cards that didn't apply to the failing code ([#94926](https://github.com/vercel/next.js/pull/94926)).

![The dev overlay Instant Insights panel with the Stream, Cache, and Block fix cards and a Copy prompt button](@assets/dev-overlay-insights.avif)

### The Skills

I checked the [first-party Skills](https://nextjs.org/blog/next-16-3-ai-improvements#first-party-skills) the same way, with isolated runs end to end against their PR previews, plus trying the same tasks myself in my own agent to feel the experience. Here's a run following the Cache Components adoption skill:

```text
## Log
- 🟢 The skill is well structured, and sequences the work into Milestone A
   (a green build) and Milestone B (removing the opt-outs top-down)
- 🟡 The GitHub blob URL truncated the middle of SKILL.md, the most operationally
   important steps, so I re-fetched the raw URL to get the full text  [url]
- 🔴 First build failed on /_not-found even with `instant = false` on every segment:
   the blanket opt-out clears validation but not synchronous-IO reads, and the
   root layout renders a `new Date()` in the footer  [sandbox]
- 🟢 Milestone A green: /, /_not-found, and /products/[id] now print
   ◐ (Partial Prerender); /dashboard stays ƒ (Dynamic)  [sandbox]
```

The green lines mean the skill's sequencing works as written. The red one caught a real gotcha. The blanket opt-out the codemod applies clears validation but not synchronous-IO reads, so a `new Date()` in the root layout footer still failed `/_not-found` even after opting out. Watching agents hit edges like this is what fed into the [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) skill.

### The Docs

I wrote a [Building guide](https://preview.nextjs.org/docs/app/guides/building) that walks through `next build` under Cache Components: you build a product page, hit the `blocking-prerender-dynamic` error, and the guide shows the terminal output step by step, copy-pasted transcripts included. Copy-pasted output goes stale, so before it shipped I had an agent run the guide end to end against the PR's own preview build and check its quoted transcripts against what the binary actually printed. It flagged three:

```text
## Log
- 🟡 Error text drift: the guide quotes "Next.js encountered uncached data during
  prerendering", but the binary now prints "encountered uncached or runtime data
  during prerendering", and the fix list changed too  [sandbox]
- 🟡 The --debug-prerender stack trace is off by one line: the guide points the
  arrow at `const product = await db.product.find(id)`, the binary points it one
  line up, at `const { id } = await props.params`  [sandbox]
- 🟡 Two links to /docs/app/guides/instant-navigation 404 on the live docs site,
  even though the PR's link-checker bot reported all links fixed  [sandbox]
```

The off-by-one is the kind of thing I would never catch by rereading. The guide showed the error pointing at the database lookup:

```text
> 5 |   const product = await db.product.find(id)
    |                   ^
```

while the branch actually printed it one line up, because `params` had become a runtime API:

```text
> 4 |   const { id } = await props.params;
    |                              ^
```

Rereading a docs PR catches unclear writing. It doesn't catch a transcript that has drifted from what the binary prints, and running an agent through the guide does.

### Smaller Findings Along the Way

Agents would sometimes flag small things they weren't asked to look for, the kind I'd never have filed on their own. Running real tasks turns up more than you set out to find, and a few were worth a PR:

| Friction | Fix |
| --- | --- |
| 🟡 No build output confirming `partialPrefetching` is active | [#95593](https://github.com/vercel/next.js/pull/95593) logs "Partial Prefetching enabled" during `next build` |
| 🔴 First build failed on `/_not-found`: "uncached or runtime data during prerendering" | [#95163](https://github.com/vercel/next.js/pull/95163) clarifies `/_not-found` failures under Cache Components |
| 🟡 `partialPrefetching` is a separate required flag, not co-located in `cacheComponents.md` | [#94818](https://github.com/vercel/next.js/pull/94818) tightens the Partial Prefetching API references |

When a fix felt worth re-checking, I could run the same prompt against its preview build to confirm the friction was gone before it merged.

## Letting eve Own the Plumbing

The first version used Vercel Workflow for durable runs, the AI SDK with AI Gateway for the model, the chat SDK for Slack, and Redis and Blob for storage, with a sentinel string for human-in-the-loop.

I was already running the loop regularly by the time [eve](https://eve.dev), Vercel's framework for durable agents, came out, and migrating to it deleted around 1,900 lines of my code for the same surface: the same dashboard, the same Slack bot, the same loop. The whole `workflows/` package of durable-run orchestration, including the `DurableAgent` run loop from the Slack section, collapsed into eve's session loop.

Slack shows the change most clearly. The first version used the chat SDK with a `slack-manifest.json` checked into the repo, its scopes and event subscriptions maintained by hand, and pattern-matched thread replies faking human-in-the-loop, because questions came back as free text I had to answer in prose. All it could really do was start a run and report back.

On eve the whole channel is one file, `ask_question` renders as real buttons and resumes with structured input, and Vercel Connect provisioned the new Slack app in one CLI call instead of the api.slack.com walkthrough, with no manifest in the repo anymore.

The pieces are all still there, they moved into eve's file structure, and now the framework owns the sessions, the sandbox lifecycle, the channels, and the scheduling:

```text
agent/
  agent.ts          the model, routed through AI Gateway
  instructions.md   how the agent behaves
  tools/            sandbox_build, save_friction_run, ...
  skills/           friction-log/SKILL.md
  channels/         slack.ts, eve.ts
  sandbox/          sandbox.ts, the Vercel Sandbox backend
  schedules/        snapshot.ts, the nightly canary check
  hooks/            active-runs.ts
```

The sandbox definition that follows canary looks like this:

```ts
// agent/sandbox/sandbox.ts
export default defineSandbox({
  backend: vercel({ resources: { vcpus: 4 } }),
  revalidationKey: () => `next-canary:${currentVersion}`,
  bootstrap: async ({ use }) => {
    const sandbox = await use();
    await sandbox.run({ command: "npx create-next-app@canary base-app" });
  },
});
```

The migration changed the agent's role too. Before, it was something the workflow kicked off once per run, with no way to coordinate the runs or even see the others. On eve it became the orchestrator of all of them, with past runs indexed, so it can answer questions about older ones and act like one continuous assistant instead of a series of one-shot triggers.

That opened up things the first version had no way to do, because it only knew about the run in front of it:

```text
@dxagent how did this run do compared to the one without partialPrefetching?
@dxagent did the Cache Components suite improve on the latest canary?
@dxagent how many runs hit the blocking-prerender error this week?
@dxagent are we close to Cache Components being ready for default?
@dxagent favorite this run
```

Runs also got faster, and the suite runs that used to die halfway with no error now finish, a bug I'd sunk real time into and never fixed. The framework your agent runs on is a DX surface too, and I didn't notice until I replaced mine.

## Anyone Can Build This

The skill and the viewer are open source, and nothing else in the setup is specific to Next.js. You can give a fresh agent a real task in a clean sandbox, have it log where it gets stuck, and read the parts you'd otherwise skim.

The friction it hits is the friction your users hit, so what you fix for the agent you fix for the person too. It won't catch regressions on its own, that's what evals are for, but they go well together: the eval tells you the task still passes, the friction log tells you how rough getting there was.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
