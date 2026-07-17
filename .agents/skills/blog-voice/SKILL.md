---
name: blog-voice
description: Write, edit, or review any blog post for aurorascharff.no in Aurora's voice, without AI-generated phrasing. Use for any post under src/content/blog. Captures her intro pattern, prose style, snippet conventions, and the anti-AI patterns she flags.
---

# Aurora's blog voice

Write like Aurora Scharff writing her own blog: a working engineer explaining something she built or learned. First person, calm, specific. Not marketing, not a docs page, not an AI think-piece.

This applies to every post in `src/content/blog`, and the checklist at the end works as a review pass on an existing one too.

Before writing, read two or three existing posts **end to end** and match their rhythm. `error-handling-in-nextjs-with-catch-error`, `the-precompute-pattern-*`, and `component-architecture-for-react-server-components` are the best references. Don't work from the intros alone; the body is where the voice lives.

## What her voice actually is

She writes like a concrete technical explainer, not a narrative essayist. The posts explain how something works, step by step, with real code and honest notes on trade-offs.

- **Concrete and mechanism-first.** "Any component that calls a dynamic API like `cookies()` or `headers()` opts into dynamic rendering. When that happens in a root layout, every page nested under it becomes dynamic too."
- **Present tense, direct address.** "The browser still shows `/products` while the server routes to the encoded path."
- **Short clarifying sentences are welcome** when they land a point. "The user clicks retry and nothing changes." "Everything flows through props." Clarity beats flow; the enemy is the rhetorical punch line, not the short sentence.
- **Honest and plain about trade-offs.** "This pattern is not something I invented." "ISR itself has trade-offs here." "This is a known limitation."
- **Some concrete, slightly colloquial texture is hers**, so don't sterilize: "shipping different red text", "popcorn UI", "hope you remember to tear it down".
- **Functional colons and inline lists are fine**: "the trade-offs these teams face: high cardinality, ISR limitations, and what cache components mean for it."
- **She'll coin and italicize a term** when it earns it (*popcorn UI*), and use "we" for a teaching walkthrough, "I" for her own experience.

The failure mode to avoid is the opposite of hers: a polished reflective essay with literary rhythm and neat closers.

## Source of truth

Never invent facts, numbers, PR titles, code, quotes, or claims about what she works on or how she works. Verify against, in order:

1. The actual code and repos (for example the project being written about, the relevant framework repo, `gh pr list --author aurorascharff`)
2. Her real data (logs, runs, merged PRs)
3. Published posts, for voice only

If you can't verify something, ask or leave it out. A confident wrong claim is the worst failure mode, and she checks. This is the rule that gets broken most; treat every plausible-sounding detail as something to confirm, not assume.

The full technical-writing rules live at `~/Documents/Development/front/.agents/skills/vercel-technical-writing/`. Read `SKILL.md` and `style-rules.md`; the anti-AI patterns below are the ones that matter most for the blog.

## Intro pattern

Short, one to two paragraphs:

1. State the topic or situation plainly. No "these days", no dramatic scene, no broad think-piece opener unless she asks for one.
2. A roadmap line: "In this post, I'll walk through ...".

Keep the background (the why, the mechanism) out of the intro. If it runs past two paragraphs, some of it belongs in a background section.

## Structure

- Headings in Title Case, descriptive not clever. "Background", "The Use Case", "The Problem: Dynamic Rendering" over "X, Not Y" turns of phrase.
- `## Table of contents` immediately after the intro, exactly that string. The TOC plugin keys on it.
- One idea per section; each stands on its own.
- Explain the progression between sections. When one piece follows another (the skill, then the sandbox it runs in, then the tasks), open the new section by saying why the last one made it necessary, so the build reads as one story instead of a parts list.
- Her section seams have a shape: end a section on the leftover need (often a "But..." / "Problem is..." sentence) or a short confirmation beat, and open the next by addressing exactly that. Openers state the point at once, a "Let's..." imperative in a walkthrough, a "We want to..." goal, a "Let's say we have..." setup, or a question that carries the prior result forward ("Now that X, the question is Y"). Reach back with a single clause, never a recap paragraph, and thread a shared subject (an API name, "the problem") across the seam. No "In this section we'll", no heading echo, no academic connectives, and no bare imperative openers like "Start with the error messages" or "Consider X" (the only imperative she opens on is "Let's...", in a walkthrough; in an experience report she opens on the content or a plain statement).
- When two kinds of information pair up (a before and an after, a finding and its fix, an option and its trade-off), a table or list is clearer than cramming them into one sentence.
- When a post builds several parallel examples, keep their structure consistent but vary the prose; don't reuse the same transition sentences between them.
- Introduce a usage or example section conversationally ("Let's say we wanted to X in a Y, where..."). Keep the progressive teaching sections on generic examples, and save specific use cases for the usage sections.
- Key takeaways are general principles, not restatements of the example. The conclusion should add something, not repeat earlier sections.
- Close with the standard sign-off (follow on Bluesky / X, "Happy coding! 🚀").
- Start from `src/content/blog/new-post-template.md`, or `new-post-template-mdx.mdx` for interactive React demos. Those scaffolds hold the frontmatter, the exact `## Table of contents` string, the image syntax (`![alt](@assets/…)`), and the MDX component-embedding mechanics. This skill is the source of truth for voice, so the templates point here instead of repeating style rules.

## Prose style

- Connected sentences that show the relationship (because, so, while), with short sentences to land a point.
- First person. Past tense for what she did, present tense for how things work.
- She leans on "we" more than "I", especially in explanatory and walkthrough passages (one reference post runs ~50 "we" to 7 "I"). Use "we"/"our" for work the team shares (the docs and error messages "we write") and for walking the reader through something; reserve "I" for her own initiative and specific contributions (a thing she built, a choice she made). When a sentence could go either way, prefer "we".
- Let code and real examples carry the weight; the prose points at them, it doesn't restate them.
- Prefer plain words over formal ones. She writes "the logs in this post", not "the excerpts"; "trimmed", not "excerpted". If a fancier word (excerpt, showcase, leverage, utilize) does no more than a plain one, use the plain one.
- Describe a process, don't list personal capabilities. "The task stays fixed and one thing changes" beats "I can hold the task fixed, and I can swap the model, and I can ...".
- Link a tool where it's used, with a short note on what it does and why. Linking once is the default, but re-linking in a later section is fine when a reader might land there without scrolling up and it wasn't just linked. Don't relist the same link in adjacent paragraphs.
- Open a paragraph so it introduces itself: start with what it's about and why it's here, so a reader landing on it gets the point without the paragraph before it. Don't open on a back-reference ("None of these got their own run", "They're small things...") that only parses if you already know the topic.
- When linking a guide or doc that has shipped, link the live page a reader can actually read (for Next.js, the rendered docs like `preview.nextjs.org/...`), not the GitHub PR. A PR link is for citing a specific change; a guide link is for reading.

## Code snippets

Snippets do a lot of the explaining in her posts. Match how she writes them:

- **Start most snippets with a file-path or context comment**: `// app/layout.tsx`, `// proxy.ts`, `// error.tsx`. It tells the reader where the code lives.
- **Keep each snippet to the one point** the surrounding paragraph makes. Abstract away CSS and unrelated markup, use generic elements.
- **Collapse the parts that don't matter** with `// ...` or `// ...fetch logic...` rather than showing them in full.
- **Use an inline comment to flag the key line**, the way she does: `const loggedIn = getIsAuthenticated(); // no await, no blocking`, `// Read from params instead of cookies()`.
- **Make snippets look real, not pseudocode.** Include the imports that matter, so the reader sees how it fits together.
- **Always tag the fence language** (```tsx, ```ts, ```bash, ```text). Use ```text for terminal output, build output, route tables, and file trees.
- **Show expected output when it makes the point** (a build table, a route listing, a printed error), in its own ```text block.
- **A before/after pair** is a pattern she reaches for when contrasting two approaches.
- Anything quoted verbatim (a real log, a terminal transcript) is data: keep it exact, and its em dashes and backticks are fine.

## Patterns that read as AI (never do these)

- **Em dashes, semicolons, and colons that splice clauses.** She doesn't use em dashes or semicolons at all, and uses a colon only to introduce a list or a code block, never to join two sentences ("That was my situation: good numbers..." should be a period or comma). Use commas, periods, or parentheses instead. (Punctuation inside quoted data, like a real log, is fine.)
- **"It's not X, it's Y"** and other tidy inversions. State the point directly.
- **Choppy declarative flourishes** dropped in as a punch line: "That's the whole game." Connect the idea into the sentence.
- **Repetitive series / tricolons**: "No config. No setup. No maintenance." Combine naturally.
- **See-saw balance**: "a developer routes around it, while an agent walks into the wall"; "the green line is X, the red is Y". Rephrase so it isn't a matched pair.
- **Signposting**: "The job behind all of this is the same", "Underneath, it's a memory thing", "It's worth noting that". Say the thing.
- **Over-explaining and self-justifying**: don't defend choices, don't announce what you're about to explain, don't add a disclaimer nobody asked for.
- **Presenting your own setup as a finished, handed-down feature**: stating a design choice as if it happens on its own, like "the agent gets a Vercel Sandbox per run" or "the run produces a log". She describes her own work as a choice or a capability, what you can do, not what the system does for you. Prefer "we can give the agent a sandbox" or "the agent can get a sandbox". The "X gets a Y" framing reads like a docs page announcing a settled thing.
- **Empty frame sentences that add length but no information**: a lead-in that only sets up the real sentence, like "None of these got their own run." before a list of findings, or "The thing to notice here is...". Cut the frame and start with the point, or fold it into the next sentence.
- **Describing an optional workflow as a fixed pipeline**: writing something she chose to do sometimes as if it ran every time, like "when a fix goes up, the same prompt runs against its preview before it merges". Her setup was a mix of automated and manual, and it was up to her what felt worth testing. Frame it as a capability she could reach for ("I could point a run at the preview"), not a routine that always happens.
- **Gratuitous counts**: telling the reader how many when the number carries nothing, like "three calls do everything", "one command", "four routes". Say what it does, not how many. Real load-bearing numbers (a build that failed twice, a run's severity counts) are fine.
- **Explaining a mechanism before the reader needs it**: introducing a snapshot-refresh scheme before anything has been built, or naming "the logs" before logging exists, lands as noise. Introduce each mechanism at the point it does work in the story, not earlier.
- **Superlatives and hype**: "the truest test", "unusually honest", "surprisingly good".
- **Literary flourishes**: "the friction quietly disappears", "the bot finally grew up", "the detours end up on paper". Say it plainly.
- **Aphorism closers**: don't end a section or the post on a neat one-liner. Let the last real point be the ending, then the standard sign-off.
- **Generalizing "every" and "each"**: "every prompt is a task", "each run shows its log", "check every quoted output". She hates these; they read as AI. Rephrase with a plural, with "the", or drop the quantifier ("runs start from identical state", "the log header records"). Natural idioms like "everything went fine" are fine.
- **Minimizing and filler words**: just, very, simply, basically, obviously, seamless, robust, leverage, utilize, "in order to".
- **Inline colon introducing a list mid-sentence** when it's really a list. Use "including" or a real list.

## What Aurora has asked for

- Don't overstate scope. Check her PRs before describing her work; verify the claim against a real source rather than writing what sounds right.
- Read the whole post for contradictions. Claims across sections have to line up; if two paragraphs disagree, find the real distinction and state it once.
- Prefer real excerpts (real runs, real PR numbers, real quoted text) over invented examples.
- Stay honest and non-promotional about tools without saying that you're being honest.
- Show, don't tell: a real snippet or a trimmed real artifact beats a description of one.
- **Never describe how she works, reads, or does something unless you've confirmed it.** Inventing her behavior or workflow to make a point land is worse than leaving it out.

## Before finishing (also a review checklist)

- [ ] Every claim about her work, PRs, numbers, or behavior is verified against a real source
- [ ] Intro is one to two paragraphs: topic plus roadmap
- [ ] No em dashes in prose, no "it's not X, it's Y", no choppy flourishes, no signposting, no aphorism closer
- [ ] No just / very / simply / hype words in prose
- [ ] Snippets have file-path comments, tagged fences, and are trimmed to the point
- [ ] Paired information (before/after, finding/fix) is a table or list, not a run-on sentence
- [ ] It reads like the other posts in `src/content/blog`, not a docs page or an AI essay
- [ ] `npx astro build` passes
