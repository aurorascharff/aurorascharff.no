---
author: Aurora Scharff
pubDatetime: 2026-04-01T10:00:00Z
title: "The Precompute Pattern: Encoding Dynamic Data into URLs in Next.js"
slug: the-precompute-pattern-encoding-dynamic-data-into-urls-in-nextjs
featured: false
draft: false
tags:
  - Next.js 16
  - React Server Components
  - Performance
  - Caching
  - use cache
description: Before cache components, the Precompute pattern encoded request-specific data like auth state into URLs to keep pages static. This post documents how it works, where it shows up in practice, and what cache components mean for it.
---

Before cache components in Next.js 16, pages were either fully static or fully dynamic. A single `cookies()` or `headers()` call in a layout would force every nested page into dynamic rendering. The Precompute pattern was a way to work around this by encoding request-specific data into the URL, turning dynamic rendering into static generation with known variants.

With `cacheComponents`, this is no longer necessary for most cases, but the pattern is still used in production, especially by larger e-commerce teams. It's the same concept formalized by the [Vercel Flags SDK](https://flags-sdk.dev/docs/frameworks/next/precompute) and used by i18n libraries for locale routing. I also covered it briefly in my [Next.js Conf talk](https://www.youtube.com/watch?v=iRGc8KQDyQ8&t=147s). In this post, I'll walk through how it works using a [branch of my commerce demo](https://github.com/aurorascharff/next16-commerce/tree/request-context) and reflect on the trade-offs these teams face: high cardinality, ISR limitations, and what cache components mean for it.

## Table of contents

## The Problem: Dynamic Rendering

Any component that calls a dynamic API like `cookies()` or `headers()` opts into dynamic rendering. When that happens in a root layout, the impact is especially wide because every page nested under it becomes dynamic too. A typical example is an e-commerce app where the root layout checks authentication state for the header:

```tsx
// app/layout.tsx
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLoggedIn = await isAuthenticated(); // reads cookies()

  return (
    <html>
      <body>
        <Header isLoggedIn={isLoggedIn} />
        <main>{children}</main>
      </body>
    </html>
  );
}
```

This `cookies()` call made every nested page dynamic, including product listings, categories, and marketing pages that are otherwise fully shareable. The only user-specific part might be a login button or personalized recommendation, but that single dynamic call cascaded through the entire route tree. Teams worked around it by splitting route groups or client-side fetching personalized content. The Precompute pattern was another, more structured approach.

Today, cache components solve this specific problem differently, which I'll get to later in this post. But the Precompute pattern predates that and remains relevant for other use cases.

## The Precompute Pattern

Instead of reading dynamic APIs like `cookies()` inside components, we can resolve the dynamic data once in middleware (now called [proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)) and encode it into the URL as a hidden segment. The page itself sees a regular parameter that can be statically generated for each known variant.

The flow works like this:

1. A request hits the proxy
2. The proxy reads `cookies()` (or any other dynamic API) and determines the precomputed context
3. The context is encoded and prepended to the URL as a path segment
4. Next.js rewrites the request to include this encoded segment
5. The page reads the context from params instead of calling dynamic APIs

Because the page only reads from `params` and never calls `cookies()` or `headers()` directly, it can be statically rendered. If you provide `generateStaticParams` for the known variants, Next.js will pre-generate them at build time or cache them with ISR.

## Implementation

Here is a simplified example from the [commerce demo branch](https://github.com/aurorascharff/next16-commerce/tree/request-context) linked above. The precomputed context encodes a simple `loggedIn` boolean, but in a real setup you could include locale, feature flags, A/B test variants, user type, currency, or any other request-resolvable data.

### Defining the Precomputed Context

Define the shape of your context and the encoding/decoding functions. In this example, they live in a [separate file](https://github.com/aurorascharff/next16-commerce/blob/request-context/utils/request-context.ts). The context is serialized as base64url to keep URLs clean:

```ts
// utils/request-context.ts
export interface RequestContextData {
  loggedIn: boolean;
  // Examples of other data you could include:
  //   locale?: string;              // 'en', 'no', 'sv'
  //   theme?: 'light' | 'dark';
  //   userType?: 'b2c' | 'b2b';
  //   featureFlags?: string[];      // ['newCheckout', 'betaFeatures']
  //   region?: string;              // 'eu', 'us', 'asia'
  //   currency?: string;            // 'USD', 'EUR', 'NOK'
  //   experiments?: Record<string, string>; // A/B testing variants
}

// Serialize to base64url for clean URLs
export function encodeRequestContext(data: RequestContextData): string {
  const jsonString = JSON.stringify(data);
  return Buffer.from(jsonString).toString("base64url");
}

// Decode with a safe fallback for invalid segments
export function decodeRequestContext(encoded: string): RequestContextData {
  try {
    const jsonString = Buffer.from(encoded, "base64url").toString();
    const data = JSON.parse(jsonString);

    return {
      loggedIn: typeof data.loggedIn === "boolean" ? data.loggedIn : false,
    };
  } catch {
    return { loggedIn: false };
  }
}

// Convenience wrapper for reading from params
export function getRequestContext(params: {
  requestContext: string;
}): RequestContextData {
  return decodeRequestContext(params.requestContext);
}
```

The encoding produces short URL-safe strings like `eyJsb2dnZWRJbiI6dHJ1ZX0`, which becomes the hidden path segment the proxy prepends to every request.

### Encoding in the Proxy

The [proxy](https://github.com/aurorascharff/next16-commerce/blob/request-context/proxy.ts) reads the cookie and rewrites the request to include the encoded context as the first URL segment:

```ts
// proxy.ts
import { NextResponse } from "next/server";
import { encodeRequestContext } from "@/utils/request-context";
import type { NextRequest } from "next/server";

function isUserAuthenticated(request: NextRequest): boolean {
  return !!request.cookies.get("selectedAccountId")?.value;
}

export function proxy(request: NextRequest) {
  // Resolve dynamic data once, here
  const encodedContext = encodeRequestContext({
    loggedIn: isUserAuthenticated(request),
  });

  // Prepend the encoded context as the first URL segment
  const nextUrl = new URL(
    `/${encodedContext}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url
  );

  // Internal rewrite: the browser URL stays unchanged
  return NextResponse.rewrite(nextUrl, { request });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

The browser still shows `/products` while the server routes to `/eyJsb2dnZWRJbiI6dHJ1ZX0/products`. The encoded segment is invisible to the user.

### Reading the Context in Components

Components that previously called `cookies()` or `isAuthenticated()` now read from the decoded precomputed context instead. A page or component receives the `requestContext` param and decodes it with `getRequestContext`. Note that this means the param needs to be passed down or accessed from `params` in every component that needs it, which introduces prop drilling:

```tsx
import { getRequestContext } from "@/utils/request-context";

export default async function UserProfile({
  params,
}: {
  params: Promise<{ requestContext: string }>;
}) {
  // Read from params instead of cookies()
  const { requestContext } = await params;
  const { loggedIn } = getRequestContext({ requestContext });

  if (!loggedIn) {
    return <LoginButton />;
  }

  return <ProfileMenu />;
}
```

No `cookies()` call, no dynamic rendering. The [layout](https://github.com/aurorascharff/next16-commerce/blob/request-context/app/%5BrequestContext%5D/layout.tsx) itself just renders the header and children without needing to resolve any auth state:

```tsx
// app/[requestContext]/layout.tsx
export default async function RequestContextLayout({
  children,
}: LayoutProps<"/[requestContext]">) {
  return (
    <>
      <Header rightContent={<UserProfile />} />
      <main>{children}</main>
    </>
  );
}
```

The `[requestContext]` param is what makes the variants distinct, but the layout doesn't need to read it directly.

### Pre-generating Variants with generateStaticParams

To make the pages fully static, `generateStaticParams` returns the known variants of the precomputed context. In this case, logged in and logged out:

```tsx
import { encodeRequestContext } from "@/utils/request-context";
import type { RequestContextData } from "@/utils/request-context";

export async function generateStaticParams() {
  // Two known variants: logged out and logged in
  const contexts: RequestContextData[] = [
    { loggedIn: false },
    { loggedIn: true },
  ];
  // Each variant gets its own pre-generated static page
  return contexts.map(context => {
    return {
      requestContext: encodeRequestContext(context),
    };
  });
}
```

In the build output, you can see both variants generated as static pages:

```
Route (app)                                    Size  First Load JS
┌ ○ /[requestContext]                          ...   ...
├ ├ /eyJsb2dnZWRJbiI6ZmFsc2V9
├ └ /eyJsb2dnZWRJbiI6dHJ1ZX0
```

After that first generation, pages are served from the CDN cache instead of hitting the server on every request.

## The Flags SDK Precompute

This pattern is not something I invented. It is formalized by the [Vercel Flags SDK](https://flags-sdk.dev/docs/frameworks/next/precompute) as the "precompute" pattern. The SDK provides a `precompute` function that encodes flag values into an encrypted URL segment, and a `generatePermutations` helper for build-time generation:

```tsx
import { type NextRequest, NextResponse } from "next/server";
import { precompute } from "flags/next";
import { marketingFlags } from "./flags";

export const config = { matcher: ["/"] };

export async function proxy(request: NextRequest) {
  // Evaluate all flags and encode the result as an encrypted string
  const code = await precompute(marketingFlags);

  // Same rewrite pattern as the manual approach
  const nextUrl = new URL(
    `/${code}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url
  );

  return NextResponse.rewrite(nextUrl, { request });
}
```

The page then reads flag values from the precomputed code rather than evaluating flags at request time:

```tsx
import { marketingFlags, showBanner } from "../../flags";

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // Read the flag value from the precomputed code, not from a live evaluation
  const banner = await showBanner(code, marketingFlags);

  return <div>{banner ? <p>Welcome</p> : null}</div>;
}
```

The Flags SDK also handles encryption (requiring a `FLAGS_SECRET` environment variable), `generatePermutations` for build-time rendering, and ISR for lazily caching new combinations. My implementation uses plain base64url encoding to keep things simple, but the underlying idea is the same.

## High Cardinality and E-commerce Trade-offs

High cardinality means having a large number of possible values for a given dimension. E-commerce routes like `product/[id]` are already high cardinality on their own — a catalog with thousands of products means thousands of pages. The Precompute pattern adds another dimension on top: each piece of encoded data (auth state, locale, currency, feature flags) multiplies every existing route variant. Consider a commerce app with this route tree:

```
app/
├── [requestContext]/
│   ├── page.tsx              # home
│   ├── all/page.tsx          # product listing
│   ├── product/[id]/page.tsx # product detail (thousands of products)
│   ├── cart/page.tsx
│   ├── about/page.tsx
│   └── user/page.tsx
```

With just auth state, each route gets two variants. Add three locales and four currencies, and every product page now has 24 variants across the entire catalog. Build-time generation becomes impractical, and ISR cache hit rates drop because the cache is spread across too many combinations.

E-commerce teams I've worked with handle this by being selective about what goes into the precomputed context. Auth state and locale are good candidates because they have low cardinality and affect large parts of the page. Feature flags with many variants or A/B tests with many arms are still precomputed, but teams only pre-generate the most common combinations and rely on ISR for the rest. The Flags SDK documentation recommends using multiple groups of flags scoped to specific pages rather than one global group, which helps contain the permutation count.

ISR itself has trade-offs here. It was designed for incremental static _regeneration_, not incremental static _generation_. When a request hits a param combination that wasn't pre-generated with `generateStaticParams`, the render is blocking: the user waits for the full page to be built before seeing anything. There is no fallback shell served in the meantime. This is a known limitation, and the Next.js team is working on fallback upgrading to address it, where a generic fallback shell is served instantly and the full page is built in the background. Until then, on-demand generation through ISR means a cold-start penalty for every new variant.

On top of that, the ISR cache blows out on every deploy because a CSS change can affect every page, leading to too many writes relative to reads when used for progressive generation. Cache components offer more granular control in theory, but there are still open questions around controlling what gets cached and evicted at the ISR level.

## When 'use cache' Makes This Unnecessary

With `cacheComponents` in Next.js 16, the Precompute pattern becomes unnecessary for many cases. Instead of encoding data into URLs to avoid dynamic rendering, you can use `'use cache'` on individual components and let Partial Prerendering handle the split between static and dynamic content. In the [main branch](https://github.com/aurorascharff/next16-commerce/blob/main/app/layout.tsx) of my commerce demo, the layout passes the auth check as a promise through a provider, without awaiting it:

```tsx
// app/layout.tsx
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const loggedIn = getIsAuthenticated(); // no await, no blocking

  return (
    <html lang="en">
      <body>
        <AuthProvider loggedIn={loggedIn}>
          <Header />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
```

The auth check is not awaited, so it doesn't block the layout from rendering. The promise flows through the `AuthProvider` and is resolved where it's needed. Server components like `UserProfile` can await the data directly through `getCurrentAccount()`, which can read cookies internally. Client components access it through a hook that unwraps the promise with `use()`:

```tsx
// features/auth/components/AuthProvider.tsx
export const useLoggedIn = () => {
  const { loggedIn } = useAuth();
  return use(loggedIn);
};
```

Either way, only the components that consume the auth state suspend, while the rest of the page renders immediately. This follows the [sharing data with Client Components](https://next-16-recipes.vercel.app/sharing-data-with-client-components) pattern.

Components that don't depend on dynamic APIs are cached independently with `'use cache'`:

```tsx
// features/product/components/FeaturedProducts.tsx
export default async function FeaturedProducts() {
  "use cache";

  cacheTag("featured-product");

  const products = await getFeaturedProducts(4);

  return (
    <div>
      {products.map(product => (
        <ProductCard key={product.id} /* ... */ />
      ))}
    </div>
  );
}
```

The `cookies()` call in `UserProfile` only makes that component dynamic. `FeaturedProducts`, `Hero`, `FeaturedCategories`, and other cached components become part of the statically generated shell that ships immediately, while the dynamic user profile streams in progressively.

That said, cache components solve the auth-in-layout problem specifically. In a real e-commerce setup, you might still need to vary cached content by region, currency, user type, or feature flags. Those values affect what the cached components themselves render, so you can't just suspend them as dynamic. For those cases, the Precompute pattern or the Flags SDK remain useful even alongside `'use cache'`.

## rootParams: The Missing Piece

As mentioned earlier, the prop drilling of `requestContext` through params is one of the main ergonomic pain points of this pattern. An upcoming feature called `rootParams` addresses this for top-level dynamic segments like `[locale]` or `[requestContext]`. Instead of threading values through the component tree, components can import the parameter directly:

```tsx
import { locale } from "next/root-params";

async function CachedComponent() {
  "use cache";

  const currentLocale = await locale();
  // ...
}
```

The value automatically becomes a cache key for `'use cache'`, so cached components can vary by locale (or any other root parameter) without manual prop passing. I covered this in detail for internationalization in my [next-intl cache components post](/posts/implementing-nextjs-16-use-cache-with-next-intl-internationalization), where `rootParams` eliminates the need for `setRequestLocale` and explicit locale threading.

For the Precompute pattern specifically, `rootParams` would mean the precomputed hash could be accessed anywhere in the tree without drilling it through props. Teams using precomputed feature flags, like the pattern where a hash of flag values is the first URL segment on every page, would no longer need placeholder `generateStaticParams` on every page just to satisfy the build.

## Links

You can find the full implementation on [GitHub](https://github.com/aurorascharff/next16-commerce/tree/request-context), and the main branch of the [commerce demo](https://github.com/aurorascharff/next16-commerce) shows the same application with `'use cache'` instead.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
