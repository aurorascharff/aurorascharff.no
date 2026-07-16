---
author: Aurora Scharff
pubDatetime: 2026-07-16T15:00:00Z
title: What I Learned Testing Next.js Against Coding Agents
slug: what-i-learned-testing-nextjs-against-coding-agents
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

More and more code is written by coding agents, and a lot of the time an agent is the one reading the error message before any developer does. Agents read the docs, parse the errors, and make decisions based on what they see, so where a developer hits something unclear and opens Discord, an agent guesses and moves on, tripping in the same places a developer would.

The difference is that a developer adjusts and remembers: hit the same rough edge a few times and you learn to route around it, until you barely notice it's there. An agent carries nothing from one run to the next, so it walks into the same wall every time. In production that's a problem, but it's what makes an agent a good way to test the framework, because the friction stays visible instead of getting smoothed over by experience.

This gets sharper with new features. For an API that's been around a while, the agent has training data to fall back on, but that data is frozen months in the past, so for anything recent it's no help and the agent is down to the docs and the error text in front of it. With a new feature, the docs and the error messages are the whole game.

## Table of contents

## What I Work On

I work on developer experience on the Next.js team at Vercel, which means a lot of docs work generally, and for 16.3 it has mostly meant Cache Components and [Instant Navigations](https://nextjs.org/blog/next-16-3-instant-navigations): the dev overlay, the error pages, the docs, the codemods, and the adoption skills that shipped with [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements).

All of them come down to the same thing, making a feature usable for whoever reaches for it next, and lately that's an agent about as often as a person.

## The Goal

I built this because agents were doing a bad job. Building with newer APIs like Cache Components, they weren't getting it right even though the docs were bundled in the project, and I wanted to understand what they actually did and why. At Vercel we build agents for everything, and I'd been wanting to automate my own DX work, so this felt like the thing to build.

It also became a way to test my own changes. Whenever I changed an error message or a docs page, I wanted to know whether it actually helped or whether I was just shipping different red text, and I wanted to know it fast enough to matter during design instead of after merge.

The workflow that came out of it is a friction-logging skill, a Vercel Sandbox per run, models called through the AI SDK and AI Gateway, and a Slack bot plus a Next.js dashboard to drive them. I built it up one piece at a time and much later folded the whole thing into [eve](#letting-eve-own-the-plumbing). Here's what I learned along the way.

## Evals Tell You the Destination, Not the Path

We already measure agents with evals, and the bundled docs work scored great on them. But an eval only tells you whether a task passed, and a task can pass while the agent guessed twice and misread an error on the way.

That was exactly the situation I was looking at, good eval numbers while the agents kept stumbling through Cache Components, so what I really wanted was to see what happened during the task rather than just how it ended.

## Logging During the Task, Not After

My first attempt was to ask agents afterward what they struggled with, and it didn't work. The agent would tell me everything went fine, invent a plausible reason for what it did, and the three round trips it spent finding a config key never made it into the summary.

In one run a server-action call failed because the action id in the build manifest had changed, and the agent re-fetched the page, retried, and moved on. It took three tool calls, it would never have mentioned them afterward, and it's exactly the kind of detour that costs a developer twenty minutes. The logging has to happen while the agent works, so that the detours end up on paper.

## A Skill That Makes Friction Visible

Friction logging is an old practice I wasn't especially familiar with when I started: an engineer works through a task and writes down everything that confuses them along the way. That's genuinely valuable, but it's manual, and it only ever gives you the human's point of view. I wanted to automate it and get the agent's.

So I made a skill, [friction-log](https://github.com/aurorascharff/skills/tree/main/skills/friction-log), that changes how the agent behaves during a task. It logs gaps in real time instead of guessing past them, tags each step green, yellow, or red, and cites where its decisions came from, whether that's the docs, a web search, training data, or the sandbox.

What comes out is a structured markdown file rather than a loose stream of notes. It has a header, the prompt, a tool timeline, a summary, the tagged log itself, and a set of action items split by where the fix belongs: 🔧 for docs and framework changes, 🔍 for DX and research questions, and 🔁 for feedback on the skills themselves. Those action items are what I take back to the framework.

Here's one run's log, trimmed but kept whole so the shape is clear:

```text
# Friction Log: cacheComponents + use cache Root Layout with Cookie-Based Auth

Model:      claude-sonnet-4-6
Harness:    Claude Code
Next.js:    16.3.0-canary.42
Build time: 26s (3 builds)

## Prompt
> Build an app with cacheComponents enabled where the root layout uses
> 'use cache' and also checks auth by reading cookies(). The protected pages
> should render their cached shell instantly.

## Summary
use cache and cookies() are mutually exclusive in the same scope, so the
literal prompt is impossible. It took two build failures to discover that every
async component reading cookies() must be wrapped in <Suspense>, even in
layouts — a constraint the error message and docs don't make clear.

## Log
🟢 use cache docs include a key callout: read cookies or headers outside cached
   scopes and pass the values as arguments  [docs]
🔴 First build failed on /_not-found: "encountered uncached or runtime data
   during prerendering" — the real cause was app/layout.tsx  [sandbox]
🔴 Second build failed on /dashboard: same error, now app/dashboard/layout.tsx  [sandbox]
🟢 Build passed: all 6 routes compiled as Partial Prerenders (◐)  [sandbox]
🟡 Cache key per user name creates unbounded entries; the docs don't discuss
   this tradeoff  [training data]

## Action Items
🔧 docs      add an "auth with cacheComponents" recipe (Suspense + dynamic guard)
🔧 fix       the prerender error should name the offending component and its
             missing <Suspense>, not just the route
🔍 research  could `use cache: private` on the auth check replace the pattern?
```

The source tags are the part I read first, because a finding tagged `[training data]` tells me the agent leaned on its own memory instead of the bundled docs, which is a very different fix than a `[docs]` gap or a `[sandbox]` build failure.

There's also a passive companion, `friction-report`, that doesn't steer the run at all but scans the session at the end, drafts a report if it found friction, and stays silent if the run was clean. The skill is open source, and I [shared a full log](https://x.com/aurorascharff/status/2055328557480714309) when I published it.

```bash
npx skills add aurorascharff/skills/skills/friction-log
```

The excerpts in this post are trimmed pieces of logs like these. You can [see a full one in the viewer](https://agent-friction-skill.vercel.app/view#log=g:H4sIAAAAAAAC_41YzXIUyRG-z1NUiAOjkbqHBRuMYAmzAhGyMd4AbawjFMR2TXfNTKGert6qao3GJ5_8AI69E-tn8BPtE-wj-Musqp4eCQEXxPRfZX6Z-eWXeUecWF16bRrx2izEb__6RbxQl8JcKlvLjdg7Nu1GSCdaa1at3xNdUykrjmW5VOIYl0yjGu9Go8nkjbry-Qcn8KbD544mE_HNw_xBfi8rZSPtJn90D0-9kF7Rrfv37j_M7j3M7j_Gxe86XVfC6xXfuufE2HYN_ZxW6jJLtujmUjmvF5KsfSIaQ0ZVXTB-xp9olKpUtY9PPm9b-lYxXRt74VpZqum8hiWwOyvhUxYcKkajO3fE9_z_0eiZ8DhBePhWDUCg5yMAYq6k76zCM9KLpWxb1TixXqpGrJXonBJ8xBYZIZsK1-payLXUXjizUn6pmwUf_K5brQDNaPT7x4__FZPJGU5OJ7DhQjVV5k2GPznc-VH7pSiuHXEkvO1UwSfJBhHi-5Uo-ERcDx61cqFErS5VLcbAruiNLQ4Jy-Lpu86RN-pZsX8oigbhJBQKYaV2yvE39vqPV9JLUXUWngAaZRXlBX7sidPG6cXSsznhcnh3MsEdLxsvFp2uZFMqOBQhzsVLfFaYOT_pl1YBB30F-2yFbEiWienQbPya1aa8IBOs6bzap-ethq0awJt1gzOvJzDOnHXeI2M4gggtPS8RvbrOHIAsCXwAuQC0KejesF1lrduZgUniUksgJC8pGY3N-xv52mqvzgBdkY9GFE0-oEof0k7gu51uVL0RS8Akfu5krf3mCCZ47WtECDfFuED-4hE69fzpAt61z96LvafA5NkeIZPnOUVJikcwWrUCeJQXtUbyjiurLxXuzKxZO9Tqb__-j9AVvNHzjZhLXRNepakU37FKIkwdDj5gxCtTOr4h2YBWeq9sw1cQKvoEUIvVyVf5ZDbULYEhXGzueqHg7SYekIVHnJ7R0Y7MRmrQG8paY0MQBZcSijdgC5SUBVW8pCdOm7kZ7xe5OMWHL1FqHgeFpAphQnw05RaOp4ucuxlRR21MWwh3ocmwOdICGULmXcMoWmSE43rU_0TclrJZUCY1oq0l_WsNMg82LYEpcqcRqlwawpJTI-Efwz5PpIqnFYV9Mqm0Kynd5UxTxCcTKjsQCkqKnjzi76TixxtgWlN2K_hH6RgRi7lbyxmV8fXk3kf4FOO_kh71JJuNcEpaODNDhBHJFTkUPtRUNdUx4n0Y-KFDfErx_PtTwGDnYMxDYWwoyE2rRCNXwGNcEBvS56j-ihN9dYy8L_Zz8byJ0RjjrYp4xrTK7gvTII_muqmoLMVsI3C5SbgliiX_ECyq5ZyZ8XmA79SrlaMLd8QLWDrKxO8ff_kf0HxjRIKH-4FQV0DfiXk0-Ubjmorr9JPAJmJ9ZVXbJqOoVuwWoqJBsfy0QquplZtSbk0RS_wDg6YFn1gMWgTotBh2GPqZ-AE_lC9zFAUORuNAAiyZvhSIGbblN8g9X1VF72nI-XktF31C9NwrYCByAgmCLnhJv8kN07jUzvo-mvwPYe9pto_2wPiYbwguqttYtC8V4hJkwHVjKSUkn-WNQYXSSXS2K62eJXRTGLyc3bAgecUmSJeskHOAHGK2Nh36_EpeqJ16ofyipMzFOYXlPSfKx19TS9VXGZ0Q2A3fgS_4i_cik2WUpJQHTNncdMBVF0QJTCYfXG7sIkQcVeCQ6G6amk_WxyCrNqgSXd4heu7PGa-tbDPdZG7bxhg4QquuzTpLX0IVwQA8wMkcKgcpnOg20CUZ5lioERWpu5RFlLIWCQg-AqMAtIgiEGs9OkxwnNsY6Dt6wIoAgDmgPjNX70OZnVjUOWmPLYTfDUnn0uVDPiAQdYOTHCyGFURr66UG-Th45nDwOvFCIsANeyl-AM_Ijbu1R2-ZB2SYiCbv2SfkjsbJfH-34mIeJXQcsAX_ob1TEspkEHqBWKDwhSxB7o5BOgD_HcA0YEU5NUwyVEGtF0xdFGX8Gat8kffVSfQm3afZZ5vB-zGF0SzbIfiMdtKAqf0NhYO6KtH26BzyDhGCFJQV8PSa_KPsRX-coTK4a8nQr3UZ6JE6IWQ1SBn9_oBSY65tSBNHDFrG9t2i13lU4rat9-JrjmSdSVy1ypkaWvzwc83_8EbnDyLNcZLDH3ZJlj7KnJ6VOTaOpTx7qj2CWHYWJUbPYgrQ9EGo7QZ87MTGdKTMoh2JsI4pI4mjQi-j4xEe4EJUK-ENqBdATTnoN-Lwa-gwK1Qp5FhGIok7aGyMfZdJRhP4ff8D2wSuIw-5ZJeSiy-pDnyu7uXZmNph3wdJMXHeMV2xvmLXeqnWt5J9-uJCRW3PWcJ1lXJ-rmvFwn6J10ji4L_Hr0-5e4QCwQVSBLqBNYhMyyUnKXw6dhqHEhcDUUxMPThq-3pwk_mqtTo1qgf8wqxD1uLKAUEd2CsoHy4t3ByI14HECcocgwGs8al3bPW4FBcNUQuYMyQ4qQ5ScB7OQlOqJaEo2d1UcjAjZRckYRtOi2FAbtKkZXV7gxFf_ANp8lYFIZXq9K2CLZTDeAWKtY7jTq0pT45undEOYBLRbhYGsTSiYfDZnay-Ta2SRymUKhX1aqUqDVYAynAYF4FY8erlmZgWn2CSs4G8SnMYjLnJTRHwyQRyrW_GSOjxA1av0OvOpK68O8uAz1tVpfEINFES4fA3ougIIhARJvFMPYsCLwO_4cmqWwHvNxol5U1XLq9hTyuJ0eibPDh0HI4vZijfDONCwVVRfHKsf5LWEEF7X19ETCY5Iohy6jXe81cv35y9I7WV-lcF0EukykoFGfA5ETiwW5yHFMOn3o_u54FN3nHuqGpHdvcskkQMtDE11aixv05O8r0TY1-__huJcKatJeqXGOlrtSQ1W27FSY7KmelurkF6hobZbGDi2hPORKRq87kZppdmD2I8T6jkQhdftbXaSvkoLm9BPA13LDGHC6JpQVP0DlhBH8TFSKGD8oRmLxMmFGXgHe9kPZ97d0XgXr-eUXHyzSDVRJFXOele0ikQakh4UMFNsYJR7celCqOjidXInt_lYnx-GoN9N2KKSY6MLl7Fc_8KMitIZ9VdRQEq3KYpM23C0qfolSh32CKJw0QvGQOa3VTrJSppp_n9IeYruYbWTMrxL-8okEztcXQE5aPMPzMYEbroPtW1UMEHdZV_cKiWl1fe4vuqigKEdBk4cme61bdIw7Ef4I6jWHo5qavIbD2Ye4wDrKV5FFLIE5N1ZUmiIRyxFyhlb3fwoDWe--J6B2IQtKh2HOFuFjcyuwskSKIazD3E-o-xDGj5SZxIsK4AuKXOchTmjpx12oJdXX9x9ycKVvSUnqGTx_i7QXMJA0poMmO84ZQ_w2yBvKHmhEPXgla04_1iP5y4uypMwmG4LRw69TA6VcQrP_EGcdi5arNYRLhSe-ubmVU_d8r5IzHZe0uZLO5O7x6JtFhWGDMwCSlSIl_eQ06C-dtdYiv9MsxNxTkyTsnV-6IXt6j1c_4iru1sRotzLi66rK5aGoFp1vEiMgMaNWSxUzsgPIogvLDmE3qvhyZeKfaPeCVCBTXFiSz48GPv7yQMtXOAJHHwIFMlJ7IOyyThGtliQvc0pq_x8mQSHL-l2Tsa00gMDFs-vl0b1CHN7OHwvkthnt2Lgyf9VJJa9bsSJzThVHkZdMBw3552u22z2IHnT6mfR0f92qTN723mArU_q28eUTzw9zFyM2iJIDzdk7BLIo7ixSaFOklA3FnxhPjZeh6HA2nJeHNr--1wNXtwc-V6EAKSFpjDrSbP4rdsM09in4yzmOKhjjdgA7AeR0Z-o_x2qQh3rm0Tv2p7eG0cptE32y4GEbSGh9uwEtyuA0PO_XCax46t42ZituGRpF-BRtaPGof0Pknj3UXfjlAKcuD_iGA_AYIaAAA), the collapsible, severity-coded layout they come from, or paste your own at [agent-friction-skill.vercel.app](https://agent-friction-skill.vercel.app). Nothing leaves your browser, because the log travels as a URL fragment, which also makes the link shareable.

## Starting the Agent Cold

Claude Code keeps memory between sessions, which is great for real work and bad for testing, because a second run tests the framework plus whatever the agent learned last time. The friction quietly disappears from the logs while it's still there for real users, so what I want for these runs is a fresh agent with no history.

The cold starts have a side benefit: the logs end up honest in a way human friction logs aren't. Developers remember and forget what they struggle with, whereas the agent doesn't know what I'm testing for and doesn't self-censor, and it can be reset to run the same task from scratch as many times as needed.

## A Vercel Sandbox per Run

A skill alone doesn't run code, and a cold agent needs a fresh place to work. I needed a real Next.js project with `next@canary` installed, somewhere the agent could build, edit, and run a dev server, and I was not about to spin up containers myself.

So the agent gets a [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) per run, an ephemeral cloud machine that boots from a snapshot in a second or two, runs whatever the agent throws at it, and gets torn down at the end, with a nightly job keeping the snapshot on the latest canary. Three calls do almost everything I need, which is to create it, run a command, and read the log back.

```ts
const sandbox = await Sandbox.create({
  source: { type: "snapshot", snapshotId },
});

await sandbox.runCommand({ cmd: "pnpm", args: ["build"] });

const log = await sandbox.readFileToBuffer({
  path: "/workspace/friction-log.md",
});
```

Because every run starts from identical state, two of them are actually comparable.

## Giving the Agent Real Tasks

A prompt is a concrete task to build, not a question about the framework, because friction emerges from the attempt rather than from asking the agent what it thinks. The tasks range from building to investigating to reproducing a crash from a GitHub issue, and here are some real ones from my runs:

- `build a product catalog with 'use cache' and cache tag invalidation`
- `build an e-commerce app with Link prefetch={true}, then adopt Partial Prefetching`
- `do module-level values leak into 'use cache' keys?`
- `triage #95395: constructor as a route name throws in the dev overlay`

Runs are independent sessions with their own sandboxes, so they parallelize, and I lean on that in a few ways. I batch the same prompt several times to rule out one-offs, I group prompts into suites and run the whole set against a new canary or a PR preview, and I compare two runs to see what friction appeared or went away.

Comparing logs is what makes friction measurable, and any way of storing and comparing them would do.

## Comparing Models and Harnesses

A run is only a task in a fresh sandbox, and every log header already records the model, the harness, and the Next.js version, so two runs are directly comparable. The model is just a gateway string, so swapping it is a one-field change and the same task runs on a different model without anything else moving.

That makes it easy to hold the task fixed and change one thing at a time. The same prompt across a few models shows whether a rough error message trips all of them or only the weaker ones, and the same prompt in a different harness, Claude Code instead of the DX Agent, shows whether the friction is really about Next.js or about the tool reading it. It only holds up when one variable changes at a time, the model or the version but never both, otherwise the comparison stops meaning much.

## Driving It from Slack

I wired the agent up to Slack with the [chat SDK](https://chat-sdk.dev), Vercel's toolkit for building chat apps. A few lines turn the agent into a bot that listens for mentions:

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

I mention it with a task, and the run happens in the background as a durable [Vercel Workflow](https://vercel.com/docs/workflow), a way to run a long job so it survives restarts and retries instead of dying when a function times out. The run loop itself is a `DurableAgent` from `@workflow/ai`, which wraps an [AI SDK](https://ai-sdk.dev) model call in that workflow so it can pause for input mid-run and pick up where it left off. The model is just a `provider/model` string that [AI Gateway](https://vercel.com/docs/ai-gateway) resolves, so there are no per-provider keys to juggle:

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
@dxagent what are the most common friction points with Cache Components?
@dxagent favorite my run about ImageResponse

dxagent  📋 Triage: getAll() drops duplicate-named cookies (#95265)
         🔴 1 · 🟡 3 · 🟢 4 · 16.3.0-canary.69 · claude-opus-4.8 · 1m 35s
         [ View run ]  [ Browse source ]
```

## Turning the Logs into a Next.js Dashboard

By this point the runs lived in Slack threads, and they got hard to manage as they piled up. I also wanted more visualization around them, like tracking friction on the same task over time, or seeing which features confused agents the most.

So I built a Next.js dashboard around the runs, where logs render with their severity dots, red and yellow entries can become tracked issues, the source code the agent produced sits next to the log, and charts show friction per version. The dashboard is itself a Next.js 16 app with Cache Components enabled, so I'm building on the very features I'm testing.

## Testing My 16.3 Work Before It Shipped

The error messages, Skills, and docs I worked on all shipped with [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements), and because the runs are cheap to point at a branch, I could test all of them this way before they merged.

Next.js publishes a preview build for PRs as an installable tarball, so a run takes a PR URL, resolves it to that tarball, and installs it into the sandbox app before the agent starts. I change something on a branch, push, and watch how an agent reacts before it merges.

Without per-run sandboxes, "test this PR before it merges" turns into "set up a test rig and hope you remember to tear it down."

### The Error Messages

With Cache Components, an await on the server is a choice, and [Instant Insights](https://nextjs.org/blog/next-16-3-instant-navigations#stream-cache-or-block) in the overlay present it as three fixes, Stream, Cache, or Block, each with a [**Copy prompt** button](https://nextjs.org/blog/next-16-3-ai-improvements#actionable-errors) and its own [docs page](https://nextjs.org/docs/messages/blocking-prerender-dynamic). The same menu prints in the terminal, which is where agents actually read it:

```text
Ways to fix this:
  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] Cache the data access with `"use cache"` (does not apply to `connection()`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set `export const instant = false` to silence this error and allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
```

When I reword one of those errors, a run against the PR preview shows me whether the agent picks the right fix or falls back to training data, using the same prompt and the same model before and after my change. Here's a run that went looking for the Copy prompt feature itself, from its log:

```text
## Log
🔴 No documentation exists for the "Copy as prompt" / Instant guidance feature.
   Grepping the bundled docs for `copy prompt` or `clipboard` returns nothing  [docs]
🟡 The fix-card docs anchors are runtime-only: the cards link to
   blocking-prerender-dynamic#... anchors with no entry point from the docs  [sandbox]
🟢 The overlay renders one "Copy as prompt" button per fix card, so the copied
   prompt is scoped to the specific fix the developer chose, not a generic dump  [sandbox]
```

The feature itself works well, which is the green line. The red is the problem with it: the Copy prompt affordance is genuinely good, but it's undocumented, so an agent grepping for it turns up nothing.

Runs like this shaped the details that shipped. I restructured the Copy prompt body into a step-by-step checklist ([#95186](https://github.com/vercel/next.js/pull/95186)) and dropped the fix cards that didn't apply to the failing code ([#94926](https://github.com/vercel/next.js/pull/94926)). A few runs also noticed that the `/docs/messages` pages the errors link to aren't bundled offline, something only an agent stuck in a sandbox would ever hit.

![The dev overlay Instant Insights panel with the Stream, Cache, and Block fix cards and a Copy prompt button](@assets/dev-overlay-insights.avif)

### The Skills

The [first-party Skills](https://nextjs.org/blog/next-16-3-ai-improvements#first-party-skills) went through the same treatment, which meant isolated runs following each skill end to end against its PR preview, plus trying the same tasks myself in my own agent to feel the experience. Here's a run trying the Partial Prefetching adoption skill:

```text
## Log
🟢 Skill is well-structured. The `## requires` section, the offline-docs note,
   and the "empty sweep is success" callout in step 4 made the sequencing obvious
🔴 Guide docs push users to a codemod that doesn't exist yet.
   adopting-partial-prefetching.mdx says to run
   `npx @next/codemod@canary remove-partial-prefetch ./app`, but that transform
   isn't shipped in @next/codemod yet  [sandbox]
🟢 Build with the flag on passes, and the banner shows "Partial Prefetching enabled"  [sandbox]
```

The green line means the skill's recipe works as written. The red one caught the guide sending people to a command that didn't exist yet, since the codemod hadn't been published, and the runs hit it before any user could. Watching agents stumble through runs like these is what fed into the [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) skill.

### The Docs

I wrote a [Building guide](https://github.com/vercel/next.js/pull/94999) that walks through `next build` under Cache Components, where you build a product page, hit the `blocking-prerender-dynamic` error, and the guide shows the terminal output at each step, copy-pasted transcripts included. Before it shipped, I had an agent follow it end to end against the PR's preview build and check the claims against what the terminal actually prints. From its log:

> The **one substantive problem** is the transcript for the `blocking-prerender-dynamic` error: the message printed by `next build` on this same branch has been reworded and expanded, but the guide reproduces the *old* wording — which is still what `next dev` prints, so the guide is only half wrong depending on where you read it from.

While the guide sat in review, the error message itself had been reworded on the same branch, so the guide was quoting terminal output the terminal no longer printed. I would have skimmed right past it, because it read correctly a week earlier, and the run also surfaced a second problem hiding in there, which was that `next dev` and `next build` were printing two different messages for the same error.

Other runs on the same guide caught a section whose predicted build output was wrong, two links that 404ed on the live docs site even though the PR's link-checker bot had reported all links fixed, and a code frame in the guide with the caret on the wrong line. The guide showed the error pointing at the database lookup:

```text
> 5 |   const product = await db.product.find(id)
    |                   ^
```

while the branch actually printed it one line up, because `params` had become a runtime API:

```text
> 4 |   const { id } = await props.params;
    |                              ^
```

Instead of reviewing a docs PR by reading it back and guessing whether it's clear, I get to watch an agent try to use it.

### Smaller Findings Along the Way

Most of the small stuff never gets its own run, because it surfaces in the middle of a bigger task and gets a severity dot in the log, and in the dashboard the red and yellow entries become tracked issues so none of them get lost. Here are a few, each from a different run, and each one shipped as a PR:

- 🟡 No build output confirming `partialPrefetching` is active, shipped in [#95593](https://github.com/vercel/next.js/pull/95593) which logs "Partial Prefetching enabled" during `next build`
- 🔴 First build failed on `/_not-found` with the "uncached or runtime data during prerendering" error, shipped in [#95163](https://github.com/vercel/next.js/pull/95163) which clarifies `/_not-found` failures under Cache Components
- 🟡 `partialPrefetching` is a separate required flag, not co-located in `cacheComponents.md`, shipped in [#94818](https://github.com/vercel/next.js/pull/94818) which tightens the Partial Prefetching API references and adoption guide

When a fix goes up as a PR, the same prompt runs against its preview build to check the friction is actually gone before it merges.

## Letting eve Own the Plumbing

The first version used Vercel Workflow for durable runs, the AI SDK with AI Gateway for the model, the chat SDK for Slack, and Redis and Blob for storage, with a sentinel string for human-in-the-loop.

I was already running the loop regularly by the time [eve](https://eve.dev), Vercel's framework for durable agents, came out, and migrating to it deleted around 1,900 lines of my code for the same surface: the same dashboard, the same Slack bot, the same loop. A whole `workflows/` package, roughly 2,600 lines of durable-run orchestration, including the `DurableAgent` run loop from the Slack section, collapsed into eve's session loop.

Slack is the clearest example, and it's where the trigger-only bot finally grew up. The first version used the chat SDK with a `slack-manifest.json` checked into the repo, every scope and event subscription maintained by hand, a 441-line chat handler, and pattern-matched thread replies faking human-in-the-loop, because questions came back as free text I had to answer in prose. All it could really do was start a run and report back.

On eve the whole channel is one 480-line file, `ask_question` renders as real buttons and resumes with structured input, and Vercel Connect provisioned the new Slack app in one CLI call instead of the api.slack.com walkthrough, with no manifest in the repo anymore.

The pieces are all still there, they just moved into eve's file structure, and now the framework owns the sessions, the sandbox lifecycle, the channels, and the scheduling:

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

The migration changed the agent's role too. Before, it was just something the workflow kicked off once per run, with no way to coordinate the runs or even see the others. On eve it became the orchestrator of all of them, with past runs indexed, so it can answer questions about older ones and act like one continuous assistant instead of a series of one-shot triggers.

Runs also got faster, and the suite runs that used to die halfway with no error now finish, a bug I'd sunk real time into and never fixed. The framework your agent runs on is a DX surface too, I just didn't notice until I swapped mine out.

## Anyone Can Build This

The skill and the viewer are open source, and nothing else in the setup is specific to Next.js. You can give a fresh agent a real task in a clean sandbox, have it log where it gets stuck, and read the parts you'd otherwise skim.

The friction it hits is the friction your users hit, so what you fix for the agent you fix for the person too. It won't catch regressions on its own, that's what evals are for, but they go well together: the eval tells you the task still passes, the friction log tells you how rough getting there was. If agents love your framework, humans will too.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
