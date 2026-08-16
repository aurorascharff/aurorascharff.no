# Patterns that read as AI (never do these)

The tells Aurora flags in drafts. Every one of these has been rejected in a real edit. When one appears, rewrite the sentence's structure; swapping the flagged word for a sibling keeps the same rhythm and stays wrong.

## Punctuation and rhythm

- **Em dashes, semicolons, and colons that splice clauses.** She doesn't use em dashes or semicolons at all, and uses a colon only to introduce a list or a code block, never to join two sentences. Use commas, periods, or parentheses instead. (Punctuation inside quoted data is fine.)
- **Comma splices**: two independent clauses joined by a bare comma. Fix with a period, a conjunction, or a rephrase that folds them into one clause. Read it aloud: if it doesn't flow, the comma is doing a job it can't.
- **Choppy declarative flourishes** dropped in as a punch line: "That's the whole game." Connect the idea into the sentence. Don't produce choppy staccato as a workaround for a banned mark either.
- **Repetitive series / tricolons**: "No config. No setup. No maintenance." Combine naturally.
- **Stacked negations as a payoff**: two "no X" clauses in a row read as marketing rhythm. State one payoff, or fold the point into a positive clause.
- **See-saw balance**: "a developer routes around it, while an agent walks into the wall". Rephrase so it isn't a matched pair.

## Inversions, aphorisms, and framing

- **"It's not X, it's Y"** and other tidy inversions, including the trailing "..., not just a shell" form and the aphoristic flip ("The order of the writes is not the problem here, the layout they were calculated from is."). State the point directly and stop.
- **Aphorism closers and mid-body maxims**: don't end a section on a neat one-liner, and don't drop one in as a summary ("Routing can't replace application data."). Let the concrete point stand.
- **Signposting and framing inflation**: "The job behind all of this is the same", "It's worth noting that", "That is what makes it interesting", "is worth a note". Say the thing, or show why it matters: "The reason this matters for prerendering: ...".
- **Empty frame sentences**: a lead-in that only sets up the real sentence ("The thing to notice here is..."). Cut the frame and start with the point.
- **Over-explaining and self-justifying**: don't defend choices, don't announce what you're about to explain, don't add a disclaimer nobody asked for.
- **Essayist connectives and stock words**: "wrinkle", "Crucially,", "the fix is", "the common thread", "I want to be upfront", "sharpens the constraint". Prefer her plain moves: "However, ...", "Notice that ...", "Instead, we can ...".

## Verbs and vocabulary

- **Literary flourishes and metaphor verbs**, especially dressing up abstract things with figurative verbs: "the friction quietly disappears", "where it pays off", "the tabs describe themselves", "params landing in the result". Say it plainly with a concrete verb: "the case it helps", "the tabs are built from the route pattern", "without reading the params".
- **Superlatives and hype**: "the truest test", "unusually honest", "surprisingly good".
- **Minimizing and filler words**: just, very, simply, basically, obviously, seamless, robust, leverage, utilize, "in order to".
- **Breezy "straight from" phrasing**: "served straight from the edge". State the mechanism plainly: "its result is cached and reused".
- **Generalizing "every" and "each"**: "every prompt is a task", "each run shows its log". Rephrase with a plural, with "the", or drop the quantifier. Natural idioms like "everything went fine" are fine.
- **Gratuitous counts**: "three calls do everything", "one command". Say what it does, not how many. Real load-bearing numbers are fine.
- **Vague scale filler**: "a whole screen of links", "a ton of requests". Name the concrete thing instead.

## Framing the work

- **Passive scene-setting**: "The part we are going to change is...". Start with the component and its role: "Huddle renders the sidebar in `ChannelNav`."
- **Generic causal justification**: "Dragging requires event handlers, so this is a Client Component." Name the component's role and show the boundary. Explain the constraint only when it changes the architecture.
- **Presenting your own setup as a finished, handed-down feature**: "the agent gets a Vercel Sandbox per run". Describe her work as a choice or a capability: "we can give the agent a sandbox".
- **Describing an optional workflow as a fixed pipeline**: writing something she chose to do sometimes as if it ran every time. Frame it as a capability she could reach for, not a routine.
- **Explaining a mechanism before the reader needs it**: introducing a scheme before anything has been built lands as noise. Introduce each mechanism at the point it does work in the story, not earlier.
- **Inline colon introducing a list mid-sentence** when it's really a list. Use "including" or a real list.
