---
author: Aurora Scharff
pubDatetime: 2026-07-22T10:00:00Z
title: Static In-Segment Navigation with useRelativeHref
slug: static-in-segment-navigation-with-userelativehref
featured: false
draft: true
tags:
  - Next.js 16
  - React Server Components
  - App Router
  - Cache Components
  - Navigation
description: "A tab bar inside a dynamic segment usually needs the current route param to build each link, which makes it dynamic under Cache Components. Here is how the experimental useRelativeHref hook lets those links skip the param and stay in the static shell."
---

A while back I built a reusable [NavLink component](/posts/building-an-active-navlink-component-in-nextjs) for top-level navigation, links like Home and Search that sit in the root layout. This post is about the sibling problem: navigation *inside* a dynamic segment, like a tab bar in a `/[teamId]` layout, where every link needs the current `teamId` to build its `href`.

There's a new experimental App Router hook, [`unstable_useRelativeHref`](https://github.com/vercel/next.js/pull/96068), that builds those links without the param. In this post I'll use it to build a tab bar that stays in the static shell under Cache Components. It's unmerged and prefixed with `unstable_` as I write this, so treat the code as a preview, not something to ship yet.

## Table of contents

## The Use Case

Let's say we have a team layout with a few tabs, sitting above the pages for a single team:

```text
app/
  [teamId]/
    layout.tsx
    dashboard/page.tsx
    settings/page.tsx
    billing/page.tsx
```

The tab bar lives in `app/[teamId]/layout.tsx`, so it renders on every page under `/[teamId]`. Each tab links to a route that includes the current team, so the obvious version reads the param and builds the `href` from it:

```tsx
// app/[teamId]/layout.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

function Tabs() {
  const { teamId } = useParams();

  return (
    <nav>
      <Link href={`/${teamId}/dashboard`}>Dashboard</Link>
      <Link href={`/${teamId}/settings`}>Settings</Link>
      <Link href={`/${teamId}/billing`}>Billing</Link>
    </nav>
  );
}
```

That works, and it's the standard way to do it today.

## The Problem: The Tab Bar Needs the Param

The `href` for each tab depends on `teamId`, and `teamId` is only known at request time. Reading it with `useParams()` (or pulling it out of `usePathname()`) is a dynamic read.

That's fine until we enable [Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents). Then a dynamic read with no `Suspense` boundary above it is a build error, and the tab bar is in a layout shared across every team page, so it fails on all of them. The only thing forcing the tab bar to be dynamic is that it needs the param to spell out each `href`. The structure of the nav, which tabs exist and where they point relative to the current page, doesn't actually depend on which team you're on.

## useRelativeHref

`unstable_useRelativeHref(target)` takes a target route and returns a relative URL from the current page to it, without reading the value of the dynamic param:

```tsx
"use client";

import { unstable_useRelativeHref as useRelativeHref } from "next/navigation";

// On /acme/settings (route /[teamId]/settings):
useRelativeHref("/[teamId]/dashboard"); // "./dashboard/"
// On /acme/settings/billing:
useRelativeHref("/[teamId]/dashboard"); // "../dashboard/"
```

The `acme` never appears in the result. The relative reference expresses the target as traversal from the current page, `./` and `../`, so it holds whatever the current team is without naming it. A few things worth knowing:

- The target is a route *pattern*, `/[teamId]/dashboard`, not a concrete path. It's checked against your app's generated route types, so a route that doesn't exist is a type error.
- The result always ends in `/`, so you can append a child segment directly (`href + "reports"`).
- You pass it straight to a `Link` or an `<a>`'s `href`.

The reason this matters for prerendering: `usePathname()` returns the full path, so any request-time param on the route deopts it to dynamic. A relative href only spells out the params between the current page and the target, and when the target is an ancestor, that's none of them, so the result is pure `./` or `../` traversal and stays in the static shell.

## Building the Tab Bar

Because the result ends in `/`, we don't need a call per tab. We point one `useRelativeHref` at the parent route, `/[teamId]`, and append each tab's segment to it. `useSelectedLayoutSegment()` tells us which tab is active:

```tsx
// app/[teamId]/tab-bar.tsx
"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  unstable_useRelativeHref as useRelativeHref,
  useSelectedLayoutSegment,
} from "next/navigation";

export function TabBar({ target, tabs }: { target: Route; tabs: string[] }) {
  const base = useRelativeHref(target);
  const active = useSelectedLayoutSegment();

  return (
    <nav>
      {tabs.map(tab => (
        <Link
          key={tab}
          href={(base + tab) as Route}
          aria-current={tab === active ? "page" : undefined}
        >
          {tab}
        </Link>
      ))}
    </nav>
  );
}
```

```tsx
// app/[teamId]/layout.tsx
<TabBar target="/[teamId]" tabs={["dashboard", "settings", "billing"]} />
```

On `/acme/dashboard`, `useRelativeHref("/[teamId]")` returns `./`, the parent of the current page, so the tabs resolve to `./dashboard`, `./settings`, and `./billing`. None of them names `acme`, so the hrefs prerender into the static shell, on any team. The `as Route` on `base + tab` is the assertion typed routes already ask for on any computed `href`. That leaves one request-time read, `useSelectedLayoutSegment`, which is the active state.

## Highlighting the Active Tab

The active state is the [`useSelectedLayoutSegment()`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment) call, which returns the active child segment of the layout, so `tab === active` marks the current tab. That read is inherently request-time: the prerendered shell can't know whether you're on `dashboard` or `billing`. `useRelativeHref` makes the hrefs static, not the highlight.

So under Cache Components the highlight is the one dynamic part left, and you handle it the way the [NavLink post](/posts/building-an-active-navlink-component-in-nextjs) does. Isolate the `useSelectedLayoutSegment` read behind a small `Suspense` boundary so only the active marker streams in while the links stay static, and if you want the first paint correct, [set `aria-current` with an inline script](/posts/building-an-active-navlink-component-in-nextjs#preventing-flickering-on-first-paint) during HTML parse. The difference from before is that the links no longer force any of that, only the marker does.

One thing to watch: `useRelativeHref(target)` is position-independent, it resolves the same target from anywhere, but `useSelectedLayoutSegment()` reads the layout the component renders in. They line up here because the tab bar is rendered by the layout at `/[teamId]`, which is the target. Render it somewhere else and the hrefs would follow the target while the highlight followed the render position. The proposal sketches an extension where `useSelectedLayoutSegment(target)` takes the same target and removes the mismatch, but that isn't in the first version.

## Route Groups

In the NavLink post I flagged a downside of matching on `useSelectedLayoutSegment()`. Wrap a route in a group like `(tabs)` and the segments shift, so the matching can break. Route groups live in the route tree but never appear in the URL, which is what trips that approach up.

`useRelativeHref` works off the URL, so it sidesteps this. It ignores route groups when computing how far to traverse, and a `/[teamId]/(tabs)/settings` structure produces the same relative hrefs as `/[teamId]/settings`. The tabs never need to know the group is there.

That leaves the highlight. Matched on the segment, it has the same fragility. Matched by comparing the resolved `href` to the current path, the way the inline script does, it reads from the URL too, so a route group changes nothing.

## What Still Deopts

`useRelativeHref` keeps the tab bar static on most of the pages under `/[teamId]`. The cases that still resolve at request time come down to the same thing, a param value landing in the result:

- **The dynamic segment's own page.** Relative resolution drops the current URL's final segment, so a target that resolves to the current page or below it has to spell that segment back out. On `/acme` (route `/[teamId]`), the final segment is the `teamId`, so `useRelativeHref("/[teamId]")` returns `./acme/`, which names the param and deopts. From a sub-page like `/acme/settings` the targets are all ancestors, so they stay static, this only bites on the param page itself.
- **A catch-all between the target and the page.** How far the relative path traverses depends on how many segments the catch-all matched, a per-request value, so the result is computed at request time. That keeps it correct under URL-prefix rewrites, at the cost of never being static there.

The hook never throws. A dynamic segment in the target that isn't on the current route, or a catch-all used as the target, is left as the literal `[param]` text with a development warning, not a runtime error. Correctness is enforced at the type level. None of this breaks the tab bar, and the common case, a tab bar rendered on a sub-page of the dynamic segment, stays static.

## Conclusion

`useRelativeHref` is the right tool for links *inside* a dynamic segment: it builds the `href` from the route pattern without the param, so a tab bar can prerender into the static shell instead of deopting the whole layout. It pairs with `useSelectedLayoutSegment()` for the active state, which is still the request-time part. It isn't a replacement for `usePathname()` in a general active-link component, and it's experimental for now, but for the in-segment navigation case it removes a real source of dynamic reads.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
