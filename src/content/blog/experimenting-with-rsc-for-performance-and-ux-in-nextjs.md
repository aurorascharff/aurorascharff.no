---
author: Aurora Scharff
pubDatetime: 2026-07-24T10:00:00Z
title: "Experimenting with RSCs for Performance and UX in Next.js"
slug: experimenting-with-rsc-for-performance-and-ux-in-nextjs
featured: true
draft: false
tags:
  - Next.js 16
  - React Server Components
  - Server Functions
  - Composition
  - Suspense
  - User Experience
description: "A few Server Component patterns from a small app on the Next.js 16.3 preview: a load more button that leans on the URL, a search field that keeps focus while results stream, and a message composer that previews your draft on the server."
---

In the Next.js App Router, components are React Server Components by default. However, the moment a feature needs interaction, it's tempting to hand it entirely to the client. I've been building [Drop](https://next16-social-media.vercel.app/), a small social app, to test the [Next.js 16.3 Instant Navigations preview](https://nextjs.org/blog/next-16-3-instant-navigations), and I keep finding patterns worth sharing about Server Components, performance, and user experience.

In this post, we'll build:

- A **load more button** that does no data fetching of its own, only pushing a `?page=` URL and letting the server stream the next page
- A **search field** that renders instantly as part of the static server shell and keeps its focus while the results stream and fade in below it
- A **message composer** with a draft preview rendered on demand by a Server Function that returns JSX

There are simpler versions of all of these. This post is more an exercise in how far the Server Component and Server Function model stretches, which I find genuinely fun. For a refresher on server and client composition, check out [Server and Client Component Composition in Practice](https://aurorascharff.no/posts/server-client-component-composition-in-practice/).

## Table of contents

## Why Keep the Work on the Server?

Let's say we want a feed of posts. If we fetch it on the client, the browser has to download the component code, render a spinner, and then start fetching the data. The server sits right next to the database, so we can flip it around. Instead, an async Server Component can fetch the posts and render them on the server:

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

This way, the browser receives the rendered output. RSCs can also be streamed, letting the static parts of the page be served instantly while the dynamic parts fill in behind `Suspense`. In Drop, the home page looks something like this, with the `Feed` streaming in under the `DropComposer`:

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <main>
      <header>
        <h1>Home</h1>
        <RefreshButton label="Refresh feed" />
      </header>
      <DropComposer />
      <Suspense fallback={<DropListSkeleton />}>
        <Feed />
      </Suspense>
    </main>
  );
}
```

Based on Nadia Makarevich's [benchmarks](https://www.developerway.com/posts/react-server-components-performance), this is about as fast as a page can start. If you want to learn more about this topic and how I approach it, see [Component Architecture for React Server Components](https://aurorascharff.no/posts/component-architecture-for-react-server-components/#background).

Additionally, Drop runs with [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents), which means anything that isn't dynamic is prerendered into a static shell with [Partial Prerendering](https://nextjs.org/docs/app/glossary#partial-prerendering-ppr) and can be served from a CDN.

## Load More, Driven by the URL

Let's start with the simplest feature. The home feed from earlier renders the newest posts, and a **Load more** button at the bottom loads older ones. We want the button to respond the moment you press it, and the older posts to appear below the ones already on screen.

### A Feed in Client State

The obvious version fetches the next page on the client and appends it to a list in state:

```tsx
'use client';

function Feed({ initialItems }: { initialItems: FeedItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);

  async function loadMore() {
    const res = await fetch(`/api/feed?page=${page + 1}`);
    const next = await res.json();
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

That works, but it has some issues. The posts need their own `/api/feed` route (or a Server Function) so the client can reach them, the whole feed lives in client state that disappears on a refresh, and a shared URL only ever points at page one.

### Pushing the Page Number to the URL

Instead, we can turn **Load more** into a small client component that only puts the next page number in the URL. Later, we can use the value of the URL to fetch on the server. To track that navigation, we can also use a transition for the pending state:

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

That's the only client code the feature needs.

### Rendering the Pages on the Server

Now we can read the `?page=` param in a `Feed` Server Component and render pages `1` through `N`, each its own async Server Component inside a `Suspense` boundary:

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

Because each page has its own `Suspense` boundary, a newly requested page streams in under a skeleton while the earlier pages stay exactly where they are. Each `FeedPage` can then fetch and render its slice of posts on the server, with the last page rendering the button that points at the next:

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

Now both pieces are in place.

### The Full `Feed`

Here's the feed with the pages and the button wired in. It stays an async Server Component from top to bottom, owning the data and the rendering, with the button as the only client piece:

```tsx
// features/drop/components/feed.tsx
import { Suspense } from 'react';
import { LoadMore } from '@/components/ui/load-more';

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

This way, the button responds the moment you press it, and the older posts stream in below the ones already on screen. The page number also survives a refresh and can be shared, and a cold load of `?page=3` renders three pages.

**Try it:** [open the Drop feed](https://next16-social-media.vercel.app/) and hit **Load more**. **Code:** [`feed.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/drop/components/feed.tsx).

## Streaming Search Results

Let's move on to the search page. It has an input where you can search for people or posts. We want the input ready the moment the page opens, and to keep focus while the results update below as you type.

Initially, the page looks something like this:

```tsx
// app/search/page.tsx
export default function SearchPage() {
  return (
    <main>
      <PageHeader back title="Search" />
      <Search />
      <Suspense fallback={<DropListSkeleton count={3} />}>
        <SearchResults />
      </Suspense>
    </main>
  );
}
```

We also want the query you typed to survive a refresh and be shareable, like the page number.

### Reading the Query with `useSearchParams`

The standard way to get this behavior is to put the query in the URL. We can use the `useSearchParams` hook to read it and push to the router on change, like in [Managing Advanced Search Param Filtering in the Next.js App Router](https://aurorascharff.no/posts/managing-advanced-search-param-filtering-next-app-router/):

```tsx
'use client';

function Search() {
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

We can then use the query in `SearchResults`, similar to the load more pages. It's a plain async Server Component that fetches on the server, renders the output, and adds nothing to the client bundle:

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

Finally, the page can await `searchParams` and pass the query down to the results. The query is now read in two places, with `useSearchParams` inside `Search` and from the awaited `searchParams` in the page:

```tsx
// app/search/page.tsx
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const { q } = await searchParams;
  return (
    <main>
      <PageHeader back title="Search" />
      <Search />
      <Suspense fallback={<DropListSkeleton count={3} />}>
        <SearchResults query={typeof q === 'string' ? q : ''} />
      </Suspense>
    </main>
  );
}
```

That works, and it's usually all you need. However, the query is only known at request time. Awaiting `searchParams` blocks the whole page while it resolves, and the input now depends on the query too, whether through a prop or `useSearchParams`, which reads as empty until the client takes over. Either way, the input can no longer be part of the static shell.

So if we want the input in the instant static shell, it can't depend on the query at all. Under `cacheComponents`, reading the query with `useSearchParams` or awaiting `searchParams` would also require a `Suspense` boundary above.

### Keeping the Input Out of the Dynamic Tree

Instead, we can rewrite `Search` to only write to the URL on change, never reading the query, so it can render as part of the static shell:

```tsx
// features/search/components/search.tsx
'use client';

export function Search() {
  const router = useRouter();

  return (
    <input
      type="search"
      name="q"
      placeholder="Search drops…"
      onChange={event => {
        const value = event.target.value;
        router.replace(value ? `/search?q=${encodeURIComponent(value)}` : '/search', { scroll: false });
      }}
    />
  );
}
```

Let's adjust `SearchPage` to match our new structure:

```tsx
// app/search/page.tsx
export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <main>
      <PageHeader back title="Search" />
      <Search />
      <Suspense fallback={<DropListSkeleton count={3} />}>
        {searchParams.then(sp => {
          const q = typeof sp.q === 'string' ? sp.q : '';
          if (!q) return <EmptyState title="Search drops" body="Type something to search." />;
          return <SearchResults query={q} />;
        })}
      </Suspense>
    </main>
  );
}
```

Notice that the page is no longer `async`. It passes the promise down and resolves it with `.then()` inside the `Suspense` boundary, so the header and the input stay in the static, instant part of the page while only `SearchResults` is dynamic.

Everything below the boundary is replaced as the query changes, swapping between the empty state, the skeleton, and the results, while the input above it never remounts and keeps its focus and cursor position.

### Seeding the Input Without Awaiting the URL

Putting the input above the boundary has a cost. It renders before `searchParams` resolves, so it can't start with the current query filled in. For shared links and refreshes we still want someone opening `/search?q=react` to see `react` in the box.

An effect could fill the input in after hydration, but then the box sits empty until the JavaScript loads and the value pops in late. We can avoid that flicker with a trick, a tiny inline script that runs during HTML parsing, before the browser paints, and sets the value from the URL:

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

Because the DOM already carries the value, the input needs `suppressHydrationWarning` so React doesn't flag the mismatch when it hydrates. Next.js recommends this kind of inline script for [preventing a flash before hydration](https://nextjs.org/docs/app/guides/preventing-flash-before-hydration), and I used the same trick in [Building an Active NavLink Component](https://aurorascharff.no/posts/building-an-active-navlink-component-in-nextjs/#preventing-flickering-on-first-paint).

That handles the first load, but navigating back to the page is a different case. Next.js keeps recently visited routes mounted with React's [`<Activity>`](https://react.dev/reference/react/Activity) instead of unmounting them, which [preserves their DOM and state](https://nextjs.org/docs/app/guides/preserving-ui-state). That's usually what you want, but the input can come back holding a query that no longer matches the URL. We can re-sync it to the param before paint with a layout effect:

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

With both seeds in place, the input always matches the URL, however you arrive at the page.

### Dimming the Stale Results

The App Router already runs every navigation inside a transition, so the previous results stay on screen while the next ones load, [avoiding unwanted loading indicators](https://react.dev/reference/react/useTransition#preventing-unwanted-loading-indicators) on each keystroke. If a search takes a while, though, nothing tells the user anything is happening. We can add a slight pending state by wrapping the `router.replace` in our own transition, which gives us an `isPending` flag:

```tsx
// features/search/components/search.tsx
'use client';

export function Search() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
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
  );
}
```

Now that we have the flag, we can use it to add a pending state. A spinner next to the input would do, but a common pattern I like is to fade the whole result list. So how can we pass the pending state to the results while preserving our structure? Since the results are server-rendered, they can be passed to the client component as `children` without becoming client components themselves. Let's update `Search` to take them:

```tsx
// features/search/components/search.tsx
'use client';

export function Search({ children }: { children: React.ReactNode }) {
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

The wrapper dims the results while the search is pending, with Tailwind v4's `data-pending:` variant slightly lowering the opacity.

Then we can pass the results into `Search` as `children`, suspending inside it:

```tsx
// app/search/page.tsx
export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <main>
      <PageHeader back title="Search" />
      <Search>
        <Suspense fallback={<DropListSkeleton count={3} />}>
          {searchParams.then(sp => {
            const q = typeof sp.q === 'string' ? sp.q : '';
            if (!q) return <EmptyState title="Search drops" body="Type something to search." />;
            return <SearchResults query={q} />;
          })}
        </Suspense>
      </Search>
    </main>
  );
}
```

Now the pending state reaches the results.

### The Full `Search`

Here's the shell with the transition, the fade, and both seeding paths wired in:

```tsx
// features/search/components/search.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useTransition } from 'react';
import { SeedFromSearchParam } from '@/components/scripts/seed-from-search-param';
import { useSyncInputToSearchParam } from '@/hooks/use-sync-input-to-search-param';

export function Search({ children }: { children: React.ReactNode }) {
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

This way, the input is ready the moment the page opens and keeps focus while the results stream in below it. On the initial load, the results stream in behind the `Suspense` fallback, and on later searches the previous results are preserved, dimmed until the new ones replace them. The query also survives a refresh, and opening a shared link like `/search?q=react` prefills the input before hydration.

**Try it:** [search in Drop](https://next16-social-media.vercel.app/search), or open [a shared query](https://next16-social-media.vercel.app/search?q=react) directly. **Code:** [`search.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/search/components/search.tsx).

## A Message Composer with a Server-Rendered Preview

Finally, let's work on the message composer, the one we saw briefly at the top of the home page:

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <main>
      <header>
        <h1>Home</h1>
        <RefreshButton label="Refresh feed" />
      </header>
      <DropComposer />
      <Suspense fallback={<DropListSkeleton />}>
        <Feed />
      </Suspense>
    </main>
  );
}
```

The `DropComposer` renders a `QuickDropForm`, a client component with a textarea, a toolbar for bold and italic text, code blocks, and tags, and a toggle between writing and previewing your draft:

```tsx
// features/drop/components/quick-drop-form.tsx
'use client';

export function QuickDropForm({ avatar }: { avatar: React.ReactNode }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  return (
    <form action={submitAction}>
      {avatar}
      {mode === 'write' ? (
        <textarea ref={textareaRef} name="body" placeholder="What did you build today?" />
      ) : (
        <div>{/* TODO: render the draft as a preview */}</div>
      )}
      {/* ...toolbar buttons for bold, italic, code blocks, and tags... */}
      <ToolbarButton label="Preview" onClick={() => setMode('preview')}>
        <Eye className="h-4 w-4" />
      </ToolbarButton>
      <Button type="submit">Drop it</Button>
    </form>
  );
}
```

Notice that the **Preview** toggle works, but the preview itself isn't implemented yet. When you hit **Preview**, we want the draft to swap in exactly the way it will look once posted, streaming in behind a loading state.

### The Server-Only `DropBody`

In the feed, a post's body is rendered by a Server Component, `DropBody`. It splits the text into segments and renders paragraphs, links, and code blocks:

```tsx
// features/drop/components/drop-body.tsx
export function DropBody({ body }: { body: string }) {
  const segments = splitCode(body);
  return (
    <div className="flex flex-col gap-2">
      {segments.map((segment, i) =>
        segment.type === 'code' ? (
          <CodeBlock key={i} lang={segment.lang} code={segment.code} />
        ) : (
          <p key={i}>{renderText(segment.text)}</p>
        ),
      )}
    </div>
  );
}
```

The code blocks are highlighted with [Shiki](https://shiki.style/) in an async `CodeBlock` component:

```tsx
// components/ui/code-block.tsx
export async function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const html = await highlight(code, lang); // Shiki, on the server
  return <div className="shiki-block" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

This is great, because the heavy syntax-highlighting work happens on the server, and the whole library stays out of the client bundle.

The obvious version of the preview is to port `DropBody` to the client:

```tsx
// a client-side port of DropBody
'use client';

import { splitCode } from '@/features/drop/drop-format';

export function DropPreview({ body }: { body: string }) {
  const segments = splitCode(body);
  return segments.map((segment, i) =>
    segment.type === 'code' ? (
      <pre key={i}>{segment.code}</pre>
    ) : (
      <p key={i}>{segment.text}</p>
    ),
  );
}
```

The parsing ports fine, it's plain functions, but the code blocks lose their highlighting, since `CodeBlock` is an async Server Component built on Shiki. A client port either ships the whole highlighter to the browser or drops it, and either way the preview starts drifting from the real post. For the preview to match, it has to go through that same `DropBody`, and the composer is a client component that can't call it directly.

Passing the rendered body in as `children` doesn't work either. The `children` would be rendered when the page renders on the server, and at that point the draft doesn't exist. It only appears later, as you type on the client. Technically, we could store the draft somewhere the server can read it, like the URL in the previous examples, but let's try something else.

### Rendering the Draft on the Server

What if we could ask the server for rendered output on demand? A Server Function can do exactly that. It can return JSX, handing back a `DropBody` that already rendered on the server:

```tsx
// features/drop/drop-preview-action.tsx
'use server';

import { DropBody } from '@/features/drop/components/drop-body';

export async function renderDropPreview(body: string) {
  return <DropBody body={body} />;
}
```

One gotcha: since we import the Server Function directly into a Client Component, Client Components inside the returned JSX, like the copy button inside `CodeBlock`, only resolve when the page already includes their code, per [this issue](https://github.com/vercel/next.js/issues/83186). In Drop, the feed on the same page already renders them.

Now the server can render the draft on demand.

### Requesting and Showing the Preview

With that in place, we can request the preview from an event handler, keep the promise in state, and have `DropPreview` read it with `use()`, [suspending](https://react.dev/reference/react/Suspense) until the server sends the rendered node back:

```tsx
// features/drop/components/quick-drop-form.tsx
function showPreview() {
  const body = textareaRef.current?.value.trim() ?? '';
  if (!body) {
    setPreview(null);
  } else if (preview?.body !== body) {
    setPreview({ body, node: renderDropPreview(body) });
  }
  setMode('preview');
}

// features/drop/components/drop-preview.tsx
export function DropPreview({ preview }: { preview: Preview | null }) {
  if (!preview) {
    return <p>Nothing to preview yet.</p>;
  }
  return use(preview.node);
}
```

Unlike hooks, [`use()`](https://react.dev/reference/react/use) can be called conditionally, so the early return for the empty state is fine.

We can render `DropPreview` inside a `Suspense` boundary, and give it the stored `body` as a `key` to reset the boundary when the draft changes:

```tsx
// features/drop/components/quick-drop-form.tsx
{mode === 'write' ? (
  <textarea ref={textareaRef} name="body" placeholder="What did you build today?" />
) : (
  <Suspense key={preview?.body} fallback={<PreviewSkeleton />}>
    <DropPreview preview={preview} />
  </Suspense>
)}
```

A new draft shows the skeleton while the server renders, and toggling back to an unchanged draft reuses the settled promise, showing the finished preview right away.

### The Full `QuickDropForm`

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
      {/* ...toolbar buttons for bold, italic, code blocks, and tags... */}
      {mode === 'write' ? (
        <ToolbarButton label="Preview" onClick={showPreview}>
          <Eye className="h-4 w-4" />
        </ToolbarButton>
      ) : (
        <ToolbarButton label="Edit" onClick={() => setMode('write')}>
          <PenLine className="h-4 w-4" />
        </ToolbarButton>
      )}
      <Button type="submit">Drop it</Button>
    </form>
  );
}
```

This way, the composer stays a thin client component, and the preview always matches the published post, with the expensive rendering work staying on the server.

**Try it:** [open Drop](https://next16-social-media.vercel.app/), write a post in the composer at the top of the feed (add a code block to see the highlighting), then hit Preview. **Code:** [`quick-drop-form.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/drop/components/quick-drop-form.tsx).

## Key Takeaways

- Use the server for what it's worth, and let it do the fetching and the rendering.
- Pass server-rendered output to client components as `children`, or request it on demand with a Server Function.
- Avoid putting code in the client when it doesn't need to be there.
- Put state like the page number and the query in the URL, where it survives refreshes and is readable on the server.
- Streaming into separate `Suspense` boundaries can add new content without touching what's already on screen.
- Maximize the static shell by keeping dynamic reads behind `Suspense` boundaries.
- Provide local feedback, like pending states from transitions or optimistic updates, while the server works.

## Conclusion

These experiments have been an exciting way to challenge what you can build with RSCs. Again, none of these patterns are required, and the basic versions will do for most apps. But when your next feature needs interactivity, try starting with the server, and see what eventually needs to end up in the client. You might be surprised! You can play with everything above in [Drop](https://next16-social-media.vercel.app/), and check out the [full repository on GitHub](https://github.com/aurorascharff/next16-social-media).

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
