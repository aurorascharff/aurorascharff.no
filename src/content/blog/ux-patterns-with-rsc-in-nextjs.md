---
author: Aurora Scharff
pubDatetime: 2026-07-24T10:00:00Z
title: "UX Patterns with RSC in Next.js"
slug: ux-patterns-with-rsc-in-nextjs
featured: true
draft: true
tags:
  - Next.js 16
  - React Server Components
  - Server Functions
  - Composition
  - Suspense
  - User Experience
description: "A few Server Component patterns from a small app on the Next.js 16 preview: a load more button that leans on the URL, a search field that keeps focus while results stream, and a message composer that previews your draft on the server."
---

In the Next.js App Router, pages render on the server by default. However, the moment a feature needs interaction, it's tempting to hand it entirely to the client. I've been building [Drop](https://next16-social-media.vercel.app/), a small social app, to test the [Next.js 16.3 Instant Navigations preview](https://nextjs.org/blog/next-16-3-instant-navigations), and I keep finding patterns worth sharing about Server Components, composition, and user experience.

In this post, we'll build:

- a **load more button** that does no data fetching of its own, only pushing a `?page=` URL and letting the server stream the next page
- a **search field** that renders instantly as part of the static server shell and keeps its focus while the results stream and fade in below it
- a **message composer** with a draft preview rendered on demand by a Server Function that returns JSX

There are simpler versions of all of these. It's more an exercise in how far the Server Component and Server Function model stretches, which I find genuinely fun. The approach comes from [Server and Client Component Composition in Practice](https://aurorascharff.no/posts/server-client-component-composition-in-practice/), keeping the rendering on the server and passing the output as `children` into a small client component that owns the interaction.

## Table of contents

## Why Keep the Work on the Server?

Let's say we want a feed of drops. If we fetch it on the client, the browser has to download the component code, render a spinner, and then start fetching the data. The server sits right next to the database, so we can flip it around. An async Server Component fetches the drops and renders them on the server, and only the finished output reaches the browser:

```tsx
// features/drop/components/feed.tsx
export async function Feed() {
  const { items } = await getFeed();
  return (
    <ul>
      {items.map(item => (
        <li key={item.drop.id}>
          <Drop drop={item.drop} />
        </li>
      ))}
    </ul>
  );
}
```

The browser receives finished HTML, so there is nothing left to fetch after hydration, and the code that produced it stays on the server. With streaming, the static parts of the page show up right away while the dynamic parts fill in behind `Suspense`, so the client is left with only the interaction that has to run in the browser. Drop's home page ends up looking something like this, with the feed streaming in under the message composer:

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <main>
      <DropComposer />
      <Suspense fallback={<DropListSkeleton />}>
        <Feed />
      </Suspense>
    </main>
  );
}
```

That's about as fast as a page can start. The reasoning is covered in more depth in [Component Architecture for React Server Components](https://aurorascharff.no/posts/component-architecture-for-react-server-components/#background), which builds on Nadia Makarevich's [benchmarks](https://www.developerway.com/posts/react-server-components-performance) showing the gains only land once data fetching is server-first and wrapped in deliberate `Suspense` boundaries.

## Load More, Driven by the URL

Let's start with the simplest feature, the Load more button at the bottom of the feed. We want it to do no data fetching of its own and show a pending state while the server loads the next page.

The obvious version fetches the next page on the client and appends it to a list in state:

```tsx
'use client';

function Feed({ initialItems }: { initialItems: FeedItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);

  async function loadMore() {
    const next = await getFeed(page + 1);
    setItems([...items, ...next.items]);
    setPage(page + 1);
  }

  return (
    <ul>
      {items.map(item => (
        <li key={item.drop.id}>
          <Drop drop={item.drop} />
        </li>
      ))}
      <button onClick={loadMore}>Load more</button>
    </ul>
  );
}
```

That works, but the whole feed now lives in client state. It's gone on a refresh, a shared URL only ever points at page one, and the client is doing both the fetching and the rendering.

### Driving the Feed from the URL

We can put the page number in the URL, like we did for [filtering with search params](https://aurorascharff.no/posts/managing-advanced-search-param-filtering-next-app-router/). The feed reads a `?page=` param and renders pages `1` through `N`, each its own async Server Component inside a `Suspense` boundary:

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

Because each page has its own boundary, a newly requested page streams in under a skeleton while the earlier pages stay exactly where they are. Each `FeedPage` fetches and renders its slice of drops on the server, and the last page renders the button pointing at the next page:

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

### The Button Only Navigates

Now the button has nothing to fetch. It pushes the next `?page=` URL inside a transition, so it can show a pending state while the server streams the new page:

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

That's the entire button. It holds no list state and does no fetching of its own. All it does is change the URL and let the server render the rest.

This way, the server renders every page and load more survives a refresh, since a cold load of `?page=3` renders three pages. The only thing the client contributes is the transition that keeps the button responsive.

**Try it:** [open the Drop feed](https://next16-social-media.vercel.app/) and hit Load more. **Code:** [`feed.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/drop/components/feed.tsx).

## Streaming Search Results

Next, search. We want the results to stream from the server while the input around them stays put. The input should render right away and keep focus while you type, which means it can't remount as the results change.

The basic pattern for this is well trodden: put the query in the URL, render a client input that reads it with `useSearchParams` and pushes to the router on change, then wrap the results in `Suspense`.

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

That works, and it's usually all you need.

### The `cacheComponents` Problem

However, Drop runs with [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) enabled, and that changes where the query can be read. Reading `searchParams` is dynamic, so anything that touches it has to sit below a `Suspense` boundary, and `useSearchParams` itself reads as empty until the client takes over. If we want the input to be truly instant, rendered as part of the static shell before any data resolves, it has to live *above* that boundary, where the query isn't available yet.

So the input can't read the query during render at all, whether as a prop, with `useSearchParams`, or by awaiting it in the page. It has to stay in the static shell above the boundary, while the results stream in below it.

### Keeping the Input Out of the Dynamic Tree

Instead, we can make the input a small client component that takes the results as `children`. It only writes to the URL on change and never reads the query, so it renders once up front and stays mounted while the results swap out underneath:

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

Now the page renders the shell once and passes the results into it as `children`. Notice that the page is **not** `async` and never awaits `searchParams`. It passes the promise down and resolves it with `.then()` *inside* a `Suspense` boundary, so the shell stays in the static, instant part of the page while only `SearchResults` is dynamic:

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

The `SearchResults` component itself is a plain async Server Component. It fetches on the server, renders the output, and adds nothing to the client bundle:

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

### Dimming the Stale Results

The results still pop in abruptly when they're ready. We can dim them while the next query streams by wrapping the `router.replace` in a transition and fading the `children` with its `isPending` flag:

```tsx
const [isPending, startTransition] = useTransition();

// in the input's onChange
startTransition(() => router.replace(next, { scroll: false }));

// wrapping the children
<div className="transition-opacity data-pending:opacity-60" data-pending={isPending ? '' : undefined}>
  {children}
</div>
```

The stale-while-loading part comes for free from the App Router, which runs every navigation inside a transition, so React keeps the previous results on screen while the new ones load instead of dropping to the skeleton on each keystroke. In plain React you'd reach for `useTransition` yourself to get that behavior. Here we only want the `isPending` flag it gives us, which drives the fade.

### Seeding the Input Without Awaiting the URL

Putting the input above the boundary has a cost. The shell renders before `searchParams` resolves, so it can't start with the current query filled in. For shared links and refreshes we still want someone opening `/search?q=react` to see `react` in the box. We need to seed the input twice, on cold loads and on soft navigations.

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

The `type` flips to `text/plain` on the client, so the script only ever runs once, during the server-streamed HTML. Because the DOM already carries the value, the input needs `suppressHydrationWarning` so React doesn't flag the mismatch when it hydrates. This is the same seeding trick from [Building an Active NavLink Component](https://aurorascharff.no/posts/building-an-active-navlink-component-in-nextjs/#preventing-flickering-on-first-paint), and it avoids the hydration mismatch the same way. It's also how Next.js recommends [preventing a flash before hydration](https://nextjs.org/docs/app/guides/preventing-flash-before-hydration).

Soft navigations are the second case, again because of `cacheComponents`. To make navigation instant, Next.js keeps recently visited routes mounted with React's [`<Activity>`](https://react.dev/reference/react/Activity) instead of unmounting them, which [preserves their DOM and state](https://nextjs.org/docs/app/guides/preserving-ui-state) so back navigation restores exactly what you left. That's usually what you want, but it means navigating back to search can bring back an input value that no longer matches the URL. A layout effect re-syncs it to the param before paint:

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

### Putting the Search Together

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

This way, the input renders instantly in the static shell and keeps its focus, while the results stream in from the server as `children` below it.

**Try it:** [search in Drop](https://next16-social-media.vercel.app/search) and watch the input stay put while results stream and fade. **Code:** [`search-shell.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/search/components/search-shell.tsx).

## A Message Composer with a Server-Rendered Preview

Last, a message composer with a Preview toggle. We want the preview to show your draft exactly the way it will look once posted.

The composer is a client component with a write/preview toggle. In write mode it shows the textarea, and in preview mode the rendered draft takes its place:

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
        <DropPreview preview={preview} />
      )}
      <ToolbarButton label="Preview" onClick={showPreview}>
        <Eye className="h-4 w-4" />
      </ToolbarButton>
      <Button type="submit">Drop it</Button>
    </form>
  );
}
```

The interesting part is the preview.

### Rendering the Draft on the Server

In the feed, a drop body is rendered by a Server Component, `DropBody`, which highlights code blocks with [Shiki](https://shiki.style/) on the server:

```tsx
// features/drop/components/drop-body.tsx
export function DropBody({ body }: { body: string }) {
  const segments = splitCode(body);
  // renders paragraphs, links, and Shiki-highlighted code blocks
}
```

For the preview to match the posted drop, it has to go through that same `DropBody`. But the composer is a client component, so it can't call `DropBody` directly, and we don't want a second client-side renderer that could drift from the real thing. We can solve it with a Server Function, which can return JSX and hand back a `DropBody` that already rendered on the server:

```tsx
// features/drop/drop-preview-action.tsx
'use server';

import { DropBody } from '@/features/drop/components/drop-body';

export async function renderDropPreview(body: string) {
  return <DropBody body={body} />;
}
```

The composer never runs `DropBody`. It asks the server to do the rendering and gets the finished output back. On the client, `DropPreview` unwraps the returned promise with `use()`:

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

### Requesting the Preview on Click

Hitting Preview creates the promise in the `showPreview` handler rather than during render. A Server Function dispatches through the router, and calling one mid-render throws:

```text
Cannot update a component (`Router`) while rendering a different component.
```

So we create it on click and keep it in state:

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

Keeping both the `body` and the promise in state lets us skip re-rendering when the text hasn't changed, and gives the `Suspense` boundary a stable key. We render `DropPreview` inside that boundary, keyed on the draft so a new preview shows a skeleton first:

```tsx
<Suspense key={preview?.body} fallback={<PreviewSkeleton />}>
  <DropPreview preview={preview} />
</Suspense>
```

### Putting the Composer Together

Here's the composer with the preview wired in, the `showPreview` handler that starts the render and the `Suspense` boundary that shows the result:

```tsx
// features/drop/components/quick-drop-form.tsx
'use client';

export function QuickDropForm({ avatar }: { avatar: React.ReactNode }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [preview, setPreview] = useState<Preview | null>(null);

  function showPreview() {
    const body = textareaRef.current?.value.trim() ?? '';
    if (!body) {
      setPreview(null);
    } else if (preview?.body !== body) {
      setPreview({ body, node: renderDropPreview(body) });
    }
    setMode('preview');
  }

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

This way, the composer stays a thin client component while the server renders the preview. The preview always matches the posted drop, and none of the highlighting code ships to the client.

**Try it:** [open Drop](https://next16-social-media.vercel.app/), write a drop in the composer at the top of the feed (drop in a code block to see the highlighting), then hit Preview. **Code:** [`quick-drop-form.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/drop/components/quick-drop-form.tsx).

## Key Takeaways

- **Keep the client component small and let the server render.** The load more button, the search input, and the message composer are each a thin piece of interaction wrapped around content that comes from the server.
- **Put state in the URL.** The page number and the query survive refreshes, they're shareable, and the server owns the data while the client owns only the transition.
- **Pass server-rendered output as `children`.** The interactive shell stays mounted while the content underneath it changes.
- **A Server Function can return JSX.** A client component can render a Server Component on demand without shipping that component's code to the browser.
- **Create Server Function promises in event handlers, not during render.** Then unwrap them with `use()` inside a `Suspense` boundary.

## Conclusion

We ended up handing most of the work to the server: the feed pages render behind their own `Suspense` boundaries, the search results stream in as `children` of the shell, and the preview comes back from a Server Function as rendered JSX. Once you lean into that split, a surprising amount of interaction needs only a small amount of client code.

None of it is required, and the basic versions of these features will serve you well. You can play with everything above in [Drop](https://next16-social-media.vercel.app/), and check out the [full repository on GitHub](https://github.com/aurorascharff/next16-social-media). I'll keep building on the preview to see what else falls out.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
