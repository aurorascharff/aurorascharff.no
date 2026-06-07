---
author: Aurora Scharff
pubDatetime: 2026-05-23T10:00:00Z
title: Building an Active NavLink Component in Next.js
slug: building-an-active-navlink-component-in-nextjs
featured: false
draft: true
tags:
  - Next.js 16
  - React Server Components
  - App Router
  - Cache Components
  - Navigation
description: "Active link styling is one of the most common things you need in a real application. Here is how to build a reusable NavLink component for a Next.js app, taking inspiration from React Router, that handles Cache Components and flicker-free hydration."
---

Active link styling is something almost every Next.js app needs in some form. The App Router gives us [`usePathname()`](https://nextjs.org/docs/app/api-reference/functions/use-pathname) and [`useSelectedLayoutSegment()`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment) to read the current route, and from there it is up to us how to style the matching link.

- **`usePathname()`** compares against each link's `href` directly. Works anywhere.
- **`useSelectedLayoutSegment()`** matches route segments instead of the full pathname. Good for layouts where each link maps to a top-level segment.

In this post we'll build a reusable `NavLink` component on top of `usePathname()`, taking inspiration from React Router. First we'll build it up piece by piece: the render-prop pattern, pending states with `useLinkStatus`, prefix matching, accessibility, and TypeScript. Then we'll compare it with a `useSelectedLayoutSegments` alternative, add an inline script to prevent flickering on first paint, and make it all work under `cacheComponents`.

It's a bit of a journey, so let's get started.

## Table of contents

## The Use Case

Let's say we have a sidebar nav similar to a Social Media like X: Home, Search, and a Profile link to the current user. The nav lives in the root layout, above a few static routes and a dynamic post route:

```
app/
  layout.tsx
  page.tsx
  search/page.tsx
  u/[handle]/page.tsx
  drop/[id]/page.tsx
```

Without any active-state logic, the nav is just three links. Two are static, and the Profile link's `href` depends on the current user's handle:

```tsx
// app/layout.tsx
<nav>
  <Link href="/"><HomeIcon /> Home</Link>
  <Link href="/search"><SearchIcon /> Search</Link>
  <ProfileLink />
</nav>

async function ProfileLink() {
  const handle = await getCurrentUserHandle();
  return <Link href={`/u/${handle}`}><UserIcon /> Profile</Link>;
}
```

The `ProfileLink` is an async Server Component because its `href` depends on the current user. Without a `Suspense` boundary around it, the entire layout blocks until the handle resolves. That's fine for now, but we'll come back to it.

Each link should style itself when it is the current page: bold the text and fill in the icon. A class swap can handle the bold, but the icon needs to switch between an outline and a filled variant in JSX. So the active state has to be available both as a class hook and as a value we can read in the render tree.

### How React Router Does It

[React Router's `NavLink`](https://reactrouter.com/api/components/NavLink) has an API that allows this sort of flexibility. Both `className` and `children` accept a function that receives `{ isActive, isPending }`, so the consumer decides what to do with the state. Here is the Home link styled three different ways:

```tsx
import { NavLink } from "react-router";

// plain string: active styled via aria-current in CSS/Tailwind
<NavLink to="/" className="nav-item aria-[current=page]:font-bold">
  Home
</NavLink>

// function className: swap a class based on isActive
<NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")}>
  Home
</NavLink>

// function children: change the rendered content based on isActive
<NavLink to="/">
  {({ isActive }) => (
    <>
      <HomeIcon filled={isActive} />
      Home
    </>
  )}
</NavLink>

// function className with isPending: show a pending state while navigating
<NavLink to="/" className={({ isActive, isPending }) =>
  isPending ? "nav-item opacity-50" : isActive ? "nav-item font-bold" : "nav-item"
}>
  Home
</NavLink>
```

That looks unusual. Why is a styling prop a function? Let's build a `NavLink` like that for the App Router, and it'll make more sense as we go.

## Building NavLink

### A First Attempt

The simplest version just compares `usePathname()` against the link's `href` and toggles a class:

```tsx
// app/components/nav-link.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link href={href} className={isActive ? "active" : undefined}>
      {children}
    </Link>
  );
}
```

Notice that the wrapper is around `next/link`, not a plain `<a>`. This matters: `next/link` does client-side navigation, automatic prefetching of routes in the viewport, and scroll restoration. Falling back to `<a href>` for in-app navigation would mean a full page reload on every click, losing router state and any partially-streamed UI. Keep the underlying `Link` for any internal route.

The [docs also recommend](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment#creating-an-active-link-component) `useSelectedLayoutSegment()` for active link components. It works well when your nav lives in a layout and each link maps to a top-level segment like `/search` or `/bookmarks`. But it gets fragile as soon as the route structure changes, a route group like `(marketing)` shifts what counts as a "segment." For a general-purpose `NavLink` we can drop anywhere without worrying about route structure, `usePathname()` is still the most natural API.

### Accepting a className and activeClassName

A single `active` class only goes so far. The moment a consumer wants different styling for a sidebar link versus a header link, the hardcoded class is in the way.

Let's let them pass both the base class and the active class as props:

```tsx
// app/components/nav-link.tsx
type Props = {
  href: string;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
};

export function NavLink({ href, className, activeClassName, children }: Props) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={isActive ? `${className} ${activeClassName}` : className}
    >
      {children}
    </Link>
  );
}
```

That covers the most common case. It works fine until we want to do something the two-class shape can't express: render a leading dot when active, swap an icon for a filled variant, or use a class-name utility like `clsx` that needs access to `isActive`. For any of those, the consumer needs `isActive` itself.

### Exposing isActive with a Render Prop

The way React Router exposes `isActive` is through the [render prop](https://react.dev/reference/react/Children#calling-a-render-prop-to-customize-rendering) pattern: instead of accepting a string, the prop accepts a function that receives the component's internal state and returns the value to use. The component owns the state, the consumer owns the rendering, and the function is the bridge between them. That is why `className` is a function. The component cannot know what classes the consumer wants for each state, so it hands them the state and lets them decide.

We can apply the same idea to our `NavLink`, on both `className` and `children`. A small helper handles the "value or function" shape so consumers can still pass a plain value when they don't need the active state:

```tsx
// app/components/nav-link.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function resolve(value, props) {
  return typeof value === "function" ? value(props) : value;
}

export function NavLink({ href, className, children, ...rest }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link href={href} className={resolve(className, { isActive })} {...rest}>
      {resolve(children, { isActive })}
    </Link>
  );
}
```

Now the consumer can pass either a plain value or a function. For `className`, the function shape lets us swap classes based on `isActive`. For `children`, it lets us change what gets rendered inside the link. Here is the Home link from our sidebar with both:

```tsx
<NavLink href="/" className={({ isActive }) => (isActive ? "nav-item font-bold" : "nav-item")}>
  {({ isActive }) => (
    <>
      <HomeIcon filled={isActive} />
      Home
    </>
  )}
</NavLink>
```

The function `className` swaps a `font-bold` modifier, and the function `children` swaps the icon between outline and filled. The consumer can use the function form on one, both, or neither, depending on what they need. Anyone who just wants a static class or plain text still passes a string, because the helper falls through to the value when it isn't a function.

### Adding isPending

React Router's `NavLink` also exposes `isPending`, which is `true` while the destination route is loading. One way to add this is with `useTransition` and `router.push()`, but that means overriding `<Link>`'s click handler and reimplementing things like modifier-key detection, scroll restoration, and view transitions.

Next.js has a better option: [`useLinkStatus`](https://nextjs.org/docs/app/api-reference/functions/use-link-status). It tracks the pending state natively inside `<Link>` children without intercepting clicks. The catch is it has to be called from a component rendered *inside* `<Link>`, so we can expose `isPending` through the `children` render prop but not through `className`. That's a reasonable trade-off: `className` still gets `isActive`, and `children` gets both.

We add a small inner component that reads the link status and resolves `children`:

```tsx
import { useLinkStatus } from "next/link";

function NavLinkContent({ isActive, children }) {
  const { pending } = useLinkStatus();
  return <>{resolve(children, { isActive, isPending: pending })}</>;
}
```

The main `NavLink` passes `className` with just `{ isActive }` and delegates `children` to `NavLinkContent`:

```tsx
export function NavLink({ href, className, children, ...rest }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={resolve(className, { isActive })}
      {...rest}
    >
      <NavLinkContent isActive={isActive}>{children}</NavLinkContent>
    </Link>
  );
}
```

Now the consumer can use `isPending` in the children render prop:

```tsx
<NavLink href="/" className={({ isActive }) => (isActive ? "nav-item font-bold" : "nav-item")}>
  {({ isActive, isPending }) => (
    <>
      <HomeIcon filled={isActive} />
      Home
      {isPending && <Spinner className="ml-2 h-4 w-4" />}
    </>
  )}
</NavLink>
```

How useful `isPending` ends up being depends on how the destination route is set up. If the slow parts of the page sit behind `Suspense` boundaries, the transition resolves as soon as the static shell renders and `isPending` flips off almost immediately. You'll mainly notice it on routes that read dynamic data without a boundary above them.

### Matching Prefixes for Nested Routes

Exact equality works for top-level links, but a link to `/search` usually wants to stay active on `/search?q=react` too. We can default to prefix matching and add an `exact` opt-out. We also special-case `/` to always be exact, since every pathname starts with `/` and prefix matching would make Home active on every route:

```tsx
export function NavLink({ href, exact, ...rest }) {
  const pathname = usePathname();
  const target = href.toString();
  const isActive = (exact || target === "/")
    ? pathname === target
    : pathname === target || pathname.startsWith(`${target}/`);

  // ...
}
```

Now `/search` stays active on `/search?q=react`, and `/` only matches the exact home route.

### Marking the Active Link with aria-current

A nav link is the canonical use case for [`aria-current="page"`](https://www.w3.org/TR/wai-aria-1.1/#aria-current). It marks the current page for assistive tech, and as a bonus you can style off the same attribute, which keeps the visual state and the assistive-tech state from drifting apart. We can add it to the link:

```tsx
<Link
  href={href}
  aria-current={isActive ? "page" : undefined}
  className={resolveClassName(className, { isActive })}
  {...rest}
>
  <NavLinkContent isActive={isActive}>{children}</NavLinkContent>
</Link>
```

In plain CSS, that lets you target the attribute directly:

```css
.nav-item[aria-current="page"] {
  font-weight: 600;
  color: var(--accent);
}
```

In Tailwind, the `aria-` variant does the same thing:

```tsx
<NavLink
  href="/"
  className="aria-[current=page]:font-semibold aria-[current=page]:text-accent"
>
  Home
</NavLink>
```

For consumers who prefer the render-prop approach, `isActive` is still available in both `className` and `children`, so they can mix both freely.

### Adding TypeScript

The component works, but in TypeScript we want the render-prop shape to type-check, consumers to keep autocomplete for every prop `next/link` accepts, and the `href` to be validated by Next.js's [statically typed links](https://nextjs.org/docs/app/api-reference/config/typescript#statically-typed-links) when `typedRoutes` is enabled. A few small types do the job:

```tsx
import type { Route } from "next";

type ActiveProps = { isActive: boolean };
type RenderProps = ActiveProps & { isPending: boolean };
type Renderable<T> = T | ((props: RenderProps) => T);

type Props<T extends string> = Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className" | "children"
> & {
  href: Route<T> | URL;
  className?: string | ((props: ActiveProps) => string | undefined);
  children?: Renderable<React.ReactNode>;
  exact?: boolean;
};
```

The `className` prop accepts a function of `{ isActive }`, since `isPending` is only available inside `<Link>` children via `useLinkStatus`. The `children` prop gets the full `{ isActive, isPending }` through the `Renderable` type. The `Props` type inherits everything from `next/link`'s props via `React.ComponentProps<typeof Link>` and `Omit`s the three we redefine, so consumers still get autocomplete for `prefetch`, `replace`, `transitionTypes`, event handlers, and anything else `Link` accepts. The `href: Route<T> | URL` generic matches the pattern the [Next.js docs recommend for wrapping `Link`](https://nextjs.org/docs/app/api-reference/config/typescript#statically-typed-links): with `typedRoutes` enabled, invalid hrefs are caught at compile time, and with it disabled, `Route<T>` falls back to a regular string. We need two resolve helpers, one for each prop shape:

```tsx
function resolve<T>(value: Renderable<T> | undefined, props: RenderProps) {
  return typeof value === "function"
    ? (value as (p: RenderProps) => T)(props)
    : value;
}

function resolveClassName(
  value: string | ((props: ActiveProps) => string | undefined) | undefined,
  props: ActiveProps,
) {
  return typeof value === "function" ? value(props) : value;
}
```

The component signature becomes generic on the href:

```tsx
export function NavLink<T extends string>({
  href,
  className,
  children,
  exact,
  ...rest
}: Props<T>) {
  // ...
}
```

That's the type layer done. The runtime code stays exactly the same, we've just given it a shape that TypeScript can check.

### The Full NavLink

Putting it all together, here is the complete component in one file:

```tsx
// app/components/nav-link.tsx
"use client";

import type { Route } from "next";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

type RenderProps = { isActive: boolean; isPending: boolean };
type Renderable<T> = T | ((props: RenderProps) => T);

type Props<T extends string> = Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className" | "children"
> & {
  href: Route<T> | URL;
  className?: string | ((props: ActiveProps) => string | undefined);
  children?: Renderable<React.ReactNode>;
  exact?: boolean;
};

function checkActive(pathname: string, href: string, exact?: boolean) {
  if (exact || href === '/') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolve<T>(value: Renderable<T> | undefined, props: RenderProps) {
  return typeof value === "function"
    ? (value as (p: RenderProps) => T)(props)
    : value;
}

function resolveClassName(
  value: string | ((props: ActiveProps) => string | undefined) | undefined,
  props: ActiveProps,
) {
  return typeof value === "function" ? value(props) : value;
}

export function NavLink<T extends string>({
  href,
  className,
  children,
  exact,
  ...rest
}: Props<T>) {
  const pathname = usePathname();
  const isActive = checkActive(pathname, href.toString(), exact);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={resolveClassName(className, { isActive })}
      {...rest}
    >
      <NavLinkContent isActive={isActive}>{children}</NavLinkContent>
    </Link>
  );
}

function NavLinkContent({ isActive, children }: { isActive: boolean; children?: Renderable<React.ReactNode> }) {
  const { pending } = useLinkStatus();
  return <>{resolve(children, { isActive, isPending: pending })}</>;
}
```

Back in our sidebar, this is how we'd use it. Since the component sets `aria-current` for us, we can style the active state with a plain `className` string. The only thing we need the render-prop form for is `children`, where we swap the icon based on `isActive`:

```tsx
// app/layout.tsx
<nav>
  <NavLink href="/" exact className="nav-item aria-[current=page]:font-bold">
    {({ isActive }) => (
      <>
        <HomeIcon filled={isActive} />
        Home
      </>
    )}
  </NavLink>
  <NavLink href="/search" className="nav-item aria-[current=page]:font-bold">
    {({ isActive }) => (
      <>
        <SearchIcon filled={isActive} />
        Search
      </>
    )}
  </NavLink>
  <ProfileLink />
</nav>
```

The `exact` prop on the Home link prevents `/` from prefix-matching every route.

One thing to be aware of: a function `className` (or function `children`) is not serializable, so it cannot be passed across the server-client boundary. If your layout is a Server Component, you cannot use the render-prop form inline. The fix is either to mark the layout as `'use client'`, or to extract a small client component that holds the function internally and accepts only serializable props (`href`, `icon`, `label`) from the server. If you only need a plain string `className` and static children, none of this applies, you can use `NavLink` directly from a Server Component.

## An Alternative: useSelectedLayoutSegments

Everything so far uses `usePathname()` to match against the link's `href`. An equally valid approach is [`useSelectedLayoutSegments()`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment), which gives you the active route segments from the nearest layout. Instead of comparing pathnames as strings, you compare segments as arrays.

Here is what the same `NavLink` looks like with segments:

```tsx
"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";

function NavLink({ href, ...rest }) {
  const segments = useSelectedLayoutSegments();
  const want = href.toString().split("/").filter(Boolean);
  const isActive = want.length === segments.length && want.every((s, i) => s === segments[i]);

  return (
    <Link
      {...rest}
      href={href}
      aria-current={isActive ? "page" : undefined}
    />
  );
}
```

Both approaches are valid. Here are the trade-offs:

- **`usePathname()`** compares URL strings, so it works regardless of route structure. But it can cause a hydration mismatch if your app uses rewrites (see [Gotchas](#gotchas)), and you need to special-case `/` to avoid prefix-matching every route.
- **`useSelectedLayoutSegments()`** compares route segments, so it naturally handles exact matching without special-casing `/`. It's also immune to the rewrite hydration mismatch since segments come from React's router state, not the URL. But it's tied to the route structure: if you add a route group, the segments change and the matching can break.

Pick whichever fits your app. The rest of this post (the inline script, the Suspense split for `cacheComponents`, `useLinkStatus`) works the same with either approach.

## Preventing Flickering on First Paint

The active class depends on `usePathname()`, which resolves on the client. During the App Shell prerender, the pathname isn't known yet, so no link is highlighted. The active style only appears when React hydrates, which causes a brief flash.

We can fix this with an inline script that runs during HTML parsing, before the browser paints. This is the same pattern Next.js recommends for [preventing flash before hydration](https://nextjs.org/docs/app/guides/preventing-flash-before-hydration) with themes and dates, and the same class of problem Ethan Niser describes in ["A Clock That Doesn't Snap"](https://ethanniser.dev/blog/a-clock-that-doesnt-snap/). The script reads `location.pathname` and sets `aria-current="page"` on the matching nav link before the user sees anything. Since we're styling with `aria-[current=page]:` in Tailwind, that's all it takes.

For the script to find the nav links, we add a `data-navlink-href` attribute to each `<Link>`. The script walks every element with that attribute, compares its `href` to `location.pathname`, and sets `aria-current` on matches:

```tsx
export function NavLinkScript() {
  const html = `(function(){
  var p = location.pathname;
  document.querySelectorAll('[data-navlink-href]').forEach(function(el) {
    var href = el.getAttribute('data-navlink-href');
    var exact = el.hasAttribute('data-navlink-exact');
    var active = (exact || href === '/')
      ? p === href
      : (p === href || p.startsWith(href + '/'));
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
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

The script type flips to `text/plain` on the client so it only runs on the initial page load. On soft navigations React handles the active state as usual.

We also need to add `data-navlink-href` and `suppressHydrationWarning` to the `<Link>` in `NavLink`, since the script will have set `aria-current` before React hydrates:

```tsx
<Link
  href={href}
  aria-current={isActive ? "page" : undefined}
  className={resolveClassName(className, { isActive })}
  data-navlink-href={href.toString()}
  data-navlink-exact={exact || undefined}
  suppressHydrationWarning
  {...rest}
>
```

Render `<NavLinkScript />` at the end of your `<body>` in the root layout, after all other content. This is important: with streaming, resolved Suspense chunks get swapped into the page via `$RC` scripts as they arrive. If the seed script runs too early, it sets `aria-current` on elements that later get replaced by streamed content. Placing it last ensures all nav links are in their final state when the script reads them.

## NavLink Under cacheComponents

[Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) is where the App Router is heading and what we want to opt into for the new features like partial prerendering and [`'use cache'`](https://nextjs.org/docs/app/api-reference/directives/use-cache). With `cacheComponents` enabled, any component that reads dynamic data has to live behind a `Suspense` boundary. Everything outside those boundaries can become part of a static shell that is prerendered and served instantly.

Let's enable `cacheComponents` in `next.config.ts`:

```ts
// next.config.ts
const config: NextConfig = {
  cacheComponents: true,
};
```

Static routes still render fine. But navigating to `/drop/[id]` throws a missing-Suspense-boundary error pointing at `usePathname`. The nav lives in the root layout, which is shared across all routes, so `usePathname()` runs on the dynamic route too. When `cacheComponents` is enabled, [`usePathname()` is treated as a dynamic API](https://nextjs.org/docs/app/api-reference/functions/use-pathname#good-to-know) on routes with a dynamic param, and reading a dynamic value without a Suspense boundary above it is a runtime error, unless we use `generateStaticParams` to prerender it.

We need a `Suspense` boundary somewhere. This also surfaces another problem we've been ignoring: the `ProfileLink` is an async Server Component, and without a boundary around it the entire layout blocks until the handle resolves. We need to wrap that too.

The most obvious fix is wrapping the entire nav:

```tsx
// app/layout.tsx
<Suspense fallback={<NavSkeleton />}>
  <nav>
    <NavLink href="/" exact /* ... */>{/* HomeIcon + Home */}</NavLink>
    {/* same for /search */}
  </nav>
</Suspense>
```

That works, but the entire nav is replaced by a skeleton until `usePathname()` resolves. If the skeleton's dimensions don't match the nav's, you get a brief layout shift when the real nav comes in. We can narrow it down by wrapping each link individually:

```tsx
// app/layout.tsx
<nav>
  <Suspense fallback={<span className="nav-item opacity-50"><HomeIcon /> Home</span>}>
    <NavLink href="/" exact /* ... */>{/* HomeIcon + Home */}</NavLink>
  </Suspense>
  {/* same for /search */}
</nav>
```

This is better. Only the active styling is delayed, the icon and label show immediately. Each fallback still has to match the size of the real link or you'll get a brief CLS flicker per link. And the consumer still has to duplicate the content in every fallback and repeat the wrapping in every layout. We can push this further by owning the boundary inside the component itself.

### Moving Suspense Inside NavLink

We can split the component into an outer `NavLink` that renders the Suspense boundary, and an inner `NavLinkInner` that reads `usePathname()`. The fallback renders the same `<Link>` in its inactive state, so the layout matches exactly and there's no flash. `NavLinkInner` reads the pathname and renders the link with the correct active class. A small `PendingIndicator` inside `<Link>` reads `useLinkStatus()` and resolves `children` with `isPending`:

```tsx
// app/components/nav-link.tsx
"use client";

// ...imports, types, checkActive, resolve, resolveClassName (same as before)

export function NavLink({ href, className, children, exact, ...rest }) {
  const inactive = { isActive: false, isPending: false };
  return (
    <Suspense
      fallback={
        <Link href={href} className={resolveClassName(className, { isActive: false })} {...rest}>
          {resolve(children, inactive)}
        </Link>
      }
    >
      <NavLinkInner href={href} className={className} exact={exact} {...rest}>
        {children}
      </NavLinkInner>
    </Suspense>
  );
}

function NavLinkInner({ href, className, children, exact, ...rest }) {
  const pathname = usePathname();
  const isActive = checkActive(pathname, href.toString(), exact);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={resolveClassName(className, { isActive })}
      {...rest}
    >
      <PendingIndicator isActive={isActive}>{children}</PendingIndicator>
    </Link>
  );
}

function PendingIndicator({ isActive, children }) {
  const { pending } = useLinkStatus();
  return <>{resolve(children, { isActive, isPending: pending })}</>;
}

export function NavLinkSkeleton({ children, className }) {
  return (
    <span aria-hidden className={`text-gray opacity-50 ${className ?? ""}`}>
      {children}
    </span>
  );
}
```

The server renders the active class correctly, so there's no flash on first paint. `className` gets `{ isActive }` and `children` gets `{ isActive, isPending }`. The duplicate `<Link>` in the fallback is the cost, but it guarantees the layout matches exactly.

We also keep exporting `NavLinkSkeleton` for the `ProfileLink` case, where the async Server Component still needs an outer `Suspense` boundary.

The two static links no longer need per-link wrappers. But what about `ProfileLink`? It's an async Server Component, so it still needs an outer `Suspense` boundary. Without a fallback, nothing renders in its place while the handle loads, and the nav jumps when the link pops in. We can use the exported `NavLinkSkeleton` as the fallback, sharing the same base layout class with the real link so the dimensions match:

```tsx
// before
<nav>
  <Suspense fallback={<span className="nav-item opacity-50"><HomeIcon /> Home</span>}>
    <NavLink href="/" exact /* ... */>{/* HomeIcon + Home */}</NavLink>
  </Suspense>
  {/* same for /search */}
  <ProfileLink />
</nav>

// after
<nav>
  <NavLink href="/" exact /* ... */>{/* HomeIcon + Home */}</NavLink>
  <NavLink href="/search" /* ... */>{/* SearchIcon + Search */}</NavLink>
  <Suspense fallback={<NavLinkSkeleton className="nav-item"><UserIcon /> Profile</NavLinkSkeleton>}>
    <ProfileLink />
  </Suspense>
</nav>
```

The consumer no longer has to think about `Suspense` for the static links, and the one async link gets a clean, layout-stable fallback.

This is a good place to stop for most apps. The component is self-contained: drop a `NavLink` anywhere and it just works under `cacheComponents`, with the active state rendered on the server so the correct link is highlighted on first paint.

If you don't need the render-prop flexibility and just want CSS-based active styling under `cacheComponents`, there's a simpler option. Render a small indicator component inside `<Link>` that sets `data-active` and `data-pending` attributes, and style the parent with Tailwind's `has-data-*` variants:

```tsx
"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

function ActiveLinkIndicator({ href }: { href: string }) {
  const pathname = usePathname();
  const { pending } = useLinkStatus();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return <span hidden data-active={isActive || undefined} data-pending={pending || undefined} />;
}

// usage
<Link href="/search" className="has-data-active:font-bold has-data-pending:opacity-50">
  <Suspense>
    <ActiveLinkIndicator href="/search" />
  </Suspense>
  <SearchIcon /> Search
</Link>
```

The indicator still needs a `Suspense` boundary since `usePathname()` suspends under `cacheComponents`, but the fallback is empty so nothing flashes. All the styling happens through CSS.

## Gotchas

**Hydration mismatch with rewrites (usePathname only).** If your app uses [rewrites in `next.config` or a `Proxy` file](https://nextjs.org/docs/app/api-reference/functions/use-pathname#avoid-hydration-mismatch-with-rewrites) and you're using the `usePathname()` version, `usePathname()` returns the source path on the server while the browser URL is the rewritten path. This means the server renders the wrong active state, and when the client hydrates it corrects itself, causing both a hydration mismatch and a visible flash. The `useSelectedLayoutSegments()` version doesn't have this problem since segments come from React's router state, not the URL.

The [docs recommend](https://nextjs.org/docs/app/api-reference/functions/use-pathname#avoid-hydration-mismatch-with-rewrites) deferring the pathname read until after mount. We can wrap that in a hook:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function useClientPathname(): string {
  const pathname = usePathname();
  const [clientPathname, setClientPathname] = useState("");
  useEffect(() => {
    setClientPathname(pathname);
  }, [pathname]);
  return clientPathname;
}
```

This returns `""` on the server and the first client render, then the real pathname after mount. Replace `usePathname()` with `useClientPathname()` in `NavLink` and the mismatch is gone.

That still leaves a flash: every link renders inactive until the effect fires. To fix that, you can add an [inline script that runs before paint](https://nextjs.org/docs/app/guides/preventing-flash-before-hydration) to read `location.pathname` and apply the correct class immediately, the same pattern we used in the [Preventing Flickering](#preventing-flickering-on-first-paint) section.

## Conclusion

We started with a hardcoded `active` class and worked through quite a few iterations: the render-prop pattern, `useLinkStatus` for pending states, prefix matching, `aria-current`, TypeScript, an inline script for flicker-free first paint, and Suspense boundaries for `cacheComponents`. We also looked at two approaches for reading the active route, `usePathname()` and `useSelectedLayoutSegments()`, each with their own trade-offs. That's a lot of ground for one component, but each piece solves a real problem that comes up in production apps.

You might not need all of this. A plain `usePathname()` call in a navbar component works fine for most apps. But if you want a single, reusable `NavLink` that handles every edge case, now you know how to build one. Both implementations can be found in [next16-social-media](https://github.com/aurorascharff/next16-social-media) ([live demo](https://next16-social-media.vercel.app)): the [`usePathname` version](https://github.com/aurorascharff/next16-social-media/blob/main/components/ui/nav-link.tsx) and the [`useSelectedLayoutSegments` version](https://github.com/aurorascharff/next16-social-media/blob/main/components/ui/nav-link-segments.tsx).

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
