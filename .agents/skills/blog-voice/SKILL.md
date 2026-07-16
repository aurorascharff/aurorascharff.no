---
name: blog-voice
description: Write and edit blog posts for aurorascharff.no in Aurora's voice, without AI-generated phrasing. Use whenever drafting, rewriting, or reviewing any post under src/content/blog. Captures her intro pattern, prose style, the anti-AI patterns from the Vercel technical-writing guide, and the specific feedback she gives.
---

# Aurora's blog voice

Write like Aurora Scharff writing her own blog: a working engineer explaining something she built or learned. First person, calm, specific. Not marketing, not a docs page, not an AI think-piece.

Before writing, read two or three existing posts in `src/content/blog/*.md` **end to end** and match their rhythm. The `error-handling-in-nextjs-with-catch-error` and `the-precompute-pattern-*` posts are the best references. Don't work from the intros alone; the body is where the voice lives.

## What her voice actually is

She writes like a concrete technical explainer, not a narrative essayist. The posts explain how something works, step by step, with real code and honest notes on trade-offs.

- **Concrete and mechanism-first.** "Any component that calls a dynamic API like `cookies()` or `headers()` opts into dynamic rendering. When that happens in a root layout, every page nested under it becomes dynamic too."
- **Present tense, direct address.** "The browser still shows `/products` while the server routes to the encoded path. The encoded segment is invisible to the user."
- **Short clarifying sentences are welcome** when they land a point. "The user clicks retry and nothing changes." Not everything has to flow; clarity wins.
- **Honest and plain about trade-offs.** "This pattern is not something I invented." "ISR itself has trade-offs here." "This is a known limitation."
- **Some concrete, slightly colloquial texture is hers**, so don't sterilize: "shipping different red text", "runs whatever the agent throws at it", "hope you remember to tear it down".
- **Functional colons and inline lists are fine**: "the trade-offs these teams face: high cardinality, ISR limitations, and what cache components mean for it."

The failure mode to avoid is the opposite of hers: a polished reflective essay with literary rhythm and neat closers. She doesn't do that.

## Source of truth

Never invent facts, numbers, PR titles, code, or scope claims. Verify against, in order:

1. The actual code and repos (for example `~/Documents/Development/dxagent`, the `vercel/next.js` repo, `gh pr list --author aurorascharff`)
2. Her real data (runs and logs in the dxagent Redis store, merged PRs)
3. Published posts, for voice only

If you can't verify something, ask or leave it out. A confident wrong claim about what she works on, or what a PR did, is the worst failure mode. She checks.

The full technical-writing rules live at `~/Documents/Development/front/.agents/skills/vercel-technical-writing/`. Read `SKILL.md` and `style-rules.md` there; the anti-AI patterns below are the ones that matter most for the blog.

## Intro pattern

Her intros are short, one to two paragraphs, in this shape:

1. State the topic or the situation plainly. No "these days", no dramatic scene, no broad think-piece opener unless she asks for one.
2. A roadmap line: "In this post, I'll walk through ...".

Keep the background (the why, the mechanism) out of the intro. If it runs past two paragraphs, some of it belongs in a background section, not the intro.

## Structure

- Headings in Title Case, matching the existing posts.
- `## Table of contents` immediately after the intro, exactly that string. The TOC plugin keys on it.
- One idea per section; each section should stand on its own.
- Separate different things into different UI. A friction finding and the PR that fixed it are two things: use a table (`Friction | Fix`), not one run-on sentence.
- Close with the standard sign-off (follow on Bluesky / X, "Happy coding! 🚀").

## Prose style

- Flowing, connected sentences. Show the relationship (because, so, while) instead of listing disconnected facts.
- First person. Past tense for what she did, present tense for how things work.
- Let code and real examples carry the weight. Don't narrate around them.
- Describe a process, don't list personal capabilities. "The task stays fixed and one thing changes" reads better than "I can hold the task fixed, and I can swap the model, and I can ...".
- Link a tool once, at the point it's used, with a short note on what it does and why. Show a real snippet. Don't relist the link later.

## Patterns that read as AI (never do these)

She flags these every time:

- **Em dashes for emphasis.** Use commas, periods, or parentheses. Em dashes inside quoted logs or transcripts are fine, they're data.
- **"It's not X, it's Y"** and other tidy inversions. State the point directly.
- **Choppy declarative flourishes** dropped in as a punch line: "That's the whole game." "The agent never does." Connect the idea into the surrounding sentence.
- **Repetitive series / tricolons**: "No config. No setup. No maintenance." Combine naturally.
- **See-saw balance**: "a developer learns to route around it, while an agent walks into the wall", "the green line is X, the red is Y". Rephrase so it isn't a matched pair.
- **Signposting**: "The job behind all of this is the same", "Findings at this level", "Underneath, it's a memory thing", "It's worth noting that". Say the thing.
- **Over-explaining and self-justifying**: don't defend tool choices ("not because I'm pitching them"), don't announce what you're about to explain, don't add a disclaimer nobody asked for.
- **Superlatives and hype**: "the truest test", "unusually honest", "surprisingly good". Be plain.
- **Literary flourishes**: "the friction quietly disappears", "the docs are the whole game", "the bot finally grew up", "the detours end up on paper". Say it plainly instead.
- **Aphorism closers**: don't end a section or the post on a neat one-liner like "If agents love your framework, humans will too." Let the last real point be the ending, then the standard sign-off.
- **Minimizing and filler words**: just, very, simply, basically, obviously, seamless, robust, leverage, utilize, "in order to".
- **Inline colon introducing a list mid-sentence.** Use "including", or break into a real list.

## What Aurora has asked for specifically

- Don't overstate scope. Check her PRs before describing her work. "Developer experience, mostly the dev overlay and its error and insight system, plus the docs, codemods, and adoption skills" is accurate; "error messages and docs" is not.
- Fix contradictions. If one paragraph says an agent works around a problem and the next says it doesn't, the distinction is usually memory (it works around it in the moment but keeps no memory between runs).
- Prefer real excerpts (real runs, real PR numbers, real log text) over invented examples.
- Stay honest and non-promotional about Vercel tools without saying that you're being honest.
- Show, don't tell: a real snippet or a trimmed real log beats a description of one.

## Before finishing

- [ ] Every claim about her work, PRs, or numbers is verified against a real source
- [ ] Intro is one to two paragraphs: topic plus roadmap
- [ ] No em dashes in prose, no "it's not X, it's Y", no choppy flourishes, no signposting
- [ ] No just / very / simply / hype words in prose
- [ ] Findings and fixes are separated, not run together
- [ ] It reads like the other posts in `src/content/blog`, not like a docs page or an AI essay
- [ ] `npx astro build` passes
