# Style rules

Sentence-level and snippet-level rules for anything written in Aurora's voice. The [anti-AI patterns](anti-ai-patterns.md) are the corresponding never-do list.

## Prose

- Connected sentences that show the relationship (because, so, while), with short sentences to land a point.
- First person. Past tense for what she did, present tense for how things work.
- She leans on "we" more than "I", especially in explanatory and walkthrough passages. Use "we"/"our" for shared work and for walking the reader through something; reserve "I" for her own initiative and specific contributions. When a sentence could go either way, prefer "we".
- Let code and real examples carry the weight; the prose points at them, it doesn't restate them.
- Divide the work around a snippet. The lead-in explains why we need the code and introduces the new idea. The paragraph after it explains the resulting behavior or trade-off. Don't narrate the arguments line by line or repeat the same result on both sides.
- Prefer direct containment over empty API framing. Write "we can handle a failed save inside the callback" instead of saying that a callback "gives us a place" to handle it.
- Name the surface, not the abstraction. "On screen", "in the sidebar", "in the box" — never "in the interface" or "in the UI" when a concrete part of the app changed.
- Prefer plain words over formal ones. "The logs in this post", not "the excerpts"; "trimmed", not "excerpted". If a fancier word (excerpt, showcase, leverage, utilize) does no more than a plain one, use the plain one.
- Describe a process, don't list personal capabilities. "The task stays fixed and one thing changes" beats "I can hold the task fixed, and I can swap the model, and I can ...".
- Link a tool where it's used, with a short note on what it does and why. Linking once is the default; re-linking in a later section is fine when a reader might land there directly. Don't relist the same link in adjacent paragraphs.
- Open a paragraph so it introduces itself: start with what it's about and why it's here. Don't open on a back-reference ("None of these got their own run") that only parses if you already know the topic.
- Don't open a sentence with inline code (a function, API, hook, or config-flag name). Lead with a word and put the code mid-sentence: "Turning on `cacheComponents` gives you an instant shell". A definition-style bullet list may start each item on the name it defines ("- `useTransition()` provides a pending state..."), which is a shape she uses.
- No vague referents. "The simplest one", "that changes things", or a heading like "Driving It from the URL" leave the reader asking what one, what things, what it. Name the noun, and always in headings.
- Watch for word echoes: the same distinctive word landing twice in close range. Vary the word or restructure one of the sentences.
- A quality word has to mean something concrete in context. "The search field stays instant" says nothing; "renders in the static shell and keeps focus while results stream" says what happens. If a claim can't be unpacked into behavior, replace it with the behavior.
- When two kinds of information pair up (a before and an after, a finding and its fix, an option and its trade-off), a table or list is clearer than cramming them into one sentence.
- When a claim needs a quantity, give the real number or qualify it honestly ("up to", "approximately"). No vague quantifiers ("significantly", "dramatically") and no decorative counts (see anti-AI patterns).

## Punctuation and mechanics

- No em dashes, no semicolons, anywhere in prose. A colon only introduces a list or a code block, never joins two sentences. Use commas, periods, or parentheses instead. (Punctuation inside quoted data, like a real log, is fine.)
- Oxford commas.
- Spell out an abbreviation on first use unless it's universal (HTML, CSS, API, URL).
- Inline code for identifiers, file paths, config values, and commands. Function references in prose take parentheses: `usePathname()`.

## Code snippets

Snippets do a lot of the explaining. Match how she writes them:

- **Start most snippets with a file-path or context comment**: `// app/layout.tsx`, `// proxy.ts`. It tells the reader where the code lives.
- **Keep each snippet to the one point** the surrounding paragraph makes. Abstract away CSS and unrelated markup, use generic elements.
- **Collapse the parts that don't matter** with `// ...` or `// ...fetch logic...` rather than showing them in full.
- **Keep the structural outline when it helps explain the pattern.** For a switch statement, route tree, provider, or group of handlers, show the cases or entry points and collapse the implementation inside the parts that are not being discussed.
- **Don't leave unexplained helpers in a snippet.** An identifier should be introduced, obvious from the platform, or central to the pattern. What counts as a distraction depends on the piece: in one about coordinating optimistic updates, the database write inside a Server Function is noise and belongs in a comment saying what was left out; in a piece about the write itself, those lines are the subject. Decide per piece, and don't pull in a helper the text never explains just to make a snippet look fuller.
- **Use an inline comment to flag the key line**: `const loggedIn = getIsAuthenticated(); // no await, no blocking`.
- **Make snippets look real, not pseudocode.** Include the imports that matter. Code blocks should work when copied; if a value needs replacing, make the placeholder obvious.
- **Use the real app's code.** Snippets are trimmed mini versions of the actual repo components with their real names (`Feed`, `SearchShell`), not generalized `ServerComponent`/`getData` stand-ins. Verify snippets against the repo before publishing, since the app keeps evolving.
- **All snippets in a piece must type-check against each other.** If a hook is defined with one argument, every later call site uses one argument. When the text simplifies the real implementation, flag it in code (`// Simplified without recurring events`) or prose ("simplified here from Huddle's transaction"), and keep every subsequent snippet consistent with the simplified version. Mention the real version's extras in prose where relevant; don't silently mix them into call sites.
- **Assemble a full-component snippet from the repo file, not by stitching the text's own earlier fragments.** A stitched version is internally consistent and still wrong, and tends to carry values the render never uses. If you can't read the real file, assemble what the text already shows, leave out what you'd have to guess, and say which parts to check.
- **Drop comments that carry no information.** Keep the file-path comment and key-line flags. No decorative annotations (no `←` arrows); the explanation lives in the prose.
- **Always tag the fence language** (```tsx, ```ts, ```bash, ```text). Use ```text for terminal output, build output, route tables, file trees, and verbatim prompts or commands.
- **Show expected output when it makes the point** (a build table, a printed error), in its own ```text block.
- **A before/after pair** is a pattern she reaches for when contrasting two approaches.
- Anything quoted verbatim (a real log, a terminal transcript) is data: keep it exact, and its em dashes and backticks are fine.
