---
author: Aurora Scharff
pubDatetime: 2026-07-24T10:00:00Z
title: "UX Patterns in Next.js: Load More, Instant Search, and Draft Preview"
slug: ux-patterns-in-nextjs-load-more-instant-search-and-draft-preview
featured: false
draft: true
tags:
  - Next.js 16
  - React Server Components
  - Server Functions
  - Composition
  - Suspense
  - User Experience
description: "A few Server Component patterns from a small app on the Next.js 16 preview: a load more button that leans entirely on the URL, a search input that stays instant while results stream, and rendering a Server Component on demand with a Server Function."
---

I've been building [Drop](https://next16-social-media.vercel.app/), a little social app, on the [Next.js 16.3 Instant Navigations preview](https://nextjs.org/blog/next-16-3-instant-navigations). I keep running into patterns worth sharing as I make it better and experiment with what the preview can do. Along the way I learn something new about Server Components, composition, and building a good user experience on top of them. This post collects a few of them.

None of this is the only way to build these features, and often not even the necessary way. The basic versions are simpler and perfectly fine. It's really an exercise in seeing how far you can push the Server Component and Server Function model, and how much of the work you can keep on the server, which I find genuinely fun to play with. If you want the fundamentals first, this builds on [Server and Client Component Composition in Practice](https://aurorascharff.no/posts/server-client-component-composition-in-practice/): keep data fetching and rendering on the server, and pass the server-rendered output as `children` into a small client component that owns the interaction. Everything below takes that idea a little further.

We'll build:

- a **load more button** that does no data fetching of its own, only pushing a `?page=` URL and letting the server stream the next page
- a **search field** that renders instantly as part of the static server shell, then stays mounted and keeps its focus while the results stream and fade in below it
- a **draft preview** rendered on demand by a Server Function that returns an already-rendered Server Component

## Table of contents

## Why Keep the Work on the Server?

The thread running through all of these is doing the rendering on the server and keeping the client thin. A Server Component fetches its data and renders on the server, and only the finished output reaches the browser:

```tsx
// runs on the server, ships no JavaScript to the client
async function Drops() {
  const drops = await getDrops();
  return drops.map(drop => <Drop key={drop.id} drop={drop} />);
}
```

Because that output is in the HTML from the first paint, it shows up instantly, with no client-side fetch and no round-trip after hydration. The code that produced it never reaches the browser either.

With streaming, the static parts of the page arrive right away while the dynamic parts fill in behind `Suspense`. The client is left with only the interaction that genuinely has to run in the browser.

## Load More, Driven by the URL

Let's start with the simplest one. Drop's feed has a Load more button that does no data fetching of its own, it's a client component only because it wants a pending state while the next page loads. The rest is the URL and the server. Let's build it from the data up.

### Step 1: Put the page number in the URL

The feed is keyed on a `?page=` param. The page reads it and the feed renders pages `1` through `N`, each as its own async Server Component inside a `Suspense` boundary:

```tsx
// features/drop/components/feed.tsx
export async function Feed({ page = 1 }: { page?: number }) {
  return (
    <ul>
      {Array.from({ length: page }).map((_, i) => {
        const p = i + 1;
        const isLast = p === page;
        return (
          <Suspense key={p} fallback={<DropListSkeleton count={3} />}>
            <FeedPage page={p} isLast={isLast} />
          </Suspense>
        );
      })}
    </ul>
  );
}
```

Because each page has its own boundary, a newly requested page streams in under a skeleton while the earlier pages stay exactly where they are.

### Step 2: Each page renders its own drops, and the last one renders the button

Each `FeedPage` fetches and renders its slice of drops. If it's the last page and there's more to load, it renders the button pointing at the next page:

```tsx
async function FeedPage({ page, isLast }: { page: number; isLast: boolean }) {
  const { items, hasMore } = await getFeed(page);
  return (
    <>
      {items.map(item => (
        <li key={item.drop.id}>
          <Drop drop={item.drop} />
        </li>
      ))}
      {isLast && hasMore ? (
        <li className="flex justify-center p-6">
          <LoadMore href={`/?page=${page + 1}`} />
        </li>
      ) : null}
    </>
  );
}
```

### Step 3: The button only navigates

Now the button. All it does is push the next `?page=` URL inside a transition, so it can show a pending state while the server streams the new page:

```tsx
// components/ui/load-more.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function LoadMore({ href }: { href: Route }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.push(href, { scroll: false });
        });
      }}
    >
      {isPending ? 'Loading…' : 'Load more'}
    </button>
  );
}
```

That's the entire button. It holds no list state and does no fetching of its own, it only changes the URL and lets the server render the rest.

Because the page number lives in the URL, load more survives a refresh and is shareable. A cold load of `?page=3` renders three pages on the server. The only thing the client contributes is the transition that keeps the button responsive while the next page streams in.

**Try it:** [open the Drop feed](https://next16-social-media.vercel.app/) and hit Load more. **Code:** [`feed.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/drop/components/feed.tsx).

## Making Search Feel Instant

Next, search. In Drop, search results stream from the server, but the input around them has to stay put. It should render right away, keep focus while you type, and never remount when the results change.

The basic pattern for this is well trodden, and I've reached for it plenty of times: put the query in the URL, render a client input that reads it with `useSearchParams` and pushes to the router on change, then wrap the results in `Suspense`.

```tsx
'use client';

function SearchInput() {
  const router = useRouter();
  const q = useSearchParams().get('q') ?? '';
  return (
    <input
      defaultValue={q}
      onChange={e => router.replace(`/search?q=${encodeURIComponent(e.target.value)}`)}
    />
  );
}
```

That works, and it's usually all you need. But Drop runs with [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) enabled, which sharpens the constraint. Reading `searchParams` is dynamic, so anything that touches it has to sit below a `Suspense` boundary, and `useSearchParams` itself reads as empty until the client takes over. If we want the input to be truly instant, rendered as part of the static shell before any data resolves, it has to live *above* that boundary, where the query isn't available yet.

So we can't hand the query to the input as a prop or await it in the page. Let's build the search around that constraint: the input stays mounted once, uncontrolled, in a small client shell, with the streamed results passed into it as `children`. Let's build it up in steps.

### Step 1: A client shell that holds the input

First, we pull the input out into a client component that takes `children`. This is the piece that stays mounted across navigations:

```tsx
// features/search/components/search-shell.tsx
'use client';

export function SearchShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <>
      <input
        type="search"
        name="q"
        placeholder="Search drops…"
        onChange={event => {
          const value = event.target.value;
          router.replace(value ? `/search?q=${encodeURIComponent(value)}` : '/search', { scroll: false });
        }}
      />
      {children}
    </>
  );
}
```

The input writes the query to the URL on every keystroke, but the shell itself never depends on the query. It renders once and stays put.

### Step 2: Pass the streamed results in as children

Now the page renders the shell once and passes the results into it as `children`. Crucially, the page is **not** `async`, it never awaits `searchParams`. It passes the promise down and resolves it with `.then()` *inside* a `Suspense` boundary, so the shell stays in the static, instant part of the page while only `SearchResults` is dynamic:

```tsx
// app/search/page.tsx
export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <SearchShell>
      <Suspense fallback={<DropListSkeleton count={3} />}>
        {searchParams.then(sp => {
          const q = typeof sp.q === 'string' ? sp.q : '';
          if (!q) return <EmptyState title="Search drops" body="Type something to search." />;
          return <SearchResults query={q} />;
        })}
      </Suspense>
    </SearchShell>
  );
}
```

Because `SearchResults` is passed as a child, it re-renders on the server when the query changes, but the shell holding the input does not. The input keeps its identity, and therefore its focus and cursor position, while the results underneath it swap out.

The `SearchResults` component itself is a plain async Server Component. It fetches on the server and renders the output, no client JavaScript involved:

```tsx
// features/search/components/search-results.tsx
export async function SearchResults({ query }: { query: string }) {
  const [users, drops] = await Promise.all([searchUsers(query), searchDrops(query)]);

  if (users.length === 0 && drops.length === 0) {
    return <EmptyState title="No results" body={`Nothing matched "${query}".`} />;
  }

  return (
    <>
      {users.map(user => (
        <UserRow key={user.handle} handle={user.handle} displayName={user.displayName} />
      ))}
      <DropList drops={drops} />
    </>
  );
}
```

### Step 3: Dim the results while the next query is on its way

Right now the results pop in when they're ready. To make it feel intentional, we can dim them while the next query streams. A transition gives us `isPending`, and a data attribute drives the fade with CSS:

```tsx
// features/search/components/search-shell.tsx
export function SearchShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <input
        type="search"
        name="q"
        placeholder="Search drops…"
        onChange={event => {
          const value = event.target.value;
          startTransition(() => {
            router.replace(value ? `/search?q=${encodeURIComponent(value)}` : '/search', { scroll: false });
          });
        }}
      />
      <div className="transition-opacity data-pending:opacity-60" data-pending={isPending ? '' : undefined}>
        {children}
      </div>
    </>
  );
}
```

The stale-while-loading part comes for free from the App Router: it runs every navigation inside a transition, so React keeps the previous results on screen while the new ones load, instead of dropping to the skeleton on each keystroke. In plain React you'd reach for `useTransition` yourself to get that behavior. Here we only want the `isPending` flag it gives us, which drives the fade while the next results stream in.

### Step 4: Seed the input without awaiting the URL

Putting the input above the boundary has a cost. The shell renders before `searchParams` resolves, so it can't start with the current query already in the box. For shared links and refreshes we still want someone opening `/search?q=react` to see `react` in the box. We seed it in two places.

For cold loads, a tiny inline script runs during HTML parsing, before the browser paints, and sets the value straight from the URL:

```tsx
// components/scripts/seed-from-search-param.tsx
export function SeedFromSearchParam({ targetId, param }: { targetId: string; param: string }) {
  const html = `(function(){
  var el = document.getElementById(${JSON.stringify(targetId)});
  if (!el) return;
  var v = new URLSearchParams(location.search).get(${JSON.stringify(param)});
  if (v) el.value = v;
})()`;
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

The `type` flips to `text/plain` on the client so the script is inert after that first paint, it only ever runs once, during the server-streamed HTML. Because the DOM already carries the value, the input needs `suppressHydrationWarning` so React doesn't flag the mismatch when it hydrates. This is the same seeding trick I covered in depth in [Building an Active NavLink Component](https://aurorascharff.no/posts/building-an-active-navlink-component-in-nextjs/#preventing-flickering-on-first-paint), and it avoids the hydration mismatch the same way. It's also how Next.js recommends [preventing a flash before hydration](https://nextjs.org/docs/app/guides/preventing-flash-before-hydration).

Soft navigations are the second case, and this is where `cacheComponents` comes in. To make navigation instant, Next.js keeps recently visited routes mounted with React's [`<Activity>`](https://react.dev/reference/react/Activity) instead of unmounting them, which [preserves their DOM and state](https://nextjs.org/docs/app/guides/preserving-ui-state) so back navigation restores exactly what you left. That's usually what you want, but it means navigating back to search can bring back an input value that no longer matches the URL. A layout effect re-syncs it to the param before paint:

```tsx
// hooks/use-sync-input-to-search-param.ts
'use client';

export function useSyncInputToSearchParam(ref: RefObject<HTMLInputElement | null>, param: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = new URLSearchParams(window.location.search).get(param) ?? '';
  }, [ref, param]);
}
```

### Putting the shell together

Here's the shell with the transition, the fade, and both seeding paths wired in:

```tsx
// features/search/components/search-shell.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useTransition } from 'react';
import { SeedFromSearchParam } from '@/components/scripts/seed-from-search-param';
import { useSyncInputToSearchParam } from '@/hooks/use-sync-input-to-search-param';

export function SearchShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [isPending, startTransition] = useTransition();

  useSyncInputToSearchParam(inputRef, 'q'); // re-sync on soft navigations

  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        name="q"
        placeholder="Search drops…"
        suppressHydrationWarning
        onChange={event => {
          const value = event.target.value;
          startTransition(() => {
            router.replace(value ? `/search?q=${encodeURIComponent(value)}` : '/search', { scroll: false });
          });
        }}
      />
      <SeedFromSearchParam targetId={inputId} param="q" /> {/* seed on cold loads, during HTML parse */}
      <div className="transition-opacity duration-200 ease-out data-pending:opacity-60" data-pending={isPending ? '' : undefined}>
        {children}
      </div>
    </>
  );
}
```

The only client-side piece is the input and the transition around it. Everything below it is server-rendered and streamed in as `children`.

**Try it:** [search in Drop](https://next16-social-media.vercel.app/search) and watch the input stay put while results stream and fade. **Code:** [`search-shell.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/search/components/search-shell.tsx).

## Previewing a Draft on the Server

The last pattern comes from Drop's quick composer, the small form at the top of the feed where you write a drop. It has a Preview toggle, and switching to Preview should render your draft exactly the way it will look once posted.

The composer is a client component that owns the textarea, the toolbar, and the write/preview toggle. In write mode it shows the textarea, and in preview mode it swaps in the rendered draft:

```tsx
// features/drop/components/quick-drop-form.tsx
'use client';

export function QuickDropForm({ avatar }: { avatar: React.ReactNode }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [preview, setPreview] = useState<Preview | null>(null);

  return (
    <form action={submitAction}>
      {avatar}
      {mode === 'write' ? (
        <textarea ref={textareaRef} name="body" placeholder="What did you build today?" />
      ) : (
        <Suspense key={preview?.body} fallback={<PreviewSkeleton />}>
          <DropPreview preview={preview} />
        </Suspense>
      )}
      <ToolbarButton label="Preview" onClick={showPreview}>
        <Eye className="h-4 w-4" />
      </ToolbarButton>
      <Button type="submit">Drop it</Button>
    </form>
  );
}
```

In the feed, a drop body is rendered by a Server Component, `DropBody`, which highlights code blocks with [Shiki](https://shiki.style/) on the server:

```tsx
// features/drop/components/drop-body.tsx
export function DropBody({ body }: { body: string }) {
  const segments = splitCode(body);
  // renders paragraphs, links, and Shiki-highlighted code blocks
}
```

For the preview to match the posted drop exactly, it should go through that same `DropBody`. But here's the problem: the composer is a client component, so it can't call `DropBody` directly, it runs server-only code (Shiki, and everything it pulls in). And I didn't want to ship a second, client-side renderer only for the preview, because then the preview could drift from the real thing.

Let's solve it with a Server Function.

### Step 1: A Server Function that returns JSX

A Server Function can return JSX, which means it can hand back a Server Component that has already rendered on the server:

```tsx
// features/drop/drop-preview-action.tsx
'use server';

import { DropBody } from '@/features/drop/components/drop-body';

export async function renderDropPreview(body: string) {
  return <DropBody body={body} />;
}
```

The client never runs `DropBody` itself, it asks the server to render it and gets the finished output back. And because it's the same `DropBody` the feed uses, the preview is guaranteed to match the posted drop, while none of the highlighting code ends up in the client bundle.

### Step 2: Unwrap the result with `use()`

Calling `renderDropPreview` from the client gives us a promise of the rendered node. `DropPreview` unwraps it with `use()`, and handles the empty case:

```tsx
// features/drop/components/drop-preview.tsx
'use client';

import { use, type ReactNode } from 'react';

export type Preview = { body: string; node: Promise<ReactNode> };

export function DropPreview({ preview }: { preview: Preview | null }) {
  if (!preview) {
    return <p>Nothing to preview yet.</p>;
  }
  return use(preview.node);
}
```

`use()` suspends `DropPreview` until the server sends the rendered node back, so it needs a `Suspense` boundary above it, which is the wrapper we put in the composer.

### Step 3: Create the promise in an event handler, not during render

Here's the thing that caught me out. You might reach for calling the action while rendering, but that throws:

```text
Cannot update a component (`Router`) while rendering a different component.
```

A Server Function dispatches through the router, and you can't update the router while React is rendering a component. So instead of creating the promise during render, we create it in the click handler and store it in state:

```tsx
function showPreview() {
  const body = textareaRef.current?.value.trim() ?? '';
  if (!body) {
    setPreview(null);
  } else if (preview?.body !== body) {
    setPreview({ body, node: renderDropPreview(body) });
  }
  setMode('preview');
}
```

Notice we keep both the `body` and the `node` promise in state. That lets us skip re-rendering when the text hasn't changed, and it gives us a stable key for `Suspense`. Because the promise is created on click, `use()` only ever reads a promise that already exists.

### Step 4: Put the Suspense boundary in the parent

You might expect `DropPreview` to wrap its own `use()` in `Suspense`, but a component can't catch a suspension it throws itself, so the boundary has to be an ancestor. That's why the composer owns it, keyed on the draft:

```tsx
// features/drop/components/quick-drop-form.tsx
<Suspense key={preview?.body} fallback={<PreviewSkeleton />}>
  <DropPreview preview={preview} />
</Suspense>
```

Keying it on `preview.body` means each new draft gets its own fallback, so switching to Preview shows a skeleton first rather than the previous draft's output.

**Try it:** [open Drop](https://next16-social-media.vercel.app/), write a drop in the composer at the top of the feed (drop in a code block to see the highlighting), then hit Preview. **Code:** [`quick-drop-form.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/drop/components/quick-drop-form.tsx).

## Key Takeaways

- Keep the client component small and let the server render. The load more button, the search input, and the preview toggle are each a thin piece of interaction wrapped around content that comes from the server.
- Put state like the page number and the query in the URL. It survives refreshes, it's shareable, and it lets the server own the data while the client owns only the transition.
- Pass server-rendered output in as `children` so the interactive shell stays mounted while the content underneath it changes.
- A Server Function can return JSX, which lets a client component render a Server Component on demand without shipping that component's code to the browser.
- Create Server Function promises in event handlers, not during render, and unwrap them with `use()` inside a `Suspense` boundary.

## Conclusion

The common thread across these patterns is that the client stays thin and the server does the rendering. Once you lean into that split, a surprising amount of interaction (a load more button, instant search, a preview of a message) needs only a small amount of client code.

And to say it once more: none of this is required. The basic versions of these features are simpler and will serve you well. But I find it genuinely fun to see how far the Server Component and Server Function model stretches, and how much you can hand back to the server. You can play with everything above in [Drop](https://next16-social-media.vercel.app/), and check out the [full repository on GitHub](https://github.com/aurorascharff/next16-social-media). I'll keep building things on the preview to see what else falls out.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
