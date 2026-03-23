---
author: Aurora Scharff
pubDatetime: 2026-03-23T15:00:00Z
title: Error Handling in Next.js with catchError
slug: error-handling-in-nextjs-with-catch-error
featured: false
draft: false
tags:
  - Next.js 16
  - React Server Components
  - Error Handling
  - catchError
description: react-error-boundary has issues with Server Components in Next.js. catchError is a framework-aware alternative that handles notFound(), redirect(), and server data re-fetching correctly.
---

If you've used `react-error-boundary` in the Next.js App Router, you've probably run into its limitations with Server Components. It catches errors it shouldn't, and its recovery mechanism doesn't re-fetch server data. `unstable_catchError` from `next/error` is a framework-aware alternative that handles both problems. In this post, I'll walk through what breaks, the workaround we used before, and how `catchError` fixes it.

## Table of contents

## react-error-boundary in Server Components

[`react-error-boundary`](https://github.com/bvaughn/react-error-boundary) is a great library and fits naturally into the declarative model of React Server Components. Just like `Suspense` wraps async components with a loading fallback, `ErrorBoundary` wraps them with an error fallback. The composition is clean:

```tsx
import { ErrorBoundary } from "react-error-boundary";

export default function Page() {
  return (
    <ErrorBoundary FallbackComponent={Fallback}>
      <Suspense fallback={<LoadingSkeleton />}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  );
}
```

Ordinary thrown errors are fine. The problem is that Next.js also throws for control flow (`notFound()`, `redirect()`, `unauthorized()`, `forbidden()`), using digests only the framework understands. `react-error-boundary` can’t tell the difference, so it runs your fallback and you never get the real 404, redirect, or HTTP fallback.

The second issue is recovery. When you click "Try again" in a `react-error-boundary` fallback, it calls `resetErrorBoundary`, which clears the error state and re-renders the children. But for Server Components, re-rendering on the client doesn't re-fetch the data. The component renders again with the same stale or errored state. The user clicks retry and nothing changes.

## The Workaround

A setup along these lines can work:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ErrorBoundary } from "react-error-boundary";

function isNextInternalError(error: unknown): boolean {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string"
  ) {
    const digest = (error as { digest: string }).digest;
    return (
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
      digest.startsWith("NEXT_NOT_FOUND")
    );
  }
  return false;
}

export function ReactErrorBoundaryFixed({
  title = "Something went wrong",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [errorKey, setErrorKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  return (
    <ErrorBoundary
      key={errorKey}
      fallbackRender={({ error }) => {
        if (isNextInternalError(error)) {
          throw error;
        }

        return (
          <div>
            <p>{title}</p>
            <button
              disabled={isPending}
              onClick={() => {
                startTransition(() => {
                  router.refresh();
                  setErrorKey(prev => prev + 1);
                });
              }}
            >
              {isPending ? "Retrying…" : "Try again"}
            </button>
          </div>
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

Two things are going on:

**Rethrow from `fallbackRender`.** The digest check mirrors what Next.js emits for control flow (`NEXT_NOT_FOUND`, `NEXT_REDIRECT`, `NEXT_HTTP_ERROR_FALLBACK`, and similar). When you throw again from `fallbackRender`, that throw propagates past `react-error-boundary` (it is already in its error state) so React can pass the error to the next boundary up the tree. Next.js’s built-in boundary then handles `notFound()`, `redirect()`, and the [`authInterrupts`](https://nextjs.org/docs/app/api-reference/config/next-config-js/authInterrupts) helpers (`unauthorized()`, `forbidden()`) instead of your generic fallback.

**Recovery on retry.** `resetErrorBoundary()` alone only clears client error state and re-renders; it does not refetch Server Components, and it can revive children before new data exists. The click handler instead runs `router.refresh()` to invalidate the router cache and pull a fresh RSC payload, bumps the `ErrorBoundary` `key` so the subtree fully remounts, and wraps both in `startTransition` so the UI does not flash an inconsistent state while that work finishes.

It works, and you can centralize this in one reusable boundary or hook. You still maintain a digest allowlist and the refresh-and-key wiring yourself. `NEXT_HTTP_ERROR_FALLBACK` happens to cover `unauthorized()` and `forbidden()` from `authInterrupts`, but that coupling is implicit, and any new throw-based control flow Next adds won’t be covered unless you extend the check. Underneath, you are still compensating for a boundary implementation that doesn’t understand Next.js control flow.

If you're using `try/catch` directly in a Server Component rather than an error boundary, [`unstable_rethrow`](https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow) from `next/navigation` simplifies the framework error detection. Instead of the manual digest check, you call `unstable_rethrow(err)` at the top of your catch block and it re-throws any framework error automatically:

```tsx
// UserProfile.tsx
import { notFound, unstable_rethrow } from "next/navigation";

export default async function UserProfile() {
  try {
    const user = await getUser();
    if (!user) notFound();
    return <p>{user.name}</p>;
  } catch (err) {
    unstable_rethrow(err);
    throw new Error(
      err instanceof Error ? err.message : "Something went wrong"
    );
  }
}
```

`unstable_rethrow` is a newer addition that replaces the manual digest check, but it only solves the server-side half. The recovery side still needs the refresh-plus-key workaround.

## catchError: framework-aware error boundaries

[`unstable_catchError`](https://nextjs.org/docs/app/api-reference/functions/catchError), introduced in Next.js 16.2, is a framework-aware error boundary that solves both problems out of the box.

You define a fallback function that receives props and an error info object with the error and a `retry()` callback:

```tsx
// ErrorBoundary.tsx
"use client";

import { unstable_catchError as catchError, type ErrorInfo } from "next/error";

function ErrorFallback(
  props: { title?: string },
  { unstable_retry: retry }: ErrorInfo
) {
  return (
    <div>
      <p>{props.title ?? "Something went wrong"}</p>
      <button onClick={() => retry()}>Try again</button>
    </div>
  );
}

export default catchError(ErrorFallback);
```

Then use it like any other component wrapper:

```tsx
// page.tsx
import ErrorBoundary from "./ErrorBoundary";

export default function Page() {
  return (
    <ErrorBoundary title="Failed to load user profile">
      <Suspense fallback={<LoadingSkeleton />}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  );
}
```

The `title` prop is optional and defaults to "Something went wrong". The fallback never reads `error.message`, so server error details stay on the server.

Two things are different from `react-error-boundary`:

1. **Framework errors propagate correctly.** When `UserProfile` calls `notFound()`, `redirect()`, or any other internal throw, `catchError` doesn't catch it. The error reaches the framework and the expected behavior executes.

2. **`retry()` re-fetches server data.** Instead of just clearing client state, `retry()` re-fetches and re-renders the error boundary's contents on the server. If the underlying issue is resolved (a transient database timeout, for example), the component recovers with fresh data.

There's also a `reset()` function available if you only want to clear the error state without re-fetching. In most cases, `retry()` is what you want.

### error.tsx with retry()

The same `retry()` pattern works at the route level too. [`error.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/error) is the segment-wide fallback: when something throws in the segment's page tree, Next.js swaps in this component for the route content under the layout. Here is the component hierarchy Next.js creates for each route segment:

```
<Layout>
  <Template>
    <ErrorBoundary fallback={<error.tsx />}>
      <Suspense fallback={<loading.tsx />}>
        <ErrorBoundary fallback={<not-found.tsx />}>
          <page.tsx />
        </ErrorBoundary>
      </Suspense>
    </ErrorBoundary>
  </Template>
</Layout>
```

`layout.tsx` and `template.tsx` stay mounted. If the root layout itself throws, use [`global-error.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error).

The `error.tsx` export receives the error and an `unstable_retry` callback, just like the `retry()` in `catchError`:

```tsx
// error.tsx
"use client";

export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => unstable_retry()}>Try again</button>
    </div>
  );
}
```

Calling `unstable_retry()` re-fetches and re-renders the segment on the server.

## Conclusion

If you've been building the digest detection and refresh-plus-key workarounds yourself, `catchError` replaces all of that with a single function call. It's still `unstable_` but usable today, and worth adopting now if you need component-level error boundaries in Server Components.

You can [see it live](https://next-16-2-error-handling.vercel.app/before) or find the full source with all three approaches (before, workaround, and after) on [GitHub](https://github.com/aurorascharff/next-16-2-error-handling).

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
