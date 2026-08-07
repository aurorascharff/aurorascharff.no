---
author: Aurora Scharff
pubDatetime: 2026-05-23T10:00:00Z
title: Building an Active NavLink Component with useRelativeHref in Next.js
slug: building-an-active-navlink-component-in-nextjs
featured: false
draft: false
tags:
  - Next.js 16
  - React Server Components
  - App Router
  - Cache Components
  - Navigation
description: "Build a reusable NavLink with useRelativeHref, selected layout segments, pending states, and Cache Components."
---

Active link styling is something almost every Next.js app needs in some form.
The App Router gives us
[`usePathname()`](https://nextjs.org/docs/app/api-reference/functions/use-pathname)
and
[`useSelectedLayoutSegment()`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment)
to read the current route, and from there it is up to us to style the matching
link.

That works well for a small navigation, but a reusable component has to answer
two questions:

1. Where does the link go?
2. Is that destination active?

The proposed `useRelativeHref()` hook gives us a route-aware way to answer the
first question without reading every dynamic parameter above the destination.
We can combine it with selected layout segments for active matching and build a
`NavLink` that works with Cache Components.

Let's build it.

## Table of contents

## The Use Case

We'll use the same navigation as the
[`next16-social-media`](https://github.com/aurorascharff/next16-social-media)
app: Home, Search, and a Profile link for the current user.

```text
app/
  layout.tsx
  page.tsx
  search/page.tsx
  u/[handle]/page.tsx
  drop/[id]/page.tsx
```

Without active-state logic, the root navigation looks like this:

```tsx
// app/layout.tsx
<nav>
  <Link href="/">
    <HomeIcon /> Home
  </Link>
  <Link href="/search">
    <SearchIcon /> Search
  </Link>
  <ProfileLink />
</nav>;

async function ProfileLink() {
  const handle = await getCurrentUserHandle();

  return (
    <Link href={`/u/${handle}`}>
      <UserIcon /> Profile
    </Link>
  );
}
```

The Profile link is different from Home and Search. Its destination depends on
the current user, so it still has to fetch the handle. `useRelativeHref()` does
not replace that data dependency: it can reuse a dynamic value from the current
route, but it cannot invent a value that is not there.

We'll keep the async Profile link and return to its Suspense boundary later.

Each link should style itself when it is active. We want to bold the label,
fill the icon, and keep Profile active while viewing one of that user's nested
pages.

## Adding a Nested Profile Route

The existing app mostly navigates between top-level routes, where an absolute
href such as `/search` is already simple. To show where relative route patterns
help, we'll add a Followers page below the dynamic profile route:

```text
app/
  u/
    [handle]/
      layout.tsx
      page.tsx
      followers/page.tsx
```

The profile layout can render a small local navigation:

```tsx
<nav>
  <Link href={`/u/${handle}`}>Posts</Link>
  <Link href={`/u/${handle}/followers`}>Followers</Link>
</nav>
```

This is the interesting case. The navigation is already inside `[handle]`, but
building absolute links still requires reading the handle. That request-time
read can move the navigation out of the static shell under Cache Components.

## Building Links with useRelativeHref

`useRelativeHref()` accepts a route pattern and returns an href relative to the
current page:

```tsx
"use client";

import Link from "next/link";
import { unstable_useRelativeHref as useRelativeHref } from "next/navigation";

export function FollowersLink() {
  const href = useRelativeHref("/u/[handle]/followers");
  return <Link href={href}>Followers</Link>;
}
```

The target is a route pattern, not a concrete URL. When this component renders
inside `/u/aurora`, Next.js can reuse the current `[handle]` value while
expressing as much of the destination as possible through relative traversal.
The component never reads `params`, calls `useParams()`, or parses the current
pathname.

The result can be passed directly to `next/link`, a plain anchor, or a
design-system component that accepts an `href`. It is a lower-level routing
primitive rather than an active-link component.

The root navigation can use the same primitive:

```tsx
const homeHref = useRelativeHref("/");
const searchHref = useRelativeHref("/search");
```

Those routes do not contain a dynamic parent, so relative hrefs are not
necessary there. Using the same component is still useful because it gives the
whole navigation one API.

## Reading the Active Segment

Constructing the href only solves half of the problem. We still need to know
which link is active.

Our navigation components live in layouts, so
`useSelectedLayoutSegments()` gives us the active route below the owning
layout. In the root navigation:

```tsx
const segments = useSelectedLayoutSegments();

// /                         -> []
// /search                   -> ["search"]
// /u/aurora                 -> ["u", "aurora"]
// /u/aurora/followers       -> ["u", "aurora", "followers"]
```

Home is active when there are no selected segments. Search is active when the
first segment is `search`, and Profile is active when the first segment is `u`.
That naturally keeps Profile active on nested profile pages.

Inside the `[handle]` layout, the same hook is relative to that layout:

```tsx
const segments = useSelectedLayoutSegments();

// /u/aurora                 -> []
// /u/aurora/followers       -> ["followers"]
```

This gives the Posts and Followers links their local active state without
comparing full URL strings.

The component must render under the layout whose children it represents.
`useRelativeHref(target)` is position-independent, while selected layout
segments are intentionally relative to the rendering layout. That is a useful
constraint for navigation: layouts persist across client navigation, so the
component and its internal state stay mounted while the page changes.

## Building NavLink

We can now combine the relative href with the selected segment:

```tsx
// components/ui/nav-link.tsx
"use client";

import Link from "next/link";
import {
  unstable_useRelativeHref as useRelativeHref,
  useSelectedLayoutSegments,
} from "next/navigation";

export function NavLink({ href, segment, children }) {
  const relativeHref = useRelativeHref(href);
  const segments = useSelectedLayoutSegments();
  const isActive =
    segment === null ? segments.length === 0 : segments[0] === segment;

  return (
    <Link href={relativeHref} aria-current={isActive ? "page" : undefined}>
      {children}
    </Link>
  );
}
```

The `href` describes the destination. The `segment` describes where that
destination sits below the current layout. We use `null` for an index route.

The root navigation becomes:

```tsx
<nav>
  <NavLink href="/" segment={null}>
    <HomeIcon /> Home
  </NavLink>
  <NavLink href="/search" segment="search">
    <SearchIcon /> Search
  </NavLink>
  <Suspense fallback={<ProfileLinkSkeleton />}>
    <ProfileLink />
  </Suspense>
</nav>
```

The async Profile link passes a concrete href after loading the current user:

```tsx
async function ProfileLink() {
  const handle = await getCurrentUserHandle();

  return (
    <NavLink href={`/u/${handle}`} segment="u">
      <UserIcon /> Profile
    </NavLink>
  );
}
```

And the profile layout can use route patterns without reading its handle:

```tsx
<nav>
  <NavLink href="/u/[handle]" segment={null}>
    Posts
  </NavLink>
  <NavLink href="/u/[handle]/followers" segment="followers">
    Followers
  </NavLink>
</nav>
```

## Exposing isActive with a Render Prop

The active state has to do more than toggle a class in our social-media
sidebar. The icon also changes from an outline to a filled variant.

Like React Router's `NavLink`, we can expose the state through render props. A
small helper handles the value-or-function shape:

```tsx
function resolve(value, props) {
  return typeof value === "function" ? value(props) : value;
}
```

We can use it for both `className` and `children`:

```tsx
export function NavLink({ href, segment, className, children, ...rest }) {
  const relativeHref = useRelativeHref(href);
  const segments = useSelectedLayoutSegments();
  const isActive =
    segment === null ? segments.length === 0 : segments[0] === segment;

  return (
    <Link
      {...rest}
      href={relativeHref}
      aria-current={isActive ? "page" : undefined}
      className={resolve(className, { isActive })}
    >
      {resolve(children, { isActive })}
    </Link>
  );
}
```

Now Home can fill its icon when active:

```tsx
<NavLink
  href="/"
  segment={null}
  className={({ isActive }) => (isActive ? "nav-item font-bold" : "nav-item")}
>
  {({ isActive }) => (
    <>
      <HomeIcon filled={isActive} />
      Home
    </>
  )}
</NavLink>
```

For CSS-only styling, `aria-current` is enough:

```tsx
<NavLink
  href="/search"
  segment="search"
  className="nav-item aria-[current=page]:font-bold"
>
  Search
</NavLink>
```

## Adding isPending

Next.js exposes pending navigation state through
[`useLinkStatus()`](https://nextjs.org/docs/app/api-reference/functions/use-link-status).
It has to run inside the `Link`, so we read it in a small child component:

```tsx
import { useLinkStatus } from "next/link";

function NavLinkContent({ isActive, children }) {
  const { pending } = useLinkStatus();

  return <>{resolve(children, { isActive, isPending: pending })}</>;
}
```

The outer component delegates its children to `NavLinkContent`:

```tsx
<Link
  {...rest}
  href={relativeHref}
  aria-current={isActive ? "page" : undefined}
  className={resolveClassName(className, { isActive })}
>
  <NavLinkContent isActive={isActive}>{children}</NavLinkContent>
</Link>
```

This keeps all of `next/link`'s behavior rather than replacing its click
handler with `router.push()`.

## The Full Component

Here is the complete typed version:

```tsx
// components/ui/nav-link.tsx
"use client";

import type { Route } from "next";
import type { ComponentProps, ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import {
  unstable_useRelativeHref as useRelativeHref,
  useSelectedLayoutSegments,
} from "next/navigation";

type ActiveProps = { isActive: boolean };
type RenderProps = ActiveProps & { isPending: boolean };
type Renderable<T> = T | ((props: RenderProps) => T);

type Props<T extends string> = Omit<
  ComponentProps<typeof Link>,
  "href" | "className" | "children"
> & {
  href: Route<T>;
  segment: string | null;
  className?: string | ((props: ActiveProps) => string | undefined);
  children?: Renderable<ReactNode>;
};

function resolve<T>(value: Renderable<T> | undefined, props: RenderProps) {
  return typeof value === "function"
    ? (value as (props: RenderProps) => T)(props)
    : value;
}

function resolveClassName(
  value: Props<string>["className"],
  props: ActiveProps
) {
  return typeof value === "function" ? value(props) : value;
}

export function NavLink<T extends string>({
  href,
  segment,
  className,
  children,
  ...rest
}: Props<T>) {
  const relativeHref = useRelativeHref(href);
  const segments = useSelectedLayoutSegments();
  const isActive =
    segment === null ? segments.length === 0 : segments[0] === segment;

  return (
    <Link
      {...rest}
      href={relativeHref as Route}
      aria-current={isActive ? "page" : undefined}
      className={resolveClassName(className, { isActive })}
    >
      <NavLinkContent isActive={isActive}>{children}</NavLinkContent>
    </Link>
  );
}

function NavLinkContent({
  isActive,
  children,
}: {
  isActive: boolean;
  children?: Renderable<ReactNode>;
}) {
  const { pending } = useLinkStatus();
  return <>{resolve(children, { isActive, isPending: pending })}</>;
}
```

The relative href itself also describes how the target relates to the current
page through `./` and `../` traversal. A lower-level component could use those
directions for its own path-based matching rules. This `NavLink` already lives
in the layout that owns its routes, so selected layout segments give it the
exact active behavior we need.

## Cache Components

The largest difference from the original `usePathname()` implementation is
what can remain in the static shell.

`usePathname()` returns the full pathname. On `/u/aurora/followers`, that value
necessarily contains the request-time handle. `useRelativeHref()` only includes
the parts needed to reach its target, so a link between routes under the same
dynamic profile can often avoid including the handle at all.

That lets the profile navigation stay in the static shell when its relative
results do not contain request-time values. The active state comes from the
static child segment, such as `followers`, rather than the complete pathname.
No inline script is needed to correct the active state after hydration.

There are still cases where `useRelativeHref()` resolves at request time:

- Its result has to include an unknown dynamic parameter.
- The target is the current dynamic route or below it and must spell the final
  dynamic segment back out.
- A catch-all segment makes the amount of relative traversal request-specific.

Those cases still need Suspense. The difference is that the boundary is only
required when the relative result actually needs a request-time value, rather
than whenever any dynamic parameter exists in the pathname.

The current-user Profile link is a separate data dependency and still needs its
own stable fallback:

```tsx
<Suspense fallback={<ProfileLinkSkeleton />}>
  <ProfileLink />
</Suspense>
```

The fallback should match the final link's dimensions so the sidebar does not
shift when the handle resolves.

## Conclusion

We started with the navigation from `next16-social-media`: static Home and
Search links, plus an async Profile link for the current user. Adding a nested
Followers route showed the problem that `useRelativeHref()` solves: linking
within a dynamic route without reading and interpolating its parameter in the
shared navigation.

The final `NavLink` uses each routing primitive for one job:

- `useRelativeHref()` constructs a destination from a route pattern.
- `useSelectedLayoutSegments()` determines the active child of the owning
  layout.
- `useLinkStatus()` provides pending state without replacing `Link` behavior.

On top of those primitives, the component adds render props, `aria-current`,
typed routes, and a single API for both the root sidebar and nested profile
navigation.

The async Profile link still fetches the current user because no routing API can
derive data that is not present in the route. Everything else stays small,
composable, and aligned with the App Router's persistent-layout model.
