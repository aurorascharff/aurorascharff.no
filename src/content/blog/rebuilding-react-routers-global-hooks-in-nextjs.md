---
author: Aurora Scharff
pubDatetime: 2026-09-09T10:00:00Z
title: Rebuilding React Router's Global Hooks in Next.js
slug: rebuilding-react-routers-global-hooks-in-nextjs
featured: false
draft: true
tags:
  - React
  - Next.js 16
  - React Router
  - Composition
  - Architecture
description: Rebuild React Router's global navigation state in Next.js, then look at what we gain and lose when the application owns the connection.
---

If you are coming from React Router, the Next.js App Router can feel like it is missing pieces. React Router exposes the current navigation through `useNavigation()` and lets a form stop navigation with `useBlocker()`. You might use one for a progress bar and the other for unsaved changes, then look for the same router-wide hooks in Next.js.

We'll look at what can go wrong when navigation state is global, what Next.js gives us instead, and how we can rebuild the behavior with a provider.

## Table of contents

## Background

In React Router, we have the [`useNavigation()`](https://reactrouter.com/api/hooks/useNavigation) hook. It reads the router's context and gives us the current navigation, with a `navigation.state` that moves from `"idle"` to `"loading"` while the next page loads. Any component can call it, so we can render a global progress bar in the root:

```tsx
// app/root.tsx
import { Outlet, useNavigation } from "react-router";

export default function Root() {
  const navigation = useNavigation();

  return (
    <>
      {navigation.state === "loading" && <ProgressBar />}
      <Outlet />
    </>
  );
}
```

Here, the root shows the bar whenever any navigation is pending. The same router context powers [`useBlocker()`](https://reactrouter.com/api/hooks/useBlocker):

```tsx
const blocker = useBlocker(isDirty);
```

This hook lets a form register a blocker that React Router applies to navigation started elsewhere. The global model works when one part of the app needs to respond to navigation from another. Before rebuilding it in Next.js, let's look at what happens when local feedback reads the same global state.

## The Problem with Global State

Let's have a look at the [React Router address book tutorial](https://reactrouter.com/tutorials/address-book). I remember working through it myself, and it makes a good example. The tutorial uses `useNavigation()` in the root to fade the detail panel while the next contact loads:

```tsx
// app/root.tsx
const navigation = useNavigation();

return (
  <div className={navigation.state === "loading" ? "loading" : ""} id="detail">
    <Outlet />
  </div>
);
```

This works when someone selects a contact because the detail panel is the part that is waiting. Later, the tutorial adds search in the sidebar. Searching also changes the URL and reruns a loader, so the global state fades the detail panel too. The tutorial adds a `searching` check to tell the two navigations apart:

```tsx
// app/root.tsx
const searching =
  navigation.location &&
  new URLSearchParams(navigation.location.search).has("q");

return (
  <div
    className={navigation.state === "loading" && !searching ? "loading" : ""}
    id="detail"
  >
    <Outlet />
  </div>
);
```

The global `navigation.state` tells the root that something is loading. To decide whether the detail panel should fade, the root has to recover which interaction started it from the destination URL. The `q` check works, but it couples the root to a detail of the search route. Each new type of navigation could add another condition.

We see the same problem from the other direction with forms. A pending submit button only cares about its own form, but the state it reads covers every navigation. React Router's [pending UI guide](https://reactrouter.com/start/framework/pending-ui) compares the global `formAction` with the form's action to tell whether this button should be pending:

```tsx
// NewProjectForm.tsx
const navigation = useNavigation();

return (
  <Form method="post" action="/projects/new">
    <input type="text" name="title" />
    <button type="submit">
      {navigation.formAction === "/projects/new" ? "Submitting..." : "Submit"}
    </button>
  </Form>
);
```

Global navigation state fits a progress bar that should respond to navigation from anywhere. Local feedback has to narrow that state back down to one link, form, or panel. React Router also provides `NavLink` and fetchers for these cases. The choice is whether the feedback belongs to one interaction or the whole app.

## Following React's State Model

React gives us a useful rule: keep state close to the interaction it describes, then move it up only when more of the tree needs it. Shared state can live in the nearest common ancestor and pass through props or [Context](https://react.dev/learn/passing-data-deeply-with-context). Its location decides which components can read and update it.

For example, a search field can own the pending state that fades its results. If a toolbar and the results both need the same filter state, we can move it to their common parent:

```tsx
<FilterProvider>
  <SearchField />
  <FilterToolbar />
  <Results />
</FilterProvider>
```

Here, the provider shares state around the filtering UI without involving the rest of the app. We can use the same shape when an editor and a header both need to know that a save is pending.

## What Next.js Gives Us

React Router exposes navigation state from a provider at the root. That is how `useNavigation()` and `useBlocker()` observe navigation across the app. Next.js does not expose equivalent router-wide hooks. Instead, it builds on React Transitions and adds smaller APIs to `Link`.

[`useLinkStatus()`](https://nextjs.org/docs/app/api-reference/functions/use-link-status) reads the pending state of its parent `Link`:

```tsx
const { pending } = useLinkStatus();
```

This hook works when feedback belongs to one link. I used it while [building a `NavLink` for Next.js](/posts/building-an-active-navlink-component-in-nextjs#adding-ispending). Here, the component reads `pending` from inside `Link` without intercepting navigation. Because the hook runs in a child, it can change the contents but not the wrapper's `className`. A prefetched destination may resolve before the pending state appears.

[`useTransition()`](https://react.dev/reference/react/useTransition) gives us both a Transition and its pending state:

```tsx
const [isPending, startTransition] = useTransition();
```

We can use this hook when the component needs to start some work and show that it is pending. If we do not need to read the pending state, the standalone [`startTransition()`](https://react.dev/reference/react/startTransition) is enough.

Finally, [`onNavigate`](https://nextjs.org/docs/app/api-reference/components/link#onnavigate) lets us run code when `Link` performs a same-origin client navigation:

```tsx
<Link href={href} onNavigate={handleNavigate} />
```

Here, a custom link can cancel the built-in navigation and send it through application logic. We will use this prop for `AppLink` below.

### A Smaller Wrapper Example

An animated link gives us a smaller example of how `onNavigate` and `startTransition()` fit together. Suppose the link needs to label its navigation so a React [`<ViewTransition>`](https://react.dev/reference/react/ViewTransition) can choose the right animation. We could intercept the navigation, start it ourselves, and call [`addTransitionType()`](https://react.dev/reference/react/addTransitionType) inside the same Transition:

```tsx
// components/animated-link.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { addTransitionType, startTransition, type ReactNode } from "react";

export function AnimatedLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onNavigate={event => {
        event.preventDefault();
        startTransition(() => {
          addTransitionType("slide-in");
          router.push(href);
        });
      }}
    >
      {children}
    </Link>
  );
}
```

`onNavigate` only runs for same-origin client-side navigation, so modified clicks, downloads, and external URLs keep their normal `Link` behavior. The wrapper takes over the navigation we want to animate.

This particular wrapper is no longer necessary. In Next.js 16.2, `Link` gained the [`transitionTypes`](https://nextjs.org/docs/app/api-reference/components/link#transitiontypes) prop:

```tsx
<Link href="/about" transitionTypes={["slide-in"]}>
  About
</Link>
```

The [pull request that added the prop](https://github.com/vercel/next.js/pull/90701) moved the `addTransitionType()` calls into the navigation Transition that `Link` already starts. A callback prop was considered, but a function could not be passed from a Server Component to `Link`. An array of strings keeps the API serializable and removes the need for a Client Component wrapper.

This is a good example of a wrapper becoming a framework feature. The behavior is common and `Link` already owns the right part of the navigation lifecycle. A progress bar and blocker depend on application state, so we still need to compose those ourselves.

## Rebuilding the Hooks in Next.js

Now that we know what we have to work with, let's apply these pieces to React Router's global progress and blocker behavior. Libraries like [`react-transition-progress`](https://github.com/vercel/react-transition-progress) and [`next-view-transitions`](https://github.com/shuding/next-view-transitions) package similar providers, links, and hooks. Here, we'll build the smallest version ourselves.

### Building a Navigation Provider

The progress bar needs a pending state that covers navigation from anywhere in the app. In Next.js, we can get one by starting the navigation inside a Transition, since wrapping `router.push()` in `useTransition()` keeps `isPending` true until the new page has rendered. Let's create a provider to own that transition and the navigation function that starts it:

```tsx
// components/navigation-provider.tsx
"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";

type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
};

type NavigationContextValue = {
  isPending: boolean;
  navigate: (href: string, options?: NavigateOptions) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(
    href: string,
    { replace = false, scroll }: NavigateOptions = {}
  ) {
    startTransition(() => {
      const options = { scroll };
      if (replace) {
        router.replace(href, options);
      } else {
        router.push(href, options);
      }
    });
  }

  return (
    <NavigationContext value={{ isPending, navigate }}>
      {children}
    </NavigationContext>
  );
}

export function useAppNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useAppNavigation must be used within NavigationProvider");
  }
  return context;
}
```

The provider can live in the root layout for the whole app or around one workspace. Its placement decides which links share the transition. We can now read `isPending` from the same context in the progress bar:

```tsx
// components/navigation-progress.tsx
"use client";

import { useAppNavigation } from "./navigation-provider";

export function NavigationProgress() {
  const { isPending } = useAppNavigation();

  if (!isPending) return null;

  return (
    <div
      aria-label="Loading page"
      className="fixed inset-x-0 top-0 h-1 animate-pulse bg-blue-500"
      role="progressbar"
    />
  );
}
```

The progress bar itself is deliberately simple. The harder part is that the provider cannot observe `router.push()` from the outside, so navigation has to start inside `navigate()`. For links, we can wrap `Link` in our own component using its [`onNavigate`](https://nextjs.org/docs/app/api-reference/components/link#onnavigate) prop, which runs during client-side navigation and can cancel it:

```tsx
// components/app-link.tsx
"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useAppNavigation } from "./navigation-provider";

type AppLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & {
  href: string;
};

export function AppLink({ href, replace, scroll, ...props }: AppLinkProps) {
  const { navigate } = useAppNavigation();

  return (
    <Link
      {...props}
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={event => {
        event.preventDefault();
        navigate(href, { replace, scroll });
      }}
    />
  );
}
```

The wrapper cancels the built-in navigation and restarts it through `navigate()`, so it runs inside the shared transition. Modified clicks, external URLs, and downloads stay with `Link`, since `onNavigate` only runs for same-origin client-side navigation. Components that navigate imperatively call `navigate()` instead of `router.push()`.

We can now put the pieces around the part of the app where we want them:

```tsx
// app/layout.tsx
<NavigationProvider>
  <NavigationProgress />
  <Sidebar />
  {children}
</NavigationProvider>
```

Navigation through `AppLink` or `navigate()` now turns on the progress bar. A search field can keep its own `useTransition()` to dim its results without involving the shared transition.

I used the same approach when I [rebuilt the contacts tutorial in Next.js](/posts/rebuilding-remix-contacts-in-nextjs-14-with-transitions-server-actions-and-prisma), where a `LoadingProvider` shared one transition between the navigation and the action buttons that fade the detail panel. It required more components than one global hook, but the interactions that participate in the fade became explicit.

### Registering a Navigation Blocker

Blocking navigation is the second behavior we wanted from React Router. There are two ways someone can leave the page:

- For client-side navigation, the Next.js docs show a [navigation blocking pattern](https://nextjs.org/docs/app/api-reference/components/link#blocking-navigation) with Context and a custom `Link`.
- For refreshes and closed tabs, the browser provides the [`beforeunload`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) event.

Here, we'll handle client-side navigation by storing whether navigation is blocked and checking it inside the `navigate()` function we already use:

```tsx
// components/navigation-provider.tsx
type NavigationContextValue = {
  isPending: boolean;
  setIsBlocked: (blocked: boolean) => void;
  navigate: (href: string, options?: NavigateOptions) => void;
};

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isBlocked, setIsBlocked] = useState(false);

  function navigate(
    href: string,
    { replace = false, scroll }: NavigateOptions = {}
  ) {
    if (
      isBlocked &&
      !window.confirm("You have unsaved changes. Leave anyway?")
    ) {
      return;
    }

    setIsBlocked(false);
    startTransition(() => {
      const options = { scroll };
      if (replace) {
        router.replace(href, options);
      } else {
        router.push(href, options);
      }
    });
  }

  return (
    <NavigationContext value={{ isPending, setIsBlocked, navigate }}>
      {children}
    </NavigationContext>
  );
}
```

Now `navigate()` asks before leaving while something is blocked. The form still owns whether it is dirty, and only shares that decision with the provider, which we can do in an effect:

```tsx
// components/editor.tsx
"use client";

import { useEffect, useState } from "react";
import { useAppNavigation } from "./navigation-provider";

export function Editor() {
  const [isDirty, setIsDirty] = useState(false);
  const { setIsBlocked } = useAppNavigation();

  useEffect(() => {
    setIsBlocked(isDirty);
    return () => setIsBlocked(false);
  }, [isDirty, setIsBlocked]);

  return (
    <form onChange={() => setIsDirty(true)}>
      {/* fields and save button */}
    </form>
  );
}
```

Here, the editor still owns `isDirty` and only registers it with the provider. After a save, it calls `setIsDirty(false)`. `NavigationProvider` has to wrap both the editor and the links that can leave it.

This example assumes there is one blocking form. With several editors, the provider should store registrations instead of one boolean so one editor cannot clear another's blocker.

The blocker only covers navigation through `AppLink` and `navigate()`. A plain `Link`, a direct `router.push()`, and the browser's back and forward buttons skip it. `beforeunload` covers refreshes and closed tabs, but not client-side navigation. React Router can cover more because `useBlocker()` is part of the router's navigation lifecycle.

## Using the Same Pattern Beyond Navigation

Navigation is not the only reason to share state like this. In [a previous post on search param filtering](/posts/managing-advanced-search-param-filtering-next-app-router), I moved the shared URL update and its optimistic state into one `FilterProvider`:

```tsx
<FilterProvider>
  <Search />
  <Categories />
  <Results />
</FilterProvider>
```

Here, the filters no longer overwrite each other's URL updates, while each filter can keep its own spinner.

I use the same approach for optimistic updates in [Coordinating Optimistic Updates in Next.js](/posts/coordinating-optimistic-updates-in-nextjs):

```tsx
<CalendarEventsProvider>
  <CalendarHeader />
  <Calendar />
</CalendarEventsProvider>
```

Here, deleting an event removes it optimistically while the change saves in the background. The header reads the provider's pending state to show that the calendar is saving.

## Conclusion

Next.js inherits React's model of starting state where the work happens, then moving it up when more of the tree needs it. I like that `useLinkStatus()` can keep feedback with one link, while `useTransition()` and Context let us share it for something like a progress bar.

The trade-off is coverage. Our provider only sees the navigation we send through it. That is easy to accept for a progress bar, but harder for a blocker, where missing one path could mean losing someone's work.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
