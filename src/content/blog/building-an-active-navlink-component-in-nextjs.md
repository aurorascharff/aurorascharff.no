---
author: Aurora Scharff
pubDatetime: 2026-05-23T10:00:00Z
title: Building an Active NavLink Component in Next.js
slug: building-an-active-navlink-component-in-nextjs
featured: false
draft: false
tags:
  - Next.js 16
  - React Server Components
  - App Router
  - Cache Components
  - Navigation
description: "Active link styling is one of the most common things you need in a real application. Here is how to build a reusable NavLink component using useRelativeHref, route segments, and pending state."
---

Active link styling is something almost every Next.js app needs in some form.
The App Router gives us
[`usePathname()`](https://nextjs.org/docs/app/api-reference/functions/use-pathname)
and
[`useSelectedLayoutSegment()`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment)
to read the current route, and from there it is up to us how to style the
matching link.

There is another part of active navigation that is easy to overlook: building
the link itself. A shared navigation under a dynamic route often has to read
the current params just to link to a sibling page. The proposed
`useRelativeHref()` hook lets us construct that destination from a route
pattern without pulling the whole pathname or every parent param into the
component.

In this post we'll build a reusable `NavLink` component using
`useRelativeHref()` for the destination and selected layout segments for the
active state, taking inspiration from React Router. We'll build it up piece by
piece: the render-prop pattern, pending states with `useLinkStatus`, nested
matching, accessibility, and TypeScript. Then we'll make it work with the
current-user Profile link and Cache Components.

It's a bit of a journey, so let's get started.

## Table of contents

## The Use Case

Let's say we have a sidebar nav similar to a social-media app like X: Home,
Search, and a Profile link to the current user. The nav lives in the root
layout, above a few static routes and a dynamic post route:

```text
app/
  layout.tsx
  page.tsx
  search/page.tsx
  u/[handle]/page.tsx
  drop/[id]/page.tsx
```

Without any active-state logic, the nav is just three links:

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

The `ProfileLink` is an async Server Component because its `href` depends on
the current user. `useRelativeHref()` does not replace this fetch. From `/` or
`/search`, the current user's handle is not part of the route, so there is no
route value for the hook to reuse. We'll keep this data dependency and come
back to its Suspense boundary later.

Each link should style itself when it is the current page: bold the text and
fill in the icon. A class swap can handle the bold, but the icon needs to
switch between an outline and a filled variant in JSX. So the active state has
to be available both as a class hook and as a value we can read in the render
tree.

We'll also add one nested route so Profile can stay active below the main
profile page:

```text
app/u/[handle]/followers/page.tsx
```

This gives us a realistic dynamic-parent case for `useRelativeHref()` without
changing the rest of the app.

### How React Router Does It

[React Router's `NavLink`](https://reactrouter.com/api/components/NavLink) has
an API that allows this sort of flexibility. Both `className` and `children`
accept a function that receives `{ isActive, isPending }`, so the consumer
decides what to do with the state. Here is the Home link styled three different
ways:

```tsx
import { NavLink } from "react-router";

// plain string: active styled via aria-current in CSS/Tailwind
<NavLink to="/" className="nav-item aria-[current=page]:font-bold">
  Home
</NavLink>;

// function className: swap a class based on isActive
<NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}>
  Home
</NavLink>;

// function children with isPending: show a pending state while navigating
<NavLink to="/">
  {({ isActive, isPending }) => (
    <>
      <HomeIcon filled={isActive} />
      Home
      {isPending && <Spinner />}
    </>
  )}
</NavLink>;
```

That looks unusual. Why is a styling prop a function? Let's build a `NavLink`
like that for the App Router, and it'll make more sense as we go.

## Building NavLink

### A First Attempt

The simplest version needs two pieces of route information:

- `useRelativeHref()` constructs the actual link from a route pattern.
- `useSelectedLayoutSegments()` tells us which child of the current layout is
  active.

```tsx
// app/components/nav-link.tsx
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
    <Link href={relativeHref} className={isActive ? "active" : undefined}>
      {children}
    </Link>
  );
}
```

The `href` describes where the link goes. It can be a concrete route such as
`/search` or a route pattern such as `/u/[handle]/followers`. The `segment`
describes which child of the layout it represents. We use `null` for an index
route such as Home.

Notice that the wrapper is around `next/link`, not a plain `<a>`. This matters:
`next/link` does client-side navigation, prefetching, and scroll restoration.
Falling back to `<a href>` for in-app navigation would mean a full page reload
on every click, losing router state and any partially streamed UI.

The root navigation can already use the component:

```tsx
<NavLink href="/" segment={null}>
  Home
</NavLink>
<NavLink href="/search" segment="search">
  Search
</NavLink>
```

In the root layout, `useSelectedLayoutSegments()` returns `[]` on `/`,
`["search"]` on `/search`, and `['u', handle]` on a profile route. That makes
Home exact by construction while Profile can stay active on nested pages by
matching the first segment.

### Accepting a className and activeClassName

A single `active` class only goes so far. The moment a consumer wants different
styling for a sidebar link versus a header link, the hardcoded class is in the
way.

Let's let them pass both the base class and the active class as props:

```tsx
type Props = {
  href: string;
  segment: string | null;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
};

export function NavLink({
  href,
  segment,
  className,
  activeClassName,
  children,
}: Props) {
  const relativeHref = useRelativeHref(href);
  const segments = useSelectedLayoutSegments();
  const isActive =
    segment === null ? segments.length === 0 : segments[0] === segment;

  return (
    <Link
      href={relativeHref}
      className={isActive ? `${className} ${activeClassName}` : className}
    >
      {children}
    </Link>
  );
}
```

That covers the most common case. It works fine until we want to render a
leading dot when active, swap an icon for a filled variant, or use a class-name
utility that needs access to `isActive`. For any of those, the consumer needs
the active state itself.

### Exposing isActive with a Render Prop

The way React Router exposes `isActive` is through the
[render prop](https://react.dev/reference/react/Children#calling-a-render-prop-to-customize-rendering)
pattern: instead of accepting a value, the prop can accept a function that
receives the component's internal state and returns the value to use. The
component owns the state, the consumer owns the rendering, and the function is
the bridge between them.

We can apply the same idea to our `NavLink`, on both `className` and `children`.
A small helper handles the value-or-function shape:

```tsx
function resolve(value, props) {
  return typeof value === "function" ? value(props) : value;
}

export function NavLink({ href, segment, className, children, ...rest }) {
  const relativeHref = useRelativeHref(href);
  const segments = useSelectedLayoutSegments();
  const isActive =
    segment === null ? segments.length === 0 : segments[0] === segment;

  return (
    <Link
      href={relativeHref}
      className={resolve(className, { isActive })}
      {...rest}
    >
      {resolve(children, { isActive })}
    </Link>
  );
}
```

Now the Home link can use the state in both places:

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

The consumer can use the function form on one prop, both, or neither.

### Adding isPending

React Router's `NavLink` also exposes `isPending`, which is `true` while the
destination route is loading. One way to add this is with `useTransition` and
`router.push()`, but that means overriding `<Link>`'s click handler and
reimplementing modifier-key detection, scroll restoration, and view
transitions.

Next.js has a better option:
[`useLinkStatus`](https://nextjs.org/docs/app/api-reference/functions/use-link-status).
It tracks the pending state natively inside `<Link>` children without
intercepting clicks. The catch is it has to be called from a component rendered
inside `<Link>`, so we expose `isPending` through the `children` render prop but
not through `className`.

```tsx
import { useLinkStatus } from "next/link";

function NavLinkContent({ isActive, children }) {
  const { pending } = useLinkStatus();
  return <>{resolve(children, { isActive, isPending: pending })}</>;
}
```

The main component delegates `children` to `NavLinkContent`:

```tsx
return (
  <Link
    href={relativeHref}
    className={resolveClassName(className, { isActive })}
    {...rest}
  >
    <NavLinkContent isActive={isActive}>{children}</NavLinkContent>
  </Link>
);
```

Now the consumer can show a pending indicator without replacing `Link`:

```tsx
<NavLink href="/search" segment="search" className="nav-item">
  {({ isActive, isPending }) => (
    <>
      <SearchIcon filled={isActive} />
      Search
      {isPending && <Spinner className="ml-2 h-4 w-4" />}
    </>
  )}
</NavLink>
```

How useful `isPending` is depends on how the destination route is set up. If
the slow parts sit behind Suspense boundaries, the transition commits as soon
as the shell renders and `isPending` may flip off almost immediately.

### Matching Prefixes for Nested Routes

Our segment comparison already gives us prefix matching. The root Profile link
uses `segment="u"`, so it is active on both `/u/aurora` and
`/u/aurora/followers`:

```tsx
async function ProfileLink() {
  const handle = await getCurrentUserHandle();

  return (
    <NavLink href={`/u/${handle}`} segment="u" className="nav-item">
      {({ isActive }) => (
        <>
          <UserIcon filled={isActive} />
          Profile
        </>
      )}
    </NavLink>
  );
}
```

This is also where `useRelativeHref()` and application data have clearly
separate jobs. The current-user query determines _which user's profile_ the
global link opens. Once we are inside `/u/[handle]`, a local profile navigation
can use route patterns without reading the handle again:

```tsx
// app/u/[handle]/layout.tsx
<nav>
  <NavLink href="/u/[handle]" segment={null}>
    Posts
  </NavLink>
  <NavLink href="/u/[handle]/followers" segment="followers">
    Followers
  </NavLink>
</nav>
```

Because this navigation renders in the `[handle]` layout,
`useSelectedLayoutSegments()` returns `[]` for the profile index and
`["followers"]` for the nested page. `useRelativeHref()` constructs both hrefs
from the same dynamic route without a `params` prop.

### Marking the Active Link with aria-current

A nav link is the canonical use case for
[`aria-current="page"`](https://www.w3.org/TR/wai-aria-1.1/#aria-current). It
marks the current page for assistive technology, and we can style from the same
attribute.

There is a small distinction to make now that links can stay active on nested
pages. `isActive` can use prefix matching, but `aria-current="page"` should only
mark the exact current page:

```tsx
const isIndex = segment === null;
const isCurrent = isIndex
  ? segments.length === 0
  : segments.length === 1 && segments[0] === segment;
const isActive = isIndex ? isCurrent : segments[0] === segment;
```

We expose the broader state with `data-active` and reserve `aria-current` for
the exact match:

```tsx
<Link
  href={relativeHref}
  data-active={isActive || undefined}
  aria-current={isCurrent ? "page" : undefined}
  className={resolveClassName(className, { isActive })}
  {...rest}
>
```

That supports CSS-only styling without making the accessibility state claim
that a parent route is the current page:

```tsx
<NavLink
  href="/search"
  segment="search"
  className="data-active:font-semibold aria-[current=page]:text-accent"
>
  Search
</NavLink>
```

### Adding TypeScript

In TypeScript we want the render-prop shape to type-check, consumers to keep
autocomplete for every prop `next/link` accepts, and the target to use Next.js
route types.

```tsx
import type { Route } from "next";

type ActiveProps = { isActive: boolean };
type RenderProps = ActiveProps & { isPending: boolean };
type Renderable<T> = T | ((props: RenderProps) => T);

type Props<T extends string> = Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className" | "children"
> & {
  href: Route<T>;
  segment: string | null;
  className?: string | ((props: ActiveProps) => string | undefined);
  children?: Renderable<React.ReactNode>;
};
```

The `className` prop receives `{ isActive }`, since `isPending` is only
available inside `<Link>` through `useLinkStatus`. The `children` prop receives
both values. `Props` inherits everything else from `next/link`.

`useRelativeHref()` returns a computed string, so we assert it as a `Route`
when passing it to a typed `<Link>`, just like any other computed href:

```tsx
<Link href={relativeHref as Route}>{children}</Link>
```

### The Full NavLink

Putting it all together, here is the complete component:

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
  const isIndex = segment === null;
  const isCurrent = isIndex
    ? segments.length === 0
    : segments.length === 1 && segments[0] === segment;
  const isActive = isIndex ? isCurrent : segments[0] === segment;

  return (
    <Link
      href={relativeHref as Route}
      data-active={isActive || undefined}
      aria-current={isCurrent ? "page" : undefined}
      className={resolveClassName(className, { isActive })}
      {...rest}
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

Back in the root layout, Home and Search are static. Profile still sits behind
the current-user query:

```tsx
<nav>
  <NavLink href="/" segment={null} className="nav-item data-active:font-bold">
    {({ isActive }) => (
      <>
        <HomeIcon filled={isActive} />
        Home
      </>
    )}
  </NavLink>

  <NavLink
    href="/search"
    segment="search"
    className="nav-item data-active:font-bold"
  >
    {({ isActive }) => (
      <>
        <SearchIcon filled={isActive} />
        Search
      </>
    )}
  </NavLink>

  <Suspense fallback={<NavLinkSkeleton icon={<UserIcon />} label="Profile" />}>
    <ProfileLink />
  </Suspense>
</nav>
```

One thing to be aware of: a function `className` or function `children` is not
serializable, so it cannot be passed across the server-client boundary. If the
layout is a Server Component, extract the rendered link into a small Client
Component that owns those functions. Plain string props and static children can
cross the boundary normally.

## Preventing Flickering on First Paint

The original `usePathname()` version had a difficult first-paint problem. On a
dynamic route, the full pathname could not always be part of the static shell,
so the active state either appeared after hydration or needed an inline script
to correct the DOM before paint.

This implementation avoids reading the full pathname. The href only contains
the relative path needed to reach its target, and active matching reads the
selected child segments from the owning layout. When those results do not
contain a request-time dynamic value, the complete link can render in the
static shell with its active state already set.

That means there is no inactive-first render to repair and no duplicated
matching logic in an inline script.

The layout placement matters. `useSelectedLayoutSegments()` is relative to the
layout where the navigation renders, while `useRelativeHref(target)` is
position-independent. Keeping the navigation in the layout that owns its links
makes those two views agree, and the layout remains mounted during soft
navigation.

## NavLink Under cacheComponents

[Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
lets everything outside dynamic boundaries become part of a prerendered shell.
The useful property of `useRelativeHref()` is that a link can stay in that shell
even when an absolute pathname would contain a request-time parameter.

For example, while rendering below `/u/[handle]`, a link to
`/u/[handle]/followers` can reuse the current route's handle without the
component awaiting `params`. The selected segment used for active styling is
the static child name `followers`, not the dynamic handle.

There are still cases where `useRelativeHref()` has to resolve at request time:

- The result itself must include an unknown dynamic parameter.
- The target is at or below the current dynamic route and has to spell that
  parameter back out.
- A catch-all route makes the amount of relative traversal request-specific.

Those cases belong behind Suspense. The difference is that the boundary is
only needed when the relative result actually depends on request-time data,
not merely because the full pathname contains a dynamic segment somewhere.

The root Profile link is a separate example. It needs the authenticated user,
not the handle from whichever profile happens to be open. That data read still
belongs in an async Server Component:

```tsx
async function ProfileLink() {
  const handle = await getCurrentUserHandle();

  return (
    <NavLink href={`/u/${handle}`} segment="u" className="nav-item">
      {({ isActive }) => (
        <>
          <UserIcon filled={isActive} />
          Profile
        </>
      )}
    </NavLink>
  );
}
```

Wrap it in a boundary with a layout-stable fallback:

```tsx
<Suspense fallback={<NavLinkSkeleton icon={<UserIcon />} label="Profile" />}>
  <ProfileLink />
</Suspense>
```

The skeleton should share the final link's dimensions so the sidebar does not
shift when the user data resolves.

## Gotchas

`useRelativeHref()` can only fill a dynamic segment from the current route when
the target overlaps it. On `/u/aurora/followers`, the target `/u/[handle]` can
reuse `aurora`. On `/search`, there is no handle to reuse. Passing
`/u/[handle]` there leaves the dynamic segment unresolved and should warn in
development. Fetch the current user for that case.

The selected-segment comparison is relative to its rendering layout. A root
sidebar should compare root segments such as `search` and `u`; a profile tab bar
in the `[handle]` layout should compare local segments such as `followers`.
Moving the same component to a different layout changes what its `segment` prop
means.

Catch-all routes and rewrites need extra care. Catch-alls can make relative
depth request-specific, and a rewrite can make the public URL shape differ from
the route tree used to construct the target. These are routing concerns rather
than active-link concerns, but they affect any component that builds relative
URLs.

## Conclusion

We started with a hardcoded active class and worked through the same pieces a
production navigation needs: render props, `useLinkStatus` for pending states,
nested matching, `aria-current`, TypeScript, and Cache Components.

The difference is that the component no longer reads and parses the full
pathname. `useRelativeHref()` constructs the destination from a route pattern,
while `useSelectedLayoutSegments()` determines which child of the owning layout
is active. The two hooks solve separate halves of the same navigation problem.

The social-media sidebar still fetches the current user for the global Profile
link, because routing cannot replace application data. Once navigation is
inside a dynamic profile route, relative targets can reuse that route value
without threading params through the component.

You might not need all of this. A plain link and a selected segment are a fine
starting point. But if you want one reusable `NavLink` that supports dynamic
route patterns, render props, pending state, nested active styling, and a static
shell, this is the complete shape.

I hope this post has been helpful. Please let me know if you have any questions
or comments, and follow me on
[Bluesky](https://bsky.app/profile/aurorascharff.no) or
[X](https://x.com/aurorascharff) for more updates. Happy coding!
