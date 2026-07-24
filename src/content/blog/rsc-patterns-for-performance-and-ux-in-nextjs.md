---
author: Aurora Scharff
pubDatetime: 2026-07-24T10:00:00Z
title: "RSC Patterns for Performance and UX in Next.js"
slug: rsc-patterns-for-performance-and-ux-in-nextjs
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

Let's say we want a feed of posts. If we fetch it on the client, the browser has to download the component code, render a spinner, and then start fetching the data. The server sits right next to the database, so we can flip it around. An async Server Component fetches the posts and renders them on the server:

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

The browser receives the rendered output, which can also be streamed. The static parts of the page are served instantly, while the dynamic parts fill in behind `Suspense`. In Drop, the home page looks something like this, with the feed streaming in under the message composer:

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

[Component Architecture for React Server Components](https://aurorascharff.no/posts/component-architecture-for-react-server-components/#background) goes deeper on server-first data fetching, and based on Nadia Makarevich's [benchmarks](https://www.developerway.com/posts/react-server-components-performance), this is about as fast as a page can start.

Additionally, Drop runs with [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents), which means anything that isn't dynamic is prerendered into a static shell.

## Load More, Driven by the URL

Let's start with the simplest feature. The home feed from earlier renders the newest posts, and a **Load more** button at the bottom loads older ones. We want the button to respond the moment you press it, and the older posts to appear below the ones already on screen, without anything else moving.

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

That works, but the posts need their own `/api/feed` route (or a Server Function) so the client can reach them, and the whole feed now lives in client state. It's gone on a refresh, a shared URL only ever points at page one, and the client is doing both the fetching and the rendering.

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

Because each page has its own boundary, a newly requested page streams in under a skeleton while the earlier pages stay exactly where they are. Each `FeedPage` can then fetch and render its slice of posts on the server, with the last page rendering the button that points at the next:

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

The button writes the URL, and the feed reads it.

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

This way, a cold load of `?page=3` renders three pages, the page number survives a refresh and can be shared, and the button responds the moment you press it.

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
      <SearchInput />
      <Suspense fallback={<DropListSkeleton count={3} />}>
        <SearchResults />
      </Suspense>
    </main>
  );
}
```

We also want the query you typed to survive a refresh and be shareable, like the page number.

### Reading the Query with `useSearchParams`

The standard way to get that is to put the query in the URL. We can use the `useSearchParams` hook to read it and push to the router on change, like in [search param filtering](https://aurorascharff.no/posts/managing-advanced-search-param-filtering-next-app-router/):

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

That works, and it's usually all you need. However, the input now depends on the query, and the query is only known at request time. Whether it comes in through a prop, `useSearchParams`, or awaiting `searchParams` in the page, the input can no longer be part of the static shell, and `useSearchParams` reads as empty until the client takes over.

So if we want the input in the instant static shell, it can't depend on the query at all. Under `cacheComponents`, reading the query would also force a `Suspense` boundary around the input.

### Keeping the Input Out of the Dynamic Tree

Instead, we can rewrite `SearchInput` so it never reads the query. It only writes to the URL on change, so it can render as part of the static shell:

```tsx
// features/search/components/search-input.tsx
'use client';

export function SearchInput() {
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

Now the page can compose the two:

```tsx
// app/search/page.tsx
export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <main>
      <PageHeader back title="Search" />
      <SearchInput />
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

Notice that the page is **not** `async` and never awaits `searchParams`. It passes the promise down and resolves it with `.then()` inside the `Suspense` boundary, so the header and the input stay in the static, instant part of the page while only `SearchResults` is dynamic. An async child component that awaits the promise works the same way.

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
// features/search/components/search-input.tsx
'use client';

export function SearchInput() {
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

Now we have the flag. A spinner next to the input would do, but let's fade the whole result list instead, which is a common pattern. For the fade to reach the results, the component has to render around them, so the input can take them as `children` and become a `Search` component:

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

The fade uses Tailwind v4's `data-pending:` variant. Then we can wrap the `Suspense` boundary with `Search` in the page:

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

While a search is pending, the old results stay visible but dimmed, and the new ones replace them when they're ready.

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

This way, the search page starts fully static, with the input ready before any data, and opening a shared link like `/search?q=react` prefills the input before hydration while the results stream in behind the `Suspense` fallback.

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

The `DropComposer` renders a `QuickDropForm`, a client component with a textarea, formatting options, and a toggle between writing and previewing your draft:

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
      <ToolbarButton label="Preview" onClick={() => setMode('preview')}>
        <Eye className="h-4 w-4" />
      </ToolbarButton>
      <Button type="submit">Drop it</Button>
    </form>
  );
}
```

Notice the **Preview** toggle and the gap it swaps in. We want that gap to render the draft exactly the way the server renders a post.

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

This is great, because the heavy syntax-highlighting work happens on the server, and the whole library stays out of the client bundle. But for the preview to match the real post, it has to go through that same `DropBody`. The composer is a client component, so it can't call `DropBody` directly, and we don't want a second client-side renderer that could drift from the real thing.

Passing the rendered body in as `children` doesn't work either. That composition needs the server content to exist when the page renders, and the draft doesn't exist until you type it.

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

Now the server can render the draft on demand.

### Requesting and Showing the Preview

With that in place, we can request the preview from an event handler and keep the promise in state, and `DropPreview` reads it with `use()`, [suspending](https://react.dev/reference/react/Suspense) until the server sends the rendered node back:

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

We can render it inside a `Suspense` boundary, and give it the stored `body` as a `key` to reset the boundary when the draft changes:

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
      <ToolbarButton label="Preview" onClick={showPreview}>
        <Eye className="h-4 w-4" />
      </ToolbarButton>
      <Button type="submit">Drop it</Button>
    </form>
  );
}
```

This way, the composer stays a thin client component, and the preview always matches the published post.

**Try it:** [open Drop](https://next16-social-media.vercel.app/), write a post in the composer at the top of the feed (add a code block to see the highlighting), then hit Preview. **Code:** [`quick-drop-form.tsx`](https://github.com/aurorascharff/next16-social-media/blob/main/features/drop/components/quick-drop-form.tsx).

## Key Takeaways

- Use the server for what it's worth, and let it do the fetching and the rendering.
- Pass server-rendered output to client components as `children`, or request it on demand with a Server Function.
- Avoid putting code in the client when it doesn't need to be there.
- Put state like the page number and the query in the URL, where it survives refreshes and is readable on the server.
- Streaming into separate `Suspense` boundaries can add new content without touching what's already on screen.
- Maximize the static shell by keeping dynamic reads behind `Suspense` boundaries.
- Provide instant feedback with transitions and pending states while the server works.

## Conclusion

These experiments have been an exciting way to challenge what you can build with RSCs. Again, none of these patterns are required, and the basic versions will do for most apps. But when the next feature needs interaction, try starting with what the server can render, and see how small the client piece gets. You can play with everything above in [Drop](https://next16-social-media.vercel.app/), and check out the [full repository on GitHub](https://github.com/aurorascharff/next16-social-media).

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
