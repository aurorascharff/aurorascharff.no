---
name: blog-writing
description: Writing, editing, or reviewing blog posts on aurorascharff.no (src/content/blog). Post structure, frontmatter, walkthrough conventions, images, MDX demos, and update sections. Builds on the tech-writing skill, which holds the voice and snippet rules.
metadata:
  author: aurora
  version: "2.0.0"
---

# Blog writing

For any post under `src/content/blog`. First read the tech-writing skill at [../tech-writing/SKILL.md](../tech-writing/SKILL.md) and its style-rules.md and anti-ai-patterns.md — they hold the voice, prose style, and snippet conventions, and its review-framework.md applies to every post. This skill adds what a post on this blog is.

Before writing, read two or three existing posts **end to end** and match their rhythm. `error-handling-in-nextjs-with-catch-error`, `the-precompute-pattern-*`, and `component-architecture-for-react-server-components` are the best references. Don't work from the intros alone; the body is where the voice lives.

## Audience

Posts start from the simplest version that could work so everyone can follow the build, but the reader is an intermediate-to-advanced React/Next.js developer. Starting simple is how a post teaches, not the level it targets. Never simplify a definition or drop a constraint to sound approachable; link the actual rules (react.dev, nextjs.org) when introducing a concept.

## Scaffold

New posts start from this frontmatter (there is no template file; this is the template):

```yaml
---
author: Aurora Scharff
pubDatetime: 2026-01-01T10:00:00Z
title: Your Blog Post Title Here
slug: your-blog-post-title-here
featured: false
draft: true
tags:
  - Next.js 16
description: A concise 1-2 sentence description. Used for SEO and post excerpts.
---
```

- `modDatetime` is added only when a published post is updated.
- Use a `.md` file by default. Use `.mdx` for posts with interactive React demos (see MDX below).

**Images and GIFs**: place them in `src/assets/` and reference with `![Alt text describing the demo](@assets/my-demo.gif)`. Every image gets meaningful alt text and sits where it's discussed.

**MDX posts** (interactive demos):

- Import demo components with relative paths and `.tsx` extensions: `import MyDemo from "../../components/examples/MyDemo.tsx";`
- Render with `<MyDemo client:load />` to hydrate on the client, or `client:visible` to defer hydration until scrolled into view.
- Wrap demo internals with the `DemoContainer` component (`src/components/examples/DemoContainer.tsx`) for CSS isolation from the prose wrapper; it uses `all: revert` to restore browser defaults.
- Keep demo components in `src/components/examples/`, stripped-down with no custom CSS, matching the code shown in the post.

## Intro pattern

Short, one to two paragraphs:

1. State the topic or situation plainly. No "these days", no dramatic scene, no broad think-piece opener unless she asks for one.
2. A roadmap line: "In this post, I'll walk through ...".

Keep the background (the why, the mechanism) out of the intro. If it runs past two paragraphs, some of it belongs in a background section.

## Structure

- Headings in Title Case, descriptive not clever. "Background", "The Use Case", "The Problem: Dynamic Rendering" over "X, Not Y" turns of phrase.
- `## Table of contents` immediately after the intro, exactly that string. The TOC plugin keys on it.
- One idea per section; each stands on its own.
- Explain the progression between sections. When one piece follows another, open the new section by saying why the last one made it necessary, so the build reads as one story instead of a parts list.
- Her section seams have a shape: end a section on the leftover need (often a "But..." / "Problem is..." sentence) or a short confirmation beat, and open the next by addressing exactly that. Openers state the point at once, a "Let's..." imperative in a walkthrough, a "We want to..." goal, a "Let's say we have..." setup, or a question that carries the prior result forward. Reach back with a single clause, never a recap paragraph, and thread a shared subject across the seam. No "In this section we'll", no heading echo, no academic connectives, and no bare imperative openers like "Start with the error messages" (the only imperative she opens on is "Let's...", in a walkthrough).
- Put each image, code block, or example where it's discussed. Introduce a block, then show it. Don't strand a screenshot at the end of a section it illustrated at the top.
- Never end a section on a code block. After the last snippet, add a bridge line before the next heading: a short confirmation beat ("That works, and it's usually all you need.") or a continuation of the build.
- Bridges narrate the build in progress and carry its state forward, in her collaborative register: "Now that we have the page in the URL, we can use it in a Server Component to load the data." Never a detached declaration of remainder: "What's left is the feed itself".
- The build advances in "we can" moves: "we can render it inside a `Suspense` boundary". Don't introduce a step as a settled declarative ("we render it"); declaratives are for describing code already shown.
- Keep the walkthrough voice collaborative all the way through an implementation. Background and existing architecture can use declarative prose. When the next snippet adds or changes behavior, move with the reader using "let's", "we can", "now", or "instead" and say why we are making that change. After the snippet, declarative prose can describe what the code now does.
- Vary collaborative bridges without dropping the collaborative point of view. Use the concrete need to shape the bridge: "Now that we have the reducer...", "To keep the controls responsive...".
- Avoid headings over a single short paragraph. Widen the section to include the code that demonstrates it, or fold it into a neighbor.
- When a post builds several parallel examples, keep their structure consistent but vary the prose; don't reuse the same transition sentences between them.
- Feature walkthroughs are problem-driven. Open on the goal, show the basic or obvious version, hit the concrete problem, then derive the fix, and repeat until the feature is done. Never introduce a helper before the problem that motivates it exists, and don't pre-reveal the final design in the opener.
- Stop a use-case setup after the goal and the relevant component path are clear. Introduce implementation details in the step where the reader needs them, never earlier. Nothing in a post references a concept, component, or hook the post hasn't introduced yet; a forward reference is only an anchored promise, "We'll come back to that [later in the post](#anchor)", revealing nothing else.
- When the lineage of a pattern matters, keep it separate from the walkthrough. A short source list can connect the sources without turning the use-case paragraph into a history lesson. Don't claim that something was the first unless that can be verified.
- Establish the component path before introducing a nested consumer. If the prose moves from a page to a board to a popover, show that relationship with a short composition snippet.
- Give a component or hook its role in the sentence that first names it, and don't name one that never comes back. "The hook that owns the grid's drag, resize, and selection state" places it; a bare destination name tells the reader nothing.
- Introduce a component by naming what the app renders and where. "Huddle renders the sidebar in a `ChannelNav` Client Component" over "The part we are going to change is `ChannelNav`."
- In a multi-feature post, every feature section closes the same way: a "The Full" H3 holding the assembled code, with the component name in backticks in the heading, a "This way, ..." sentence stating what the approach buys, then "**Try it:** [live link]. **Code:** [file link]." The demo app's name and links belong in the intro, the Try-it lines, and the conclusion, not in section openers.
- Skip the Full section when the component was already shown whole earlier and assembling it again would only repeat that snippet, but keep the "This way, ..." sentence and the Try-it line.
- When one of her posts already covers the background, link that post instead of re-explaining, and cite external sources through her post when she has already built on them.
- Introduce a usage or example section conversationally ("Let's say we wanted to X in a Y, where..."). Keep the progressive teaching sections on generic examples, and save specific use cases for the usage sections.
- When linking a guide or doc that has shipped, link the live page a reader can actually read, not the GitHub PR. A PR link is for citing a specific change.
- Key takeaways are general principles, not restatements of the example. The conclusion should add something, not repeat earlier sections.
- Close with the standard sign-off: "I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀"

## Update sections

Material added after publishing goes in a `## Update: X` section before the Conclusion. It opens "Since writing this post, ..." and states the shipping status plainly ("It's unmerged and prefixed with `unstable_` as I write this, so treat the code as a preview, not something to ship yet."). Apply the new thing to the post's own example rather than re-teaching it from scratch, and reference anything above freely, since the whole post precedes it. Add `modDatetime` to the frontmatter. The Conclusion may gain one sentence pointing at the update.

## Before finishing (also a review pass)

Run the tech-writing review framework (all four passes), then:

- [ ] Intro is one to two paragraphs: topic plus roadmap
- [ ] Walkthroughs hit the problem before the fix; no helper introduced before it's motivated; nothing references context the post hasn't introduced yet
- [ ] Components are introduced before their consumers or hooks, and every one named in prose carries its role
- [ ] Feature sections close with the Full `Component` code (unless already shown whole), a "This way, ..." sentence, and the Try-it / Code line
- [ ] Any "a framework could provide this" note names what is generic and who could provide it (React or Next.js, never a client data library), two sentences in the conclusion, no heading of its own
- [ ] It reads like the other posts in `src/content/blog`, not a docs page or an AI essay
- [ ] `npx astro build` passes
