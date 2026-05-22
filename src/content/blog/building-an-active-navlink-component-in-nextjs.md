---
author: Aurora Scharff
pubDatetime: 2026-05-22T10:00:00Z
title: Building an Active NavLink Component in Next.js
slug: building-an-active-navlink-component-in-nextjs
featured: false
draft: true
tags:
  - Next.js 16
  - React Server Components
  - App Router
  - cache components
  - Navigation
description: Active link styling is one of the most common things you need in a real application. Here is how to build a reusable NavLink component for your design system, taking inspiration from React Router, that also handles cache components.
---

Active link styling is one of the most common things you need in a real application. The Next.js App Router doesn't ship a built-in component for it, so most apps end up writing the same `usePathname()`-and-compare logic inline at every link. In this post, we will build a reusable `NavLink` component for your design system, taking inspiration from React Router, with an API flexible enough to handle everything from simple class swaps to fully custom active-state rendering. Along the way, we will also make sure it keeps working under `cacheComponents`.

## Table of contents

## Starting from React Router

[React Router's `NavLink`](https://reactrouter.com/api/components/NavLink) has solved this problem cleanly for years. Its API looks like this:

```tsx
import { NavLink } from "react-router";

<NavLink to="/messages" className={({ isActive }) => (isActive ? "active" : "")}>
  Messages
</NavLink>;
```

Notice that `className` is a function rather than a string, and it receives `{ isActive }`. `children` accepts the same shape, so you can change the rendered content based on the active state too. The component encapsulates the active-state logic and lets the consumer decide how to render in each case.

This is the shape we will aim for in Next.js. We will get there incrementally, and look at how this kind of API works under the hood along the way.

## Building NavLink

A first attempt in the App Router might look like this:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link href={href} className={isActive ? "design-link active" : "design-link"}>
      {children}
    </Link>
  );
}
```

A design-system `NavLink` usually owns its base styling, here a `design-link` class with an `active` modifier, so consumers don't have to know which classes to apply. That's already a reasonable component. The wrapper is around `next/link`, not a plain `<a>`, which matters: `next/link` does client-side navigation, automatic prefetching of routes in the viewport, and scroll restoration. Falling back to `<a href>` for in-app navigation would mean a full page reload on every click, losing router state and any partially-streamed UI. Keep the underlying `Link` for any internal route.

The [docs also recommend](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment#examples) `useSelectedLayoutSegment()` for active link components, which is a good fit when your nav lives in a layout and links match individual segments like `/blog` or `/about`, but it gets harder to reason about when the link's `href` doesn't map cleanly to a single segment, or when you want exact-match versus prefix-match behavior. For a general-purpose `NavLink` you can drop anywhere, `usePathname()` is still the most natural API.

Let's build it up step by step from here, ending with something that matches the React Router API and works whether or not `cacheComponents` is enabled.

### className and activeClassName

The fixed classes are a wall the moment a consumer wants different styling for a sidebar link versus a header link. The smallest step toward flexibility is letting them pass both the base class and the active class as props:

```tsx
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

That covers the most common case. It works fine until you want to do something the two-class shape can't express: render a leading dot when active, swap an icon for a filled variant, or use a class-name utility like `clsx` that needs access to `isActive`. For any of those, the consumer needs `isActive` itself.

### Render props

The way React Router exposes `isActive` is through the [render prop](https://react.dev/reference/react/Children#calling-a-render-prop-to-customize-rendering) pattern: instead of accepting a string, the prop accepts a function that receives the component's internal state and returns the value to use. Apply that to both `className` and `children`. A small helper handles the "value or function" shape so consumers can still pass a plain value when they don't need the active state:

```tsx
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

Now the consumer can pass either a plain value or a function:

```tsx
<NavLink href="/messages" className={({ isActive }) => (isActive ? "active" : "")}>
  {({ isActive }) => (
    <>
      {isActive && <Dot />}
      Messages
    </>
  )}
</NavLink>
```

### Prefix matching

Exact equality works for top-level links, but a link to `/posts` usually wants to stay active on `/posts/123` too. Default to prefix matching and add an `exact` opt-out. We also normalize `href` to a string here, since the typed version we land on later accepts `URL` as well:

```tsx
export function NavLink({ href, exact, ...rest }) {
  const pathname = usePathname();
  const target = href.toString();
  const isActive = exact
    ? pathname === target
    : pathname === target || pathname.startsWith(`${target}/`);

  // ...
}
```

### aria-current

A nav link is the canonical use case for [`aria-current="page"`](https://www.w3.org/TR/wai-aria-1.1/#aria-current). It marks the current page for assistive tech, and as a bonus you can style off the same attribute, which keeps the visual state and the assistive-tech state from drifting apart. Set it on the link:

```tsx
<Link
  href={href}
  aria-current={isActive ? "page" : undefined}
  className={resolve(className, { isActive })}
  {...rest}
>
  {resolve(children, { isActive })}
</Link>
```

In plain CSS, target the attribute directly:

```css
.design-link[aria-current="page"] {
  font-weight: 600;
  color: var(--accent);
}
```

In Tailwind, use the `aria-` variant:

```tsx
<NavLink
  href="/posts"
  className="aria-[current=page]:font-semibold aria-[current=page]:text-accent"
>
  Posts
</NavLink>
```

For consumers who prefer the render-prop approach, `isActive` is still available, so they can mix both freely.

### Putting it together

Pulling the steps so far into one component. The signature is plain JavaScript for now so the shape stays readable; we'll add types in the next section:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function resolve(value, props) {
  return typeof value === "function" ? value(props) : value;
}

export function NavLink({ href, className, children, exact, ...rest }) {
  const pathname = usePathname();
  const target = href.toString();
  const isActive = exact
    ? pathname === target
    : pathname === target || pathname.startsWith(`${target}/`);
  const props = { isActive };

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={resolve(className, props)}
      {...rest}
    >
      {resolve(children, props)}
    </Link>
  );
}
```

That covers the API: render-prop `className` and `children`, prefix matching with an `exact` opt-out, and an accessibility attribute on the link. Drop it in a layout and it works as expected:

```tsx
<nav>
  <NavLink href="/" exact className={({ isActive }) => (isActive ? "active" : "")}>
    Home
  </NavLink>
  <NavLink href="/posts" className={({ isActive }) => (isActive ? "active" : "")}>
    Posts
  </NavLink>
</nav>
```

### Typing it

The component works, but in TypeScript we want the render-prop shape to type-check, consumers to keep autocomplete for every prop `next/link` accepts, and the `href` to be validated by Next.js's [statically typed links](https://nextjs.org/docs/app/api-reference/config/typescript#statically-typed-links) when `typedRoutes` is enabled. A few small types do the job:

```tsx
import type { Route } from "next";

type RenderProps = { isActive: boolean };
type Renderable<T> = T | ((props: RenderProps) => T);

type Props<T extends string> = Omit<
  React.ComponentProps<typeof Link>,
  "href" | "className" | "children"
> & {
  href: Route<T> | URL;
  className?: Renderable<string | undefined>;
  children?: Renderable<React.ReactNode>;
  exact?: boolean;
};
```

`Renderable<T>` encodes the "value or function" shape, applied to both `className` and `children`. `Props` inherits everything from `next/link`'s props via `React.ComponentProps<typeof Link>` and `Omit`s the three we redefine, so consumers still get autocomplete for `prefetch`, `replace`, event handlers, and anything else `Link` accepts. The `href: Route<T> | URL` generic matches the pattern the [Next.js docs recommend for wrapping `Link`](https://nextjs.org/docs/app/api-reference/config/typescript#statically-typed-links): with `typedRoutes` enabled, invalid hrefs are caught at compile time, and with it disabled, `Route<T>` falls back to a regular string. The `resolve` helper picks up a matching generic:

```tsx
function resolve<T>(value: Renderable<T> | undefined, props: RenderProps) {
  return typeof value === "function"
    ? (value as (p: RenderProps) => T)(props)
    : value;
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

## Trying It Under cacheComponents

So far, so good. Now enable `cacheComponents` in `next.config.ts`:

```ts
const config: NextConfig = {
  cacheComponents: true,
};
```

The Home page still renders fine. But navigating to a dynamic route like `/posts/123` throws a missing-Suspense-boundary error pointing at `usePathname`. When `cacheComponents` is enabled, `usePathname()` is treated as a dynamic API on routes with a dynamic param, and reading a dynamic value without a Suspense boundary above it is a runtime error. The [`use-pathname` docs](https://nextjs.org/docs/app/api-reference/functions/use-pathname#good-to-know) confirm this: a `Suspense` boundary is required when `cacheComponents` is enabled on a route with a dynamic param, unless you use `generateStaticParams` to prerender it.

So we're forced to add a `Suspense` boundary somewhere above the nav. That clears the error, but whatever we pass as the fallback ends up replacing the nav until the pathname resolves on the client. A skeleton looks like loading state, an empty fallback looks like the nav vanished, and any other placeholder is just noise. There's no good fallback to pick: we're hiding a perfectly good link for no reason, when all we wanted was a class name.

## Handling Suspense Inside NavLink

The fix is to own the Suspense boundary inside the component itself, with the inactive version of the link as the fallback. The link becomes its own loading state. There is no spinner, no skeleton, no missing nav item: just the link in its default form, which then upgrades to active styling once `usePathname()` resolves on the client.

Split the component into an outer `NavLink` that renders the Suspense boundary, and an inner `NavLinkInner` that reads `usePathname()`. Keeping things untyped here to focus on the structure (the `Props` and `Renderable` types from earlier apply unchanged):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

function resolve(value, props) {
  return typeof value === "function" ? value(props) : value;
}

export function NavLink({ href, className, children, exact, ...rest }) {
  const inactive = { isActive: false };

  return (
    <Suspense
      fallback={
        <Link href={href} className={resolve(className, inactive)} {...rest}>
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
  const target = href.toString();
  const isActive = exact
    ? pathname === target
    : pathname === target || pathname.startsWith(`${target}/`);
  const props = { isActive };

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={resolve(className, props)}
      {...rest}
    >
      {resolve(children, props)}
    </Link>
  );
}
```

If `usePathname()` suspends, React shows the fallback, which is the same link without the active class. Once it resolves, the inner version replaces the fallback in place. The DOM doesn't disappear and reappear, it just gets an updated class name and `aria-current` attribute. The consumer doesn't need to know any of this: they pass an `href` and a render prop, and the component handles the rest in both modes.

## Usage

Dropping the finished `NavLink` into a real layout, the render-prop API lets you mix simple class swaps and fully custom active content in the same nav without changing the component:

```tsx
<nav className="design-nav">
  <NavLink
    href="/"
    exact
    className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
  >
    Home
  </NavLink>
  <NavLink href="/posts" className="nav-item aria-[current=page]:font-semibold">
    Posts
  </NavLink>
  <NavLink href="/settings" className="nav-item">
    {({ isActive }) => (
      <>
        <SettingsIcon filled={isActive} />
        Settings
      </>
    )}
  </NavLink>
</nav>
```

The first link uses a function for `className` to swap an active modifier on the root. The second link relies entirely on the `aria-current` attribute and Tailwind's `aria-` variant, so the `className` stays a plain string. The third link uses a function for `children` to render a different icon when active. All three live next to each other and nothing leaks: each consumer picks the shape that fits its use case.

## Should This Be Built In?

React Router has shipped a `NavLink` for years, Remix kept it, and the pattern is well understood. So why doesn't Next.js have one? Part of the answer is likely that an opinionated `NavLink` makes future routing optimizations harder. Once a built-in component exposes pathname access, every future change to how routes are resolved has to keep that contract. The current direction in the App Router is to lean on `useSelectedLayoutSegment()` and segment-based active state, which works well for nav placed in a layout but breaks down for nav placed elsewhere or for links that don't map cleanly to a single segment.

The other factor is that `usePathname()` behaves differently across rendering modes. Under `cacheComponents`, it's a dynamic API that can suspend, which means a built-in component would have to handle Suspense for everyone. That choice is opinionated: where the boundary goes, what the fallback is, whether the consumer can override it. A library-level component can make those choices, but they would have to be defaults you cannot change without ejecting.

In the meantime, the pattern is general enough to drop into any design system. The internal Suspense boundary means consumers don't need to know that `usePathname` can suspend, don't need to add their own boundaries, and don't see flickers when the active state resolves. The render-prop API gives them enough flexibility to handle anything from a simple class swap to a fully custom active-state rendering.

## Conclusion

The Next.js App Router doesn't ship an active link component, and the `usePathname` hook can be surprising when `cacheComponents` is enabled. By encapsulating both the suspense behavior and the active-state computation inside a `NavLink` component with a render-prop API, you get something that feels close to React Router's `NavLink` and works without flicker or fallback noise. Drop it into your design system once and your team can stop worrying about it.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
