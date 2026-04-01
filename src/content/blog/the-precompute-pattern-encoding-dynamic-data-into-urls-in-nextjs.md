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
description: The precompute pattern encodes request-specific data like auth state into URLs, letting you keep pages static even when content varies per user. Learn when this pattern is useful, how to implement it, and when 'use cache' makes it unnecessary.
---

In Next.js, a single dynamic API call like `cookies()` or `headers()` in a layout can force your entire page tree into dynamic rendering. For e-commerce applications, where most content is static but user-dependent features like authentication checks live at the root, this means every page is dynamically rendered on every request, even pages that have no user-specific content at all. The precompute pattern solves this by encoding request-specific data into the URL, turning what would be dynamic rendering into static generation with known variants.

## Table of contents

## The Problem: Dynamic Layouts

Consider a typical e-commerce application with a header that shows a user profile when logged in. The authentication check lives in the root layout because the header appears on every page:

```tsx
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

Because `isAuthenticated()` reads from `cookies()`, the entire layout becomes dynamic, and every page nested under it follows. Your About page, product listings, category pages: all dynamically rendered, all hitting the server on every request.

In e-commerce, this pattern is extremely common. Most of the page content is shared across users, things like product details, categories, and marketing content. The only truly user-specific part is often just the authentication state driving a login button or profile icon in the header. Yet that one `cookies()` call cascades through the entire route tree.

Before `'use cache'` and Partial Prerendering, pages were either fully static or fully dynamic. There was no middle ground. If you needed any dynamic data anywhere in the page tree, the whole page had to be dynamic. This led teams to try various workarounds: splitting route groups into static and dynamic segments, client-side fetching user data with `useSWR`, or building separate API endpoints for personalized content.

## The Request Context Pattern

Instead of reading dynamic APIs like `cookies()` inside components, we can resolve the dynamic data once in middleware (now called [proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)) and encode it into the URL as a hidden segment. The page itself sees a regular parameter that can be statically generated for each known variant.

The flow works like this:

1. A request hits the proxy
2. The proxy reads `cookies()` (or any other dynamic API) and determines the request context
3. The context is encoded and prepended to the URL as a path segment
4. Next.js rewrites the request to include this encoded segment
5. The page reads the context from params instead of calling dynamic APIs

Because the page only reads from `params` and never calls `cookies()` or `headers()` directly, it can be statically rendered. If you provide `generateStaticParams` for the known variants, Next.js will pre-generate them at build time or cache them with ISR.

## Implementation

Here is the implementation from my [Next.js 16 commerce demo](https://github.com/aurorascharff/next16-commerce/blob/request-context/proxy.ts). The request context encodes a simple `loggedIn` boolean, but you could include any request-specific data: locale, feature flags, A/B test variants, user type, or currency.

### Defining the Request Context

First, define the shape of your context and the encoding/decoding utilities. The context is serialized as base64url to keep URLs clean:

```ts
export interface RequestContextData {
  loggedIn: boolean;
}

export function encodeRequestContext(data: RequestContextData): string {
  const jsonString = JSON.stringify(data);
  return Buffer.from(jsonString).toString("base64url");
}

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

export function getRequestContext(params: {
  requestContext: string;
}): RequestContextData {
  return decodeRequestContext(params.requestContext);
}
```

The full utility file is on [GitHub](https://github.com/aurorascharff/next16-commerce/blob/request-context/utils/request-context.ts).

### Encoding in the Proxy

The proxy reads the cookie and rewrites the request to include the encoded context as the first URL segment:

```ts
import { NextResponse } from "next/server";
import { encodeRequestContext } from "@/utils/request-context";
import type { NextRequest } from "next/server";

function isUserAuthenticated(request: NextRequest): boolean {
  return !!request.cookies.get("selectedAccountId")?.value;
}

export function proxy(request: NextRequest) {
  const encodedContext = encodeRequestContext({
    loggedIn: isUserAuthenticated(request),
  });

  const nextUrl = new URL(
    `/${encodedContext}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url
  );

  return NextResponse.rewrite(nextUrl, { request });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

The user never sees the encoded segment in their browser URL because `NextResponse.rewrite` is an internal rewrite: the browser still shows `/products` while the server routes to `/eyJsb2dnZWRJbiI6dHJ1ZX0/products`.

### Reading the Context in the Layout

The [layout](https://github.com/aurorascharff/next16-commerce/blob/request-context/app/%5BrequestContext%5D/layout.tsx) reads the context from params instead of calling any dynamic API. Components like `UserProfile` use the decoded context rather than checking `cookies()` directly:

```tsx
import { encodeRequestContext } from "@/utils/request-context";
import type { RequestContextData } from "@/utils/request-context";

export async function generateStaticParams() {
  const contexts: RequestContextData[] = [
    { loggedIn: false },
    { loggedIn: true },
  ];
  return contexts.map(context => {
    return {
      requestContext: encodeRequestContext(context),
    };
  });
}

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

The `generateStaticParams` function returns the two known variants (logged in and logged out), so Next.js can pre-generate both versions at build time. After that first generation, pages are served from the CDN cache instead of hitting the server on every request.

## The Flags SDK Precompute

This pattern is not something I invented. It is formalized by the [Vercel Flags SDK](https://flags-sdk.dev/docs/frameworks/next/precompute) as the "precompute" pattern. The SDK provides a `precompute` function that encodes flag values into an encrypted URL segment, and a `generatePermutations` helper for build-time generation:

```tsx
import { type NextRequest, NextResponse } from "next/server";
import { precompute } from "flags/next";
import { marketingFlags } from "./flags";

export const config = { matcher: ["/"] };

export async function proxy(request: NextRequest) {
  const code = await precompute(marketingFlags);

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
  const banner = await showBanner(code, marketingFlags);

  return <div>{banner ? <p>Welcome</p> : null}</div>;
}
```

The Flags SDK also handles encryption (requiring a `FLAGS_SECRET` environment variable), `generatePermutations` for build-time rendering, and ISR for lazily caching new combinations. My implementation in the commerce demo uses plain base64url encoding to keep things simple, but the underlying idea is the same: resolve dynamic data once in the proxy, encode it into the URL, and let the page be static.

## High Cardinality and E-commerce Trade-offs

The precompute pattern works well when the number of variants is small. Two authentication states (logged in, logged out) means two versions of each page. Add a locale with three options and you have six. Still manageable.

The challenge comes with high cardinality. In enterprise e-commerce, you might have authentication state, locale, currency, region, user type (B2B vs B2C), and several feature flags or A/B test variants. If you have ten boolean flags, that is 1,024 possible permutations per page. This creates a combinatory explosion where build-time generation becomes impractical and ISR cache hit rates drop significantly.

E-commerce teams I've worked with typically handle this by being selective about what goes into the precomputed context. Authentication state and locale are good candidates because they have low cardinality and affect large parts of the page. Feature flags with many variants or A/B tests with many arms are better handled at the component level, either through client-side evaluation or, with Next.js 16, through `'use cache'` with Partial Prerendering.

The Flags SDK documentation recommends using [multiple groups](https://flags-sdk.dev/docs/frameworks/next/precompute) of flags scoped to specific pages rather than one global group, which helps contain the permutation count. You can also filter which specific combinations to pre-generate and let the rest be lazily generated through ISR.

ISR itself has trade-offs here. It was designed for incremental static _regeneration_, not incremental static _generation_. When used for progressively generating long-tail URLs, you end up with too many writes relative to reads, and the cache blows out on every deploy because a CSS change can affect every page. Cache components give more granular control to address this.

## When 'use cache' Makes This Unnecessary

With `cacheComponents` in Next.js 16, the precompute pattern becomes unnecessary for many cases. Instead of encoding data into URLs to avoid dynamic rendering, you can use `'use cache'` on individual components and let Partial Prerendering handle the split between static and dynamic content:

```tsx
async function FeaturedProducts() {
  "use cache";

  const products = await getFeaturedProducts();

  return (
    <>
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </>
  );
}
```

The header with its authentication check can remain dynamic while product listings, categories, and marketing content are cached. Each cached segment becomes part of the statically generated shell that ships immediately, and dynamic content streams in progressively. There is no need to encode auth state into the URL because the page is no longer forced into being entirely static or entirely dynamic.

This is why the [main branch](https://github.com/aurorascharff/next16-commerce/blob/main/app/layout.tsx) of my commerce demo omits the URL encoding solution entirely. With `'use cache'`, the `cookies()` call in the layout only makes the components that depend on it dynamic, while everything else can be cached independently.

## rootParams: The Missing Piece

The precompute pattern encodes data into URL segments, but components still need to receive those values somehow. Either the page extracts them from `params` and passes them as props, or each component reads `params` directly. This can lead to prop drilling or coupling components to a specific URL structure.

An upcoming feature called `rootParams` addresses this for the most common case: top-level dynamic segments like `[locale]` or `[requestContext]`. Instead of reading `params` and threading values through the component tree, components can import the parameter directly:

```tsx
import { locale } from "next/root-params";

async function CachedComponent() {
  "use cache";

  const currentLocale = await locale();
  // ...
}
```

The value automatically becomes a cache key for `'use cache'`, so cached components can vary by locale (or any other root parameter) without manual prop passing. I covered this in detail for internationalization in my post on [implementing `'use cache'` with next-intl](/posts/implementing-nextjs-16-use-cache-with-next-intl-internationalization), where `rootParams` eliminates the need for `setRequestLocale` and explicit locale threading.

For the precompute pattern specifically, `rootParams` would mean the request context hash could be accessed anywhere in the tree without drilling it through props, which is one of the main ergonomic downsides of the approach. Teams using precomputed feature flags, like the pattern where a hash of flag values is the first URL segment on every page, would no longer need placeholder `generateStaticParams` on every page just to satisfy the build.

## Conclusion

The precompute pattern is a deliberate trade-off: you take on URL complexity and variant management in exchange for static rendering and CDN caching. For applications with low-cardinality request context like authentication state or a handful of feature flags, it delivers real performance gains by keeping pages static. For high-cardinality scenarios common in enterprise e-commerce, be intentional about which data you encode and scope your flag groups to specific pages.

With `cacheComponents` and Partial Prerendering in Next.js 16, many of the use cases that drove teams to the precompute pattern can now be solved more naturally at the component level. The pattern remains valuable for specific cases like feature flag precomputation with the [Flags SDK](https://flags-sdk.dev/docs/frameworks/next/precompute), but you no longer need to restructure your entire application around URL segments just to avoid dynamic rendering.

You can find the full request context implementation on [GitHub](https://github.com/aurorascharff/next16-commerce/tree/request-context), and the main branch of the [commerce demo](https://github.com/aurorascharff/next16-commerce) shows the same application with `'use cache'` instead.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
