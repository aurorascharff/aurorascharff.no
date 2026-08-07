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
description: "Build active navigation that stays in the static shell by combining useRelativeHref with route-segment matching."
---

Active link styling is something almost every Next.js app needs in some form.
The App Router gives us
[`usePathname()`](https://nextjs.org/docs/app/api-reference/functions/use-pathname)
and
[`useSelectedLayoutSegment()`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment)
to read the current route, and from there it is up to us to style the matching
link.

That works, but a shared navigation component often needs to solve two related
problems:

1. Where does each link go?
2. Which link is active?

The first question becomes surprisingly difficult when the URL contains a
dynamic parent segment. A team navigation rendered under `/[teamId]` needs to
link to the current team's projects and settings, but the static shell may not
know that the current team is `acme`.

The proposed `useRelativeHref()` hook gives us a route-aware way to construct
those links without reading the concrete parameter. Combined with
`useSelectedLayoutSegment()`, it also gives us a small active-link component
that can stay in the static shell in the common case.

Let's build it.

## Table of contents

## The Use Case

Imagine a dashboard with this route structure:

```text
app/
  [teamId]/
    layout.tsx
    page.tsx
    projects/page.tsx
    monitoring/page.tsx
    settings/page.tsx
    settings/billing/page.tsx
```

The team layout renders a persistent sidebar. Projects should be active on
`/acme/projects`, and Settings should remain active on
`/acme/settings/billing`.

Without a route-aware primitive, we need the current `teamId` to build every
absolute link:

```tsx
<Link href={`/${teamId}/projects`}>Projects</Link>
<Link href={`/${teamId}/monitoring`}>Monitoring</Link>
<Link href={`/${teamId}/settings`}>Settings</Link>
```

Reading `params` or `usePathname()` brings the request-time value into the
component. Under Cache Components, that can move the navigation out of the
static shell and behind Suspense.

## Building Links with useRelativeHref

`useRelativeHref()` accepts a route pattern and returns an href relative to the
current page:

```tsx
"use client";

import Link from "next/link";
import { unstable_useRelativeHref as useRelativeHref } from "next/navigation";

export function ProjectsLink() {
  const href = useRelativeHref("/[teamId]/projects");
  return <Link href={href}>Projects</Link>;
}
```

On `/acme/settings`, the result is `./projects/`. On a deeper page such as
`/acme/settings/billing`, it is `../projects/`. Both resolve to
`/acme/projects`, but neither contains the value of `[teamId]`.

That difference matters for prerendering. The link can be included in the
static shell because its output does not depend on the request-time team ID.
It is also position-independent: the same component produces the same href
whether it is rendered by a layout, a page, or a parallel route.

The result can be passed directly to `next/link`, an anchor, or a design-system
component that accepts an `href`. `useRelativeHref()` is a lower-level routing
primitive rather than a navigation component.

## Reading the Active Segment

Constructing the href only solves half of the problem. We still need to know
which item is active.

Because this navigation is rendered by the `[teamId]` layout, the first
selected layout segment tells us exactly what we need:

```tsx
const segment = useSelectedLayoutSegment();

// /acme/projects          -> "projects"
// /acme/settings          -> "settings"
// /acme/settings/billing  -> "settings"
```

Unlike a full pathname comparison, this naturally keeps Settings active on
nested settings pages. It also avoids parsing URL strings in application code.

There is one important constraint: `useSelectedLayoutSegment()` is relative to
the layout where the component renders, while `useRelativeHref(target)` is
position-independent. The two agree here because the navigation lives in the
layout that owns these child routes. That is also the right place for the
sidebar: layouts persist across navigation, so its state is preserved while the
page below it changes.

## Building NavLink

We can now combine the relative href with the selected segment:

```tsx
// app/components/nav-link.tsx
"use client";

import Link from "next/link";
import {
  unstable_useRelativeHref as useRelativeHref,
  useSelectedLayoutSegment,
} from "next/navigation";

export function NavLink({ href, segment, children }) {
  const relativeHref = useRelativeHref(href);
  const activeSegment = useSelectedLayoutSegment();
  const isActive = activeSegment === segment;

  return (
    <Link
      href={relativeHref}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive || undefined}
    >
      {children}
    </Link>
  );
}
```

The sidebar can use route patterns without knowing the current team:

```tsx
<nav>
  <NavLink href="/[teamId]/projects" segment="projects">
    Projects
  </NavLink>
  <NavLink href="/[teamId]/monitoring" segment="monitoring">
    Monitoring
  </NavLink>
  <NavLink href="/[teamId]/settings" segment="settings">
    Settings
  </NavLink>
</nav>
```

The `href` describes where the link goes. The `segment` describes which child
of the current layout it represents.

## Exposing isActive with a Render Prop

Like React Router's `NavLink`, we can expose the active state through
`className` and `children` render props. The component owns the route state,
while the consumer decides how each state should look.

```tsx
function resolve(value, props) {
  return typeof value === "function" ? value(props) : value;
}

export function NavLink({ href, segment, className, children, ...rest }) {
  const relativeHref = useRelativeHref(href);
  const activeSegment = useSelectedLayoutSegment();
  const isActive = activeSegment === segment;

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

That lets a consumer swap both classes and icons:

```tsx
<NavLink
  href="/[teamId]/settings"
  segment="settings"
  className={({ isActive }) =>
    isActive ? "nav-item font-semibold" : "nav-item"
  }
>
  {({ isActive }) => (
    <>
      <SettingsIcon filled={isActive} />
      Settings
    </>
  )}
</NavLink>
```

For CSS-only styling, `aria-current` is enough:

```tsx
<NavLink
  href="/[teamId]/settings"
  segment="settings"
  className="nav-item aria-[current=page]:font-semibold"
>
  Settings
</NavLink>
```

## Adding isPending

Next.js exposes pending navigation state through `useLinkStatus()`. It has to
run inside the `Link`, so we read it in a small child component:

```tsx
import { useLinkStatus } from "next/link";

function NavLinkContent({ isActive, children }) {
  const { pending } = useLinkStatus();

  return <>{resolve(children, { isActive, isPending: pending })}</>;
}
```

The outer component passes the active state into it:

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

This keeps Next.js's normal link behavior, including prefetching, modifier-key
clicks, scroll restoration, and view transitions.

## The Full Component

Here is the complete typed version:

```tsx
// app/components/nav-link.tsx
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
  segment: string;
  exact?: boolean;
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
  exact,
  className,
  children,
  ...rest
}: Props<T>) {
  const relativeHref = useRelativeHref(href);
  const segments = useSelectedLayoutSegments();
  const isActive = exact
    ? segments.length === 1 && segments[0] === segment
    : segments[0] === segment;

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

Prefix matching comes from the first selected segment. The optional `exact`
prop checks that there are no additional selected segments below it.

The relative href itself also describes how the target relates to the current
page through `./` and `../` traversal. That is useful for lower-level components
that want their own path-based matching rules. For this `NavLink`, the selected
segments already express the exact and nested behavior we want, so we use each
primitive for one job: `useRelativeHref()` constructs the destination and
`useSelectedLayoutSegments()` determines the active state.

## Cache Components

The largest difference from a `usePathname()` implementation is what can remain
in the static shell.

`usePathname()` returns the whole pathname. On `/acme/settings`, it necessarily
contains the request-time value `acme`. `useRelativeHref()` only includes the
parts needed to move from the current route to the target, so sibling and
ancestor links usually contain no dynamic values at all.

That means the common dashboard navigation can be prerendered without an
inline script and without placing every link behind Suspense. The initial HTML
already contains usable links, and the selected static child segment can render
the active state.

There are still cases where `useRelativeHref()` resolves at request time:

- The result has to include an unknown dynamic parameter.
- The target is the current dynamic route or below it and must spell the final
  dynamic segment back out.
- A catch-all segment makes the amount of relative traversal request-specific.

Those cases still need a Suspense boundary. The important difference is that
the boundary is only required when the relative result actually depends on a
request-time value, rather than whenever any dynamic parameter exists anywhere
in the pathname.

`useRelativeHref()` also does not replace application data. A Profile link that
depends on the authenticated user's handle still needs to fetch that handle and
render behind an appropriate Suspense boundary. The hook reuses dynamic values
already present in the current route; it does not invent values for unrelated
dynamic segments.

## Conclusion

With `useRelativeHref()`, an active navigation component no longer needs to read
and parse the entire pathname just to link within a dynamic route. The route
pattern builds a static relative href, while `useSelectedLayoutSegments()`
answers which child of the owning layout is active.

The resulting `NavLink` still adds useful higher-level behavior: render props,
pending state, `aria-current`, exact matching, and integration with
`next/link`. But the routing primitive underneath it is smaller and more
composable. It can power a link, a tab, a menu item, or any design-system
component that accepts an href.

The result is one component that works for a persistent layout navigation,
keeps dynamic parent values out of its hrefs, stays active across nested pages,
and preserves the behavior of `next/link`.
