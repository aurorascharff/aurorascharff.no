---
author: Aurora Scharff
pubDatetime: 2026-08-19T00:00:00Z
title: Testing Next.js Against Coding Agents
slug: testing-nextjs-against-coding-agents
featured: false
draft: false
tags:
  - Next.js 16
  - Coding Agents
  - Developer Experience
  - Cache Components
  - AI
description: Coding agents trip in many of the same places developers do. Here is the friction-logging workflow I built to test Next.js against agents, and what it taught me about error messages, docs, and DX.
---

I work on developer experience on the Next.js team at Vercel, including the docs, error messages, [codemods](https://nextjs.org/docs/app/guides/upgrading/codemods), and [adoption skills](https://github.com/vercel/next.js/tree/canary/skills) that make a feature usable for whoever picks it up next. That's now an agent as often as a person. A coding agent reads all of this when it builds with Next.js, takes unclear guidance at face value, and gets stuck in many of the same places a developer would. So I started running agents against our work to find those places on purpose.

In this post, I'll walk through the setup I built and what it taught me about error messages, docs, and DX. I'll start with the friction-logging skill and the Vercel Sandbox behind each run, then show how I connected the system to Slack, a dashboard, and [eve](https://eve.dev), Vercel's framework for durable agents. I'll also cover the passive collection flow I tried for regular coding sessions.

## Table of contents

## Why I Started Testing with Agents

I built this because agents were doing a bad job. Building with newer APIs like [Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents), they weren't getting it right even though the docs were bundled in the project, and I wanted to understand what they actually did and why. At Vercel we build agents for everything, and I'd been wanting to automate my own DX work. Testing Next.js with agents brought those two interests together.

I also wanted to test my own changes. Error messages have been neglected for a long time, and agents make that harder to ignore. An agent has to read an error, work out what it means, and act on it in the same way a developer does. A vague message leaves it guessing. Whenever I changed an error or a docs page, I wanted to know whether it helped or whether I was shipping different red text, while there was still time to change the design.

## Using Agents as Fresh Testers

Testing a feature with someone who has never seen it exposes the confusing parts that the people who built it have learned to ignore. The catch is that you run out of fresh testers fast, because everyone is only new once.

An agent is a fresh tester you can run as often as you want, provided each run starts without memory. Claude Code keeps memory between sessions, which helps in real work but gets in the way here. A second run would test the framework together with whatever the agent learned last time. So I start each run cold, with no history.

A cold agent hits the same rough edge run after run, the one a developer would have worked around and stopped noticing. For a real user that repetition is a problem, but here it's exactly what I want. The agent also doesn't know it's being tested, so it has no reason to smooth over or play up what it hit.

Cold runs are especially useful for new features. An agent can fall back on training data for an older API. For something new, it has little to go on except the docs and error messages we wrote.

## Why Evals Weren't Enough

Once the agents were hitting friction, I needed a way to capture it. We already measure agents with evals, and the bundled docs work scored well on them. But an eval only checks whether a task passed from start to finish. The task can still pass after the agent guessed twice and misread an error along the way.

The trouble often comes later in the task, when the agent drifts from its original plan. A run can turn green because the agent stopped doing what the prompt asked. That was what I saw with Cache Components. The eval numbers looked good, while agents still stumbled through the work.

Asking the agent afterward what it struggled with didn't work either. It would tell me everything went fine and give a plausible reason for whatever it did, and the reason often wasn't the true one.

The run that made me stop asking afterward was one where Sonnet kept ignoring [AGENTS.md](https://agents.md), and I couldn't tell why. Its first answers sounded plausible but didn't hold up. After asking the same question several times, I found the real reason. That harness had no tool for reading inside `node_modules`, so the agent could not follow the guidance. If one concrete fact was this hard to recover afterward, I needed to log the friction while the agent worked.

## Logging Friction During the Run

A friction log records everything that confuses an engineer while they work through a task. I wasn't especially familiar with the practice when I started. The manual version is valuable, but it only gives you the engineer's point of view. I wanted the agent's too.

So I made a skill, [friction-log](https://github.com/aurorascharff/agent-friction-skill), that changes how the agent behaves during a task. It logs gaps in real time instead of guessing past them, tags steps green, yellow, or red, and cites where its decisions came from, whether that's the docs, a web search, training data, or the sandbox.

The skill writes a structured Markdown file with a header, the prompt, a summary, action items split into docs, framework, and DX or research, and the tagged log.

Here's one trimmed run, with every section intact so you can see what the skill records:

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

This run predates the error-message work in 16.3. The agent hit the same error on two builds, while the message pointed at the wrong file and gave it no clear fix. I saw this often, and it is the kind of friction I wanted the error-message work to remove.

I spend most of my time on the summary and action items. The skill sorts them by where the fix belongs, so I turn the ones worth doing into tracked issues and come back to them later. The `[docs]`, `[training data]`, and `[sandbox]` tags let me trace a finding back to its source.

The skill is open source, and you can add it with:

```bash
npx skills add aurorascharff/agent-friction-skill
```

I [shared a full log](https://x.com/aurorascharff/status/2055328557480714309) when I published it, and the logs in this post are trimmed from runs like these. You can [see a full one in the viewer](https://agent-friction-skill.vercel.app/view#log=g:H4sIAAAAAAAC_41YzXIUyRG-z1NUiAOjkbqHBRuMYAmzAhGyMd4AbawjFMR2TXfNTKGert6qao3GJ5_8AI69E-tn8BPtE-wj-Musqp4eCQEXxPRfZX6Z-eWXeUecWF16bRrx2izEb__6RbxQl8JcKlvLjdg7Nu1GSCdaa1at3xNdUykrjmW5VOIYl0yjGu9Go8nkjbry-Qcn8KbD544mE_HNw_xBfi8rZSPtJn90D0-9kF7Rrfv37j_M7j3M7j_Gxe86XVfC6xXfuufE2HYN_ZxW6jJLtujmUjmvF5KsfSIaQ0ZVXTB-xp9olKpUtY9PPm9b-lYxXRt74VpZqum8hiWwOyvhUxYcKkajO3fE9_z_0eiZ8DhBePhWDUCg5yMAYq6k76zCM9KLpWxb1TixXqpGrJXonBJ8xBYZIZsK1-payLXUXjizUn6pmwUf_K5brQDNaPT7x4__FZPJGU5OJ7DhQjVV5k2GPznc-VH7pSiuHXEkvO1UwSfJBhHi-5Uo-ERcDx61cqFErS5VLcbAruiNLQ4Jy-Lpu86RN-pZsX8oigbhJBQKYaV2yvE39vqPV9JLUXUWngAaZRXlBX7sidPG6cXSsznhcnh3MsEdLxsvFp2uZFMqOBQhzsVLfFaYOT_pl1YBB30F-2yFbEiWienQbPya1aa8IBOs6bzap-ethq0awJt1gzOvJzDOnHXeI2M4gggtPS8RvbrOHIAsCXwAuQC0KejesF1lrduZgUniUksgJC8pGY3N-xv52mqvzgBdkY9GFE0-oEof0k7gu51uVL0RS8Akfu5krf3mCCZ47WtECDfFuED-4hE69fzpAt61z96LvafA5NkeIZPnOUVJikcwWrUCeJQXtUbyjiurLxXuzKxZO9Tqb__-j9AVvNHzjZhLXRNepakU37FKIkwdDj5gxCtTOr4h2YBWeq9sw1cQKvoEUIvVyVf5ZDbULYEhXGzueqHg7SYekIVHnJ7R0Y7MRmrQG8paY0MQBZcSijdgC5SUBVW8pCdOm7kZ7xe5OMWHL1FqHgeFpAphQnw05RaOp4ucuxlRR21MWwh3ocmwOdICGULmXcMoWmSE43rU_0TclrJZUCY1oq0l_WsNMg82LYEpcqcRqlwawpJTI-Efwz5PpIqnFYV9Mqm0Kynd5UxTxCcTKjsQCkqKnjzi76TixxtgWlN2K_hH6RgRi7lbyxmV8fXk3kf4FOO_kh71JJuNcEpaODNDhBHJFTkUPtRUNdUx4n0Y-KFDfErx_PtTwGDnYMxDYWwoyE2rRCNXwGNcEBvS56j-ihN9dYy8L_Zz8byJ0RjjrYp4xrTK7gvTII_muqmoLMVsI3C5SbgliiX_ECyq5ZyZ8XmA79SrlaMLd8QLWDrKxO8ff_kf0HxjRIKH-4FQV0DfiXk0-Ubjmorr9JPAJmJ9ZVXbJqOoVuwWoqJBsfy0QquplZtSbk0RS_wDg6YFn1gMWgTotBh2GPqZ-AE_lC9zFAUORuNAAiyZvhSIGbblN8g9X1VF72nI-XktF31C9NwrYCByAgmCLnhJv8kN07jUzvo-mvwPYe9pto_2wPiYbwguqttYtC8V4hJkwHVjKSUkn-WNQYXSSXS2K62eJXRTGLyc3bAgecUmSJeskHOAHGK2Nh36_EpeqJ16ofyipMzFOYXlPSfKx19TS9VXGZ0Q2A3fgS_4i_cik2WUpJQHTNncdMBVF0QJTCYfXG7sIkQcVeCQ6G6amk_WxyCrNqgSXd4heu7PGa-tbDPdZG7bxhg4QquuzTpLX0IVwQA8wMkcKgcpnOg20CUZ5lioERWpu5RFlLIWCQg-AqMAtIgiEGs9OkxwnNsY6Dt6wIoAgDmgPjNX70OZnVjUOWmPLYTfDUnn0uVDPiAQdYOTHCyGFURr66UG-Th45nDwOvFCIsANeyl-AM_Ijbu1R2-ZB2SYiCbv2SfkjsbJfH-34mIeJXQcsAX_ob1TEspkEHqBWKDwhSxB7o5BOgD_HcA0YEU5NUwyVEGtF0xdFGX8Gat8kffVSfQm3afZZ5vB-zGF0SzbIfiMdtKAqf0NhYO6KtH26BzyDhGCFJQV8PSa_KPsRX-coTK4a8nQr3UZ6JE6IWQ1SBn9_oBSY65tSBNHDFrG9t2i13lU4rat9-JrjmSdSVy1ypkaWvzwc83_8EbnDyLNcZLDH3ZJlj7KnJ6VOTaOpTx7qj2CWHYWJUbPYgrQ9EGo7QZ87MTGdKTMoh2JsI4pI4mjQi-j4xEe4EJUK-ENqBdATTnoN-Lwa-gwK1Qp5FhGIok7aGyMfZdJRhP4ff8D2wSuIw-5ZJeSiy-pDnyu7uXZmNph3wdJMXHeMV2xvmLXeqnWt5J9-uJCRW3PWcJ1lXJ-rmvFwn6J10ji4L_Hr0-5e4QCwQVSBLqBNYhMyyUnKXw6dhqHEhcDUUxMPThq-3pwk_mqtTo1qgf8wqxD1uLKAUEd2CsoHy4t3ByI14HECcocgwGs8al3bPW4FBcNUQuYMyQ4qQ5ScB7OQlOqJaEo2d1UcjAjZRckYRtOi2FAbtKkZXV7gxFf_ANp8lYFIZXq9K2CLZTDeAWKtY7jTq0pT45undEOYBLRbhYGsTSiYfDZnay-Ta2SRymUKhX1aqUqDVYAynAYF4FY8erlmZgWn2CSs4G8SnMYjLnJTRHwyQRyrW_GSOjxA1av0OvOpK68O8uAz1tVpfEINFES4fA3ougIIhARJvFMPYsCLwO_4cmqWwHvNxol5U1XLq9hTyuJ0eibPDh0HI4vZijfDONCwVVRfHKsf5LWEEF7X19ETCY5Iohy6jXe81cv35y9I7WV-lcF0EukykoFGfA5ETiwW5yHFMOn3o_u54FN3nHuqGpHdvcskkQMtDE11aixv05O8r0TY1-__huJcKatJeqXGOlrtSQ1W27FSY7KmelurkF6hobZbGDi2hPORKRq87kZppdmD2I8T6jkQhdftbXaSvkoLm9BPA13LDGHC6JpQVP0DlhBH8TFSKGD8oRmLxMmFGXgHe9kPZ97d0XgXr-eUXHyzSDVRJFXOele0ikQakh4UMFNsYJR7celCqOjidXInt_lYnx-GoN9N2KKSY6MLl7Fc_8KMitIZ9VdRQEq3KYpM23C0qfolSh32CKJw0QvGQOa3VTrJSppp_n9IeYruYbWTMrxL-8okEztcXQE5aPMPzMYEbroPtW1UMEHdZV_cKiWl1fe4vuqigKEdBk4cme61bdIw7Ef4I6jWHo5qavIbD2Ye4wDrKV5FFLIE5N1ZUmiIRyxFyhlb3fwoDWe--J6B2IQtKh2HOFuFjcyuwskSKIazD3E-o-xDGj5SZxIsK4AuKXOchTmjpx12oJdXX9x9ycKVvSUnqGTx_i7QXMJA0poMmO84ZQ_w2yBvKHmhEPXgla04_1iP5y4uypMwmG4LRw69TA6VcQrP_EGcdi5arNYRLhSe-ubmVU_d8r5IzHZe0uZLO5O7x6JtFhWGDMwCSlSIl_eQ06C-dtdYiv9MsxNxTkyTsnV-6IXt6j1c_4iru1sRotzLi66rK5aGoFp1vEiMgMaNWSxUzsgPIogvLDmE3qvhyZeKfaPeCVCBTXFiSz48GPv7yQMtXOAJHHwIFMlJ7IOyyThGtliQvc0pq_x8mQSHL-l2Tsa00gMDFs-vl0b1CHN7OHwvkthnt2Lgyf9VJJa9bsSJzThVHkZdMBw3552u22z2IHnT6mfR0f92qTN723mArU_q28eUTzw9zFyM2iJIDzdk7BLIo7ixSaFOklA3FnxhPjZeh6HA2nJeHNr--1wNXtwc-V6EAKSFpjDrSbP4rdsM09in4yzmOKhjjdgA7AeR0Z-o_x2qQh3rm0Tv2p7eG0cptE32y4GEbSGh9uwEtyuA0PO_XCax46t42ZituGRpF-BRtaPGof0Pknj3UXfjlAKcuD_iGA_AYIaAAA), the collapsible, severity-coded layout they come from, or paste your own at [agent-friction-skill.vercel.app](https://agent-friction-skill.vercel.app). Nothing leaves your browser, because the log travels as a URL fragment, which also makes the link shareable.

## A Vercel Sandbox per Run

The friction-log skill changes how the agent behaves, but the agent still needs somewhere to run the code. I wanted each cold run to have a real Next.js project on `next@canary` that it could edit, build, and run without me creating containers by hand.

I gave each run a [Vercel Sandbox](https://vercel.com/docs/sandbox), an ephemeral cloud machine that boots in a second or two and gets torn down at the end. The agent runs its own commands there, and I read the friction log back when it finishes.

```ts
// a fresh Next.js sandbox per run
const sandbox = await Sandbox.create();

// the agent runs its own commands in it
await sandbox.runCommand({ cmd: "pnpm", args: ["build"] });

// and I read the friction log back at the end
const log = await sandbox.readFileToBuffer({
  path: "/workspace/friction-log.md",
});
```

Runs start from identical state, so two of them are comparable.

## Choosing Tasks for Each Run

A run still needs something to do. I give the agent concrete tasks, from building an app to reproducing or triaging a GitHub issue, and most of mine center on Cache Components. Here are a few real prompts from my runs:

```text
Build a product catalog with cacheComponents where the list updates
immediately after editing a product via a form, with no stale page

Build a contact form with cacheComponents that validates on the server
and shows inline error messages

Try to reproduce vercel/next.js#95268: document.title dropped on
client-side navigation with cacheComponents

Triage vercel/next.js#95395: constructor as a route name crashes the
dev overlay
```

The runs are independent sessions with their own sandboxes, so I can run them in parallel. I repeat the same prompt to rule out one-offs, group prompts into suites for a new canary or PR preview, and compare two runs to see which friction appeared or went away.

The log header records the model, harness, and Next.js version. Since the model is an AI Gateway string, I can change that string and run the same task with another model in a fresh sandbox.

This lets me keep the task fixed and change one thing at a time. The same prompt across a few models shows whether an error message trips all of them or only the weaker ones. Running it in another harness, such as Claude Code, helps separate Next.js friction from the tool reading it. I change the model or the framework version for a comparison, never both.

## Starting Runs from Slack

I started by kicking runs off by hand. To start them from where I already work, I wired the system into Slack with the [chat SDK](https://chat-sdk.dev), Vercel's toolkit for building chat apps. This became the DX Agent, and it listens for mentions:

```ts
// the DX Agent as a Slack bot
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

I mention the bot with a task, and a durable [Vercel Workflow](https://vercel.com/docs/workflows) runs it in the background so it survives restarts and retries. The loop uses `DurableAgent` from `@workflow/ai`, which wraps an [AI SDK](https://ai-sdk.dev) model call in the workflow and can pause for input before continuing. [AI Gateway](https://vercel.com/docs/ai-gateway) resolves the `provider/model` string, so the app does not need a separate key for each provider:

```ts
// the run loop
import { DurableAgent } from "@workflow/ai/agent";

const agent = new DurableAgent({
  model: "anthropic/claude-opus-4.8", // resolved by AI Gateway
  system: systemPrompt,
  tools: durableTools,
});
```

The bot posts the result back to the thread when the run finishes. Here are a few real mentions from the channel, followed by the card it posts:

```text
@dxagent build a commerce app with Cache Components
@dxagent triage https://github.com/vercel/next.js/issues/95265
@dxagent test the dev overlay Copy prompt feature under cacheComponents

dxagent  📋 Triage: getAll() drops duplicate-named cookies (#95265)
         🔴 1 · 🟡 3 · 🟢 4 · 16.3.0-canary.69 · claude-opus-4.8 · 1m 35s
         [ View run ]  [ Browse source ]
```

## Building a Next.js Dashboard for the Runs

The Slack threads quickly became hard to keep track of, so I built a Next.js dashboard around the runs:

- **Runs.** The full log includes its severity dots and the source the agent produced. A red or yellow entry can become a tracked issue.
- **Suites.** Grouped prompts run as a set against a new canary or a PR preview.
- **Friction rate.** The dashboard charts the rate by version, so a drop from one canary to the next shows the framework getting easier for what the suite covers.
- **Goals.** A suite can have a target, like keeping Cache Components under 20%.
- **Comparison.** The dashboard puts two runs side by side and marks the friction that appeared or went away.

I still ran this version by hand, clicking through runs and reading the charts. Later, eve could use the indexed data to run suites and answer questions without me opening the dashboard.

The dashboard is a Next.js 16 app with Cache Components enabled, so it runs on the features it helps me test. A run can also point at a specific branch, so I can test a PR's preview build before it merges.

## Testing My 16.3 Work Before It Shipped

I used those branch runs to test my own 16.3 work. The error messages, Skills, and docs I worked on shipped with [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements), and I could check them against a preview build before they merged. This was a mix of automated and manual work rather than a fixed pipeline. I chose which changes to run through it.

Next.js publishes PR preview builds as installable tarballs. A run can take the PR URL, resolve the tarball, and install it in the sandbox before the agent starts. When I wanted to check a change, I could push the branch and watch how an agent reacted before it merged.

The sandbox made these pre-merge checks cheap. It handled the isolated environment and cleanup that I would otherwise have to maintain myself.

### The Error Messages

With Cache Components, uncached server data outside `<Suspense>` blocks prerendering. [Instant Insights](https://nextjs.org/blog/next-16-3-instant-navigations#stream-cache-or-block) presents Stream, Cache, and Block as fix cards in the overlay. The cards include a [**Copy prompt** button](https://nextjs.org/blog/next-16-3-ai-improvements#actionable-errors) and link to the relevant section of the [docs page](https://nextjs.org/docs/messages/blocking-prerender-dynamic), so an agent gets the pattern we'd recommend instead of guessing at one.

![The dev overlay Instant Insights panel with the Stream, Cache, and Block fix cards and a Copy prompt button](@assets/dev-overlay-insights.avif)

The same menu prints in the terminal, which is where agents actually read it:

```text
Ways to fix this:
  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access
  - [cache] For uncached data (`fetch`, database calls): cache the access with `"use cache"` (does not apply to `connection()`)
  - [block] Set `export const instant = false` to allow a blocking route

Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
```

When I reworded one of those errors, I ran the same prompt and model against the change's PR preview. This showed whether the agent picked the intended fix or fell back to training data. Here is part of a run that went looking for the Copy prompt feature itself:

```text
## Log
- 🔴 No documentation exists for the "Copy as prompt" / Instant guidance feature.
   Grepping the bundled docs for `copy prompt` or `clipboard` returns nothing  [docs]
- 🟡 The fix-card docs anchors are runtime-only: the cards link to
   blocking-prerender-dynamic#... anchors with no entry point from the docs  [sandbox]
- 🟢 The overlay renders one "Copy as prompt" button per fix card, so the copied
   prompt is scoped to the specific fix the developer chose, not a generic dump  [sandbox]
```

The Copy prompt feature worked, but the log caught that it was undocumented. An agent searching the bundled docs for the affordance found nothing.

Both docs findings became PRs. [#94564](https://github.com/vercel/next.js/pull/94564) moved the Insight error pages into canary so the sandbox app could install them offline and resolve their links. [#95193](https://github.com/vercel/next.js/pull/95193) restructured those pages to orient the reader and point at the new 16.3 guides. I also reworked the Copy prompt body into a step-by-step checklist ([#95186](https://github.com/vercel/next.js/pull/95186)) and removed fix cards that did not apply to the failing code ([#94926](https://github.com/vercel/next.js/pull/94926)).

### The Skills

I checked the [first-party Skills](https://nextjs.org/blog/next-16-3-ai-improvements#first-party-skills) the same way, with isolated runs against their PR previews. I also worked through the tasks in my own agent so I could see the same failures directly. Here is a run following the Cache Components adoption skill:

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

The skill's sequencing worked as written, and the run caught a real gotcha. The blanket opt-out from the codemod clears validation but not synchronous I/O reads, so a `new Date()` in the root layout footer still failed `/_not-found`. Findings like this went back into the [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) skill.

### The Docs

There wasn't a guide for reading `next build` output under Cache Components, and agents kept misreading it. The output is new enough that it isn't in training data, so a run would guess at what the route table and Partial Prerender glyphs meant.

The [Building guide](https://nextjs.org/docs/app/guides/building) I wrote walks through that output. You build a product page, hit the `blocking-prerender-dynamic` error, and follow the terminal output step by step. Before the guide shipped, I had an agent work through it against the PR preview and compare its copied transcripts with what the binary printed. It flagged three:

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

The branch printed it one line earlier because `params` had become a runtime API:

```text
> 4 |   const { id } = await props.params;
    |                              ^
```

Rereading a docs PR catches unclear writing, but not a transcript that has drifted from what the binary prints. Catching that by hand would mean working through the whole guide myself, running it step by step and comparing the output to what's written, line by line. Running an agent through the guide does exactly that.

### Other Findings

Agents sometimes flagged small things they weren't asked to look for, including details I might not have filed separately. Several still turned into PRs:

| Friction                                                                                                          | Fix                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟡 No build output confirming `partialPrefetching` is active                                                      | [#95593](https://github.com/vercel/next.js/pull/95593) logs "Partial Prefetching enabled" during `next build`                                             |
| 🔴 First build failed on `/_not-found`: "uncached or runtime data during prerendering"                            | [#95163](https://github.com/vercel/next.js/pull/95163) clarifies `/_not-found` failures under Cache Components                                            |
| 🟡 `partialPrefetching` is a separate required flag, not co-located in `cacheComponents.md`                       | [#94818](https://github.com/vercel/next.js/pull/94818) tightens the Partial Prefetching API references                                                    |
| 🟡 The `[block]` fix said "silence this warning", but it shows up as an Error, not a warning                      | [#95187](https://github.com/vercel/next.js/pull/95187) removes "silence this warning" from the instant validation fix output                              |
| 🟡 The upgrade codemod hard-aborts without a git repo, with no `--yes`/`--no-git` path for agents or CI           | [#95312](https://github.com/vercel/next.js/pull/95312) makes the codemod upgrade non-interactive for agents and CI                                        |
| 🟡 The `cacheTag` docs don't show `updateTag` next to `revalidateTag`                                             | [#94508](https://github.com/vercel/next.js/pull/94508) adds an `updateTag` example to the `cacheTag` page                                                 |
| 🟡 `export const prefetch = 'allow-runtime'` had no docs page and was discoverable only through the reference app | [#94997](https://github.com/vercel/next.js/pull/94997) documented the option, now named `prefetch = 'partial'`, along with sync I/O and `instant = false` |

For changes I wanted to verify, I ran the same prompt against the preview build again before it merged.

## Moving the DX Agent to eve

The first version used Vercel Workflow for durable runs, the AI SDK with AI Gateway for the model, the chat SDK for Slack, and Redis and Blob for storage. A sentinel string handled human-in-the-loop questions.

I was already running the loop regularly by the time [eve](https://eve.dev) came out. The migration removed around 1,900 lines of code while keeping the dashboard, Slack bot, and agent loop. The `workflows/` package, including the `DurableAgent` loop from the Slack section, moved into eve's session loop.

### What eve Replaced

The Slack integration changed the most. The first version kept a `slack-manifest.json` in the repo, with scopes and event subscriptions maintained by hand. Human-in-the-loop questions came back as free text, so I pattern-matched thread replies to resume the run. The bot could start a run and report back, but it could not do much else.

On eve, the whole channel fits in one file. The `ask_question` tool renders real buttons and resumes with structured input. Vercel Connect also provisioned the Slack app in one CLI call, so the repo no longer needs the manifest or the api.slack.com setup walkthrough.

After the migration, eve owned the sessions, sandbox lifecycle, channels, and scheduling. The app fit into this structure:

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

The sandbox definition installs `next@canary` when it boots the base app:

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

### Coordinating Runs with eve

The first version started a separate agent for a run, and that agent could not see or coordinate the others. On eve, past runs are indexed, so one agent can coordinate them, answer questions about older runs, and continue the conversation across sessions.

Now I can ask the DX Agent questions across the runs it has collected:

```text
@dxagent how did this run do compared to the one without partialPrefetching?
@dxagent did the Cache Components suite improve on the latest canary?
@dxagent how many runs hit the blocking-prerender error this week?
@dxagent are we close to Cache Components being ready for default?
@dxagent favorite this run
```

Suite runs that used to stop halfway without an error now finish, which fixed a problem I had spent a lot of time investigating. It reminded me to test the framework running the agent as part of the experience too.

## Collecting Friction at the End of a Session

The friction-log skill records problems as the agent works. I also wanted to see whether we could collect useful feedback from a regular coding session, so I built a [passive version](https://github.com/aurorascharff/agent-friction-skill/blob/main/passive/SKILL.md) as a proof of concept.

This version waits until the end of the session:

1. At the end of a session, the skill scans the conversation for build failures, missing docs, misleading errors, and workarounds. It exits without saying anything when the session was clean.
2. When it finds friction, it sends a structured report to a [draft endpoint](https://github.com/aurorascharff/agent-friction-skill-visualizer/blob/main/app/api/draft/route.ts). The [schema](https://github.com/aurorascharff/agent-friction-skill-visualizer/blob/main/lib/payload.ts) has fields for the framework, version, friction points, and action items, but no field for the raw prompt, transcript, commands, or file paths.
3. The endpoint validates the report, stores it as a private draft, and returns a signed review URL that expires after 10 minutes.
4. The agent opens the review page. Nothing has been shared yet, and the developer can submit the report or discard it.

Here is the sample payload I used to test the review form:

```json
{
  "schema_version": 1,
  "framework": "next",
  "framework_version": "16.3.0-canary.68",
  "summary": "The agent could not find the supported way to submit framework friction for review.",
  "friction_points": [
    {
      "severity": "yellow",
      "title": "The agent feedback flow was difficult to discover",
      "expected": "Project instructions explain when and how to draft framework feedback.",
      "actual": "The agent finished the task without opening the review form.",
      "resolution": "Added a passive skill that drafts a report for human review.",
      "source_tag": "skill",
      "file_kind": "AGENTS.md"
    }
  ],
  "action_items": [
    {
      "bucket": "docs",
      "title": "Document how coding agents can submit framework friction",
      "context": "The agent only found the feedback flow after searching the skill source instead of the project guidance."
    }
  ]
}
```

The review form renders that report before anything is shared:

![The passive friction report review form showing a sample report with Discard and Submit report controls](@assets/passive-friction-report-review.png)

If the developer submits the form, the draft becomes a durable report. I store it as Markdown for people to read and structured JSON for tools to query, both in private Blob storage. The report and triage APIs require a bearer token, so the DX Agent can collect the reports without making them public. Discarding deletes the draft, and an untouched draft expires on its own.

The collection and review flow worked in my tests. The unreliable part was getting the agent to invoke an end-of-session skill consistently, so I kept this version as a proof of concept.

## Applying the Setup Beyond Next.js

The skill and viewer are open source, and the same setup applies beyond Next.js. You can give a fresh agent a real task in a clean sandbox, have it log where it gets stuck, and read the parts you'd otherwise skim.

Agents hit some of the same friction as developers, so the logs can point to problems worth fixing for both. I still use evals to catch regressions. The friction log shows how rough a passing run was along the way.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
