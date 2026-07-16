---
author: Aurora Scharff
pubDatetime: 2026-07-16T15:00:00Z
title: What I learned testing Next.js against coding agents
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

More and more code is written by coding agents, and when someone reaches for `next@canary` to try a new feature, there's a good chance an agent is reading the error before the developer is. Agents read the docs, parse the error messages, and make decisions based on what they see, so where a developer hits an unclear error and opens Discord, an agent guesses and moves on, tripping in the same places a developer would.

I work on developer experience on the Next.js team at Vercel, and for 16.3 that has mostly meant Cache Components and [Instant Navigations](https://nextjs.org/blog/next-16-3-instant-navigations): the dev overlay, the error pages, the codemods, and the adoption skills that shipped with [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements). The job behind all of those surfaces is the same, making the feature usable for the next person who reaches for it, and that next person is now often an agent.

It started because agents were doing a bad job. Building with newer APIs like Cache Components, they weren't getting it right even though the docs were bundled in the project, and I wanted to understand what they actually did and why. At Vercel we build agents for everything, and I'd been wanting to automate my own DX work, so this felt like the thing to build.

It also became a way to test my own changes, because whenever I changed an error message or a docs page, I wanted to know whether it actually helped or whether I was just shipping different red text, and I wanted to know it fast enough to matter during design instead of after merge.

The workflow that came out of it is a friction-logging skill, sandboxed runs, and a Slack bot and web dashboard to drive them, stitched together out of Vercel pieces I'd reach for in any app anyway, and it all runs on eve these days. Here's what I learned along the way.

## Table of contents

## Evals tell you the destination, not the path

We already measure agents with evals, and the bundled docs work scored great on them. But an eval only tells you whether a task passed, and a task can pass while the agent guessed twice and misread an error on the way. That was exactly the situation I was looking at, good eval numbers while the agents kept stumbling through Cache Components, so what I really wanted was to see what happened during the task rather than just how it ended.

## Logging during the task, not after

My first attempt was to ask agents afterward what they struggled with, and it didn't work. The agent would tell me everything went fine, invent a plausible reason for what it did, and the three round trips it spent finding a config key never made it into the summary.

In one run a server-action call failed because the action id in the build manifest had changed, and the agent re-fetched the page, retried, and moved on. It took three tool calls, it would never have mentioned them afterward, and it's exactly the kind of detour that costs a developer twenty minutes. The logging has to happen while the agent works, so that the detours end up on paper.

## A skill that makes friction visible

So I made a skill, [friction-log](https://github.com/aurorascharff/skills/tree/main/skills/friction-log), that changes how the agent behaves during a task. It logs gaps in real time instead of guessing past them, tags each step green, yellow, or red, and cites where its decisions came from, whether that's the docs, a web search, training data, or the sandbox. The log ends in a set of action items I can take back to the framework. Here's an excerpt from one of my runs, trimmed:

> 🟢 The error's `nextjs.org/docs/messages/blocking-prerender-dynamic` link plus the adoption skill's step-2 recipe pointed me straight at the fix, no guessing
>
> 🔴 Second build, `cacheComponents: true` alone: failed on `/_not-found` with `blocking-prerender-dynamic`. The root layout's `CartBadge` awaits `getCartCount()` at render time, so **every** route fails [sandbox]
>
> 🟡 The final `next build` banner listed "Cache Components enabled" but NOT "Partial Prefetching enabled", even though `partialPrefetching: true` is in the same config the dev server enumerated on boot [sandbox]

The source tags are the part I read first, because a red tagged `[training data]` tells me the agent ignored the docs, which is a very different fix than a missing docs page. The skill is open source, and I [shared a full log](https://x.com/aurorascharff/status/2055328557480714309) when I published it.

```bash
npx skills add aurorascharff/skills/skills/friction-log
```

## Starting the agent cold

Claude Code keeps memory between sessions, which is great for real work and bad for testing, because a second run tests the framework plus whatever the agent learned last time. The friction quietly disappears from the logs while it's still there for real users, so what I want for these runs is a fresh agent with no history.

The cold starts have a side benefit, which is that the logs end up honest in a way human friction logs aren't. Developers remember and forget what they struggle with, whereas the agent doesn't know what I'm testing for and doesn't self-censor, and I can reset it and repeat the same task across models and harnesses.

## A sandbox per run

A skill alone doesn't run code, and a cold agent needs a fresh place to work. I needed a real Next.js project with `next@canary` installed, somewhere the agent could build, edit, and run a dev server, and I was not about to spin up containers myself. So the agent gets a [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) per run, thrown away at the end, with a nightly job keeping the snapshot on the latest canary. Three calls do almost everything I need, which is to create it, run a command, and read the log back.

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

## Driving it from Slack

I hooked the agent up to Slack, initially just as a way to trigger runs and get the results back in a channel or thread. I can be in a conversation about something, mention the agent with a task to test, and the log shows up in the thread when it's done, and if it gets stuck it asks me as buttons and waits.

The session stays alive in the thread, so afterward I can ask "what was the build error?" or "which of these block you?" and it answers from the run it just did.

<!-- IMAGE: Slack thread screenshot: the mention starting a run, and the completion card with the severity dots. Place in src/assets/ and reference with ![Slack thread starting a run and completion card](@assets/your-file.png) -->

## Turning the logs into a Next.js dashboard

By this point the runs lived in Slack threads, and they got hard to manage as they piled up. I also wanted more visualization around them, like tracking friction on the same task over time, or seeing which features confused agents the most. So I built a Next.js dashboard around the runs, where logs render with their severity dots, red and yellow entries can become tracked issues, the source code the agent produced sits next to the log, and charts show friction per version. The dashboard is itself a Next.js 16 app with Cache Components enabled, so I'm building on the very features I'm testing.

## Real tasks, not questions

A prompt is a concrete task to build, not a question about the framework, because friction emerges from the attempt rather than from asking the agent what it thinks. The tasks range from building to investigating to reproducing a crash from a GitHub issue, and here are some real ones from my runs:

```text
build a product catalog with 'use cache' and cache tag invalidation
build an e-commerce app with Link prefetch={true}, then adopt Partial Prefetching
do module-level values leak into 'use cache' keys?
triage #95395: `constructor` route name crashes the dev overlay
```

Runs are independent sessions with their own sandboxes, so they parallelize, and I lean on that in a few ways. I batch the same prompt several times to rule out one-offs, I group prompts into suites and run the whole set against a new canary or a PR preview, and I compare two runs to see what friction appeared or went away. Comparing logs is what makes friction measurable, and any way of storing and comparing them would do.

## Testing my 16.3 work before it shipped

The error messages, Skills, and docs I worked on all shipped with [Next.js 16.3: AI Improvements](https://nextjs.org/blog/next-16-3-ai-improvements), and because the runs are cheap to point at a branch, I could test all of them this way before they merged. Next.js publishes a preview build for PRs as an installable tarball, so a run takes a PR URL, resolves it to that tarball, and installs it into the sandbox app before the agent starts. I change something on a branch, push, and watch how an agent reacts before it merges. Without per-run sandboxes, "test this PR before it merges" turns into "set up a test rig and hope you remember to tear it down."

## Testing the error messages

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

When I reword one of those errors, a run against the PR preview shows me whether the agent picks the right fix or falls back to training data, using the same prompt and the same model before and after my change. Here's an agent hitting the errors mid-adoption on a real marketing-site task, from its log:

> 🟡 The `revalidate` incompatibility error is precise but doesn't point at the migration. Enabling `cacheComponents: true` errored on all 4 pages: `Route segment config "revalidate" is not compatible with nextConfig.cacheComponents. Please remove it.` Says *remove it* but nothing about the `cacheLife('hours')` replacement [sandbox]
>
> 🔴 `/blog/[slug]` blocked the prerender. Removing its opt-out failed the build: `Route "/blog/[slug]": Next.js encountered uncached or runtime data during prerendering.` with a clear 3-way fix card (stream / cache / block) and doc links. Cause: `getPost(slug)` was the one CMS fetcher *not* wrapped in `unstable_cache()` [sandbox]

The red entry is the fix menu doing its job, since the agent found the one uncached fetcher on its own, whereas the yellow entry is a message I can still make better. Findings at this level shaped the details that shipped, like restructuring the Copy prompt body into a step-by-step checklist and dropping fix cards that didn't apply to the failing code. Several adoption runs also flagged that the `/docs/messages` pages the errors link to aren't bundled offline, which is the kind of dependency only an agent working in a sandbox would notice.

<!-- IMAGE: Dev overlay screenshot: the Stream / Cache / Block fix cards with the Copy prompt button. Place in src/assets/ and reference with ![Dev overlay Stream/Cache/Block fix cards](@assets/your-file.png) -->

## Testing the skills

The [first-party Skills](https://nextjs.org/blog/next-16-3-ai-improvements#first-party-skills) went through the same treatment, which meant isolated runs following each skill end to end against its PR preview, plus trying the same tasks myself in my own agent to feel the experience. Here's a run trying the Partial Prefetching adoption skill:

> 🟢 `grep -rnE '\bprefetch\b'` — exactly the snippet from the skill — enumerated 4 `prefetch={true}` calls [sandbox]
>
> 🔴 The `remove-partial-prefetch` codemod is not in `@next/codemod@canary`.
>
> 🟡 The skill file itself is not bundled in `node_modules`. Only the guide ships. An agent operating offline can only see the theory (the guide) not the sequencing (the skill)

The green entry tells me the skill's recipe works as written, while the red entry caught the guide steering users into a dead-end command, because the codemod wasn't published yet and the runs hit it before any user did. Watching agents stumble through runs like these is what fed into the [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) skill.

## Testing the docs

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

## Findings along the way

Most of the small stuff never gets its own run, because it surfaces in the middle of a bigger task and gets a severity dot in the log, and in the dashboard I turn the red and yellow entries into tracked issues so I can come back to them. Here are a few of those, from different runs:

> 🟡 updateTag not mentioned anywhere on the cacheTag docs page
>
> 🟡 No build output confirming partialPrefetching is active
>
> 🔴 Build failed with cacheComponents: true — only /_not-found reported
>
> 🟡 The `<Link>` docs say `prefetch={true}` forces a full prefetch, which is no longer true under partialPrefetching
>
> 🟡 typescript-eslint WARNING about unsupported TypeScript 6 despite TS 6 being GA

They're small things, but all five turned into merged changes, from a one-line build log fix to docs clarifications to an eslint bump in the upgrade codemod. When a fix goes up as a PR, the same prompt runs against its preview build to check the friction is actually gone before it merges.

## Letting a framework own the plumbing

The first version used Vercel Workflow for durable runs, the AI SDK with AI Gateway for the model, the chat SDK for Slack, and Redis and Blob for storage, with a sentinel string for human-in-the-loop. I was already running the loop regularly by the time [eve](https://eve.dev), Vercel's framework for durable agents, came out, and migrating to it deleted around 1,900 lines of my code for the same surface, meaning the same dashboard, the same Slack bot, and the same loop.

Slack is the clearest example of what the migration removed. The first version used the chat SDK with a `slack-manifest.json` checked into the repo, every scope and event subscription maintained by hand, and around 150 lines of sentinel-string parsing so the agent could ask a question mid-run and resume on my reply. On eve the channel is one file, `ask_question` renders as buttons and resumes with structured input, and Vercel Connect provisioned the new Slack app during the migration in one CLI call instead of the api.slack.com walkthrough, with no manifest in the repo anymore.

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

The migration changed the agent's role too. Before, it was something the workflow triggered once per run, whereas on eve it became the orchestrator of all the runs, with past runs indexed, so it can answer questions about older ones and act like one continuous assistant. Runs also got faster, and the suite runs that used to die halfway without an error now finish, which was a class of bug I had spent real time on and never fixed. The abstraction your agent runs on is itself a DX surface, and I didn't measure it until I replaced it.

## Anyone can build this

The [skill](https://github.com/aurorascharff/skills/tree/main/skills/friction-log) is open source, and nothing else in the setup is specific to Next.js. You can give a fresh agent a real task in a clean sandbox, have it log where it gets stuck, and read the parts you'd otherwise skim, and the friction it hits is the same friction your users hit, so the fixes don't regress: better error messages stay better, and docs that cover feature interactions stay useful. If agents love your framework, humans will too.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
