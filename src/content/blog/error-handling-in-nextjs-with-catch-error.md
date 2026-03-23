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

This works well for regular `throw` errors. But Next.js uses `throw` internally for control flow: `notFound()`, `redirect()`, and the `authInterrupts` functions (`unauthorized()` and `forbidden()`) all throw special errors with digest prefixes that the framework is supposed to intercept. `react-error-boundary` doesn't know about these. It catches everything, including errors that were never meant for it.

When a Server Component calls `notFound()`, you expect the nearest `not-found.tsx` to render. Instead, `react-error-boundary` catches the throw and shows your error fallback. The user sees a generic error UI instead of a proper 404 page. The same happens with `redirect()`, `unauthorized()`, and `forbidden()`: the intended behavior never executes because the boundary swallows the throw.

The second issue is recovery. When you click "Try again" in a `react-error-boundary` fallback, it calls `resetErrorBoundary`, which clears the error state and re-renders the children. But for Server Components, re-rendering on the client doesn't re-fetch the data. The component renders again with the same stale or errored state. The user clicks retry and nothing changes.

## The Workaround

Before `catchError`, the workaround required two things: detecting framework errors on the server and forcing a data re-fetch on the client.

On the server side, you wrap your data fetching in a `try/catch` and check the error's digest. If it's a Next.js internal error (`NEXT_NOT_FOUND`, `NEXT_REDIRECT`, `NEXT_HTTP_ERROR_FALLBACK`), you rethrow it so the framework can handle it. Otherwise, you wrap the error so `react-error-boundary` can catch it:

```tsx
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

export default async function UserProfileSafe() {
  try {
    const user = await getUser();
    return (
      <div>
        <p>{user.name}</p>
        <p>{user.email}</p>
      </div>
    );
  } catch (error) {
    if (isNextInternalError(error)) {
      throw error;
    }
    throw new Error(
      error instanceof Error ? error.message : "Something went wrong"
    );
  }
}
```

On the client side, you replace the standard `resetErrorBoundary` with `router.refresh()` inside a transition, and bump a key to force the boundary to remount:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ErrorBoundary } from "react-error-boundary";

export function ReactErrorBoundaryFixed({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [errorKey, setErrorKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  return (
    <ErrorBoundary
      key={errorKey}
      fallbackRender={({ error }) => (
        <div>
          <p>{error.message}</p>
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
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
```

This works, but it's a lot of ceremony. Every Server Component that might call `notFound()` needs the digest detection, and every error boundary needs the refresh-plus-key pattern. The digest list is also fragile: `unauthorized()` and `forbidden()` (from `authInterrupts`) happen to be covered by the `NEXT_HTTP_ERROR_FALLBACK` prefix here, but it's not obvious, and any new throw-based API Next.js adds could slip through if you don't update the check. You're compensating for the fact that `react-error-boundary` has no awareness of Next.js control flow.

If you're using `try/catch` directly rather than an error boundary, [`unstable_rethrow`](https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow) from `next/navigation` simplifies the server-side part. Instead of the manual digest check, you call `unstable_rethrow(err)` at the top of your catch block and it re-throws any framework error automatically:

```tsx
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

## catchError

[`unstable_catchError`](https://nextjs.org/docs/app/api-reference/functions/catchError), introduced in Next.js 16.2, is imported from `next/error`. It's a framework-aware error boundary that solves both problems out of the box.

You define a fallback function that receives props and an error info object containing the error and a `retry` function:

```tsx
"use client";

import { unstable_catchError as catchError, type ErrorInfo } from "next/error";

function ErrorFallback(
  _props: object,
  { error, unstable_retry: retry }: ErrorInfo
) {
  return (
    <div>
      <p>{error.message}</p>
      <button onClick={() => retry()}>Try again</button>
    </div>
  );
}

export default catchError(ErrorFallback);
```

Then use it like any other component wrapper:

```tsx
import ErrorBoundary from "./ErrorBoundary";

export default function Page() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSkeleton />}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  );
}
```

Two things are different from `react-error-boundary`:

1. **Framework errors propagate correctly.** When `UserProfile` calls `notFound()`, `redirect()`, or any other internal throw, `catchError` doesn't catch it. The error reaches the framework and the expected behavior executes.

2. **`retry()` re-fetches server data.** Instead of just clearing client state, `retry()` re-fetches and re-renders the error boundary's contents on the server. If the underlying issue is resolved (a transient database timeout, for example), the component recovers with fresh data.

There's also a `reset()` function available if you only want to clear the error state without re-fetching. In most cases, `retry()` is what you want.

### Passing Props to the Fallback

The component returned by `catchError` forwards any props (except `children`) to the fallback function. This is useful for building reusable error boundaries with different configurations:

```tsx
function ErrorFallback(
  props: { title: string },
  { error, unstable_retry: retry }: ErrorInfo
) {
  return (
    <div>
      <h3>{props.title}</h3>
      <p>{error.message}</p>
      <button onClick={() => retry()}>Try again</button>
    </div>
  );
}

export const ErrorBoundary = catchError(ErrorFallback);
```

```tsx
<ErrorBoundary title="Failed to load user profile">
  <Suspense fallback={<LoadingSkeleton />}>
    <UserProfile />
  </Suspense>
</ErrorBoundary>
```

### error.tsx with retry

`catchError` is for component-level error boundaries. For route-level errors, the [`error.tsx` file convention](https://nextjs.org/docs/app/api-reference/file-conventions/error) also supports `unstable_retry` for re-fetching server data.

To understand where `error.tsx` sits, here's the component hierarchy Next.js creates for each route segment:

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

The `error.tsx` boundary wraps `loading.tsx`, `not-found.tsx`, and `page.tsx`, but does not wrap the `layout.tsx` or `template.tsx` in the same segment. When an error is caught, the fallback replaces everything inside that boundary while the layout stays mounted. To catch errors in the root layout, use `global-error.tsx`.

```tsx
"use client";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={() => unstable_retry()}>Try again</button>
    </div>
  );
}
```

Calling `unstable_retry()` re-fetches and re-renders the segment on the server. There's also a `reset()` function if you only need to clear the error state without re-fetching.

You don't need to wrap `error.tsx` exports with `catchError` since `error.tsx` already renders inside a built-in error boundary provided by Next.js. The difference is scope: `error.tsx` handles the entire route segment, while `catchError` lets you isolate errors in specific parts of the component tree without affecting the rest of the page.

## Conclusion

If you've been building the digest detection and refresh-plus-key workarounds yourself, `catchError` replaces all of that with a single function call. It's still `unstable_` but usable today, and worth adopting now if you need component-level error boundaries in Server Components.

You can [see it live](https://next-16-2-error-handling.vercel.app/before) or find the full source with all three approaches (before, workaround, and after) on [GitHub](https://github.com/aurorascharff/next-16-2-error-handling).

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
