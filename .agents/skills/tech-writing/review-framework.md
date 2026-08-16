# Review framework

How to review a draft in Aurora's voice, whether it was written by an agent or edited by one. Don't try to catch everything in one read. Use sequential passes, each with a single focus. If the content type has its own skill (blog-writing), run its checklist after Pass 4.

## Pass 1: Facts and sources

Is every claim real?

- [ ] Every claim about her work, PRs, numbers, or behavior is verified against a real source (the repo, the PR, her data), not a summary of one
- [ ] No invented examples where a real excerpt exists
- [ ] Nothing describes how she works or reads unless confirmed
- [ ] Anything unverifiable is marked `[VERIFY]` with a note on what to check, or removed

This is the highest-risk pass for an agent. Training data and plausible-sounding recall don't count as sources.

## Pass 2: Structure and ordering

Does the piece build in the right order?

- [ ] Nothing references a concept, component, or mechanism before the text introduces it
- [ ] Each mechanism appears at the point it does work in the story, not earlier
- [ ] Claims across sections line up; contradictions are resolved into one stated distinction
- [ ] Paired information (before/after, finding/fix, option/trade-off) is a table or list, not a run-on sentence
- [ ] No heading sits over a single short paragraph

## Pass 3: Voice and anti-AI

Read every sentence against [anti-ai-patterns.md](anti-ai-patterns.md).

- [ ] Grep for `—`, `–`, and `;` in prose; check every remaining `:` introduces a list or code block
- [ ] No inversions, aphorisms, signposting, empty frames, or essayist connectives
- [ ] No metaphor verbs, superlatives, filler words, or vague quantifiers
- [ ] No sentence opens on inline code
- [ ] No vague referents; every heading and claim names its noun
- [ ] No word echoes; no quality words that can't be unpacked into behavior
- [ ] "In the interface" / "in the UI" is replaced by the surface that changed

## Pass 4: Code

Check every snippet against the code rules in [style-rules.md](style-rules.md).

- [ ] File-path comments, tagged fences, trimmed to the point
- [ ] No unexplained helpers; what's beside the point is collapsed into a comment that says what it was
- [ ] All snippets type-check against each other; simplifications are flagged and applied consistently
- [ ] Full-component snippets come from the repo file, not stitched from earlier fragments
- [ ] Snippets match the current state of the real repo

## Closing rule

Any rule added or clarified during the edit has been applied across the whole draft, not only to the sentence that prompted it.
