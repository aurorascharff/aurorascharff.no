---
author: Aurora Scharff
pubDatetime: 2025-11-03T10:22:00Z
title: Implementing Next.js 16 'use cache' with next-intl Internationalization
slug: implementing-nextjs-16-use-cache-with-next-intl-internationalization
featured: false
draft: false
tags:
  - Next.js 16
  - React Server Components
  - next-intl
  - Performance
  - i18n
  - use cache
description: Next.js 16 introduces component-level caching with the 'use cache' directive, but it doesn't work seamlessly with next-intl yet. Learn why and discover a practical workaround.
---

Next.js 16 introduces the `'use cache'` directive, but it doesn't work seamlessly with `next-intl` yet. In this blog post, I'll explore why the incompatibility exists, what the upcoming solution with `next/root-params` will look like, and show you a practical workaround you can use today.

## Table of contents

## Next.js 16 cacheComponents

Next.js 16 introduces a `cacheComponents` flag that enables the `'use cache'` directive for React Server Components. When enabled, you can mark components with `'use cache'` to cache their output and reuse it across requests:

```tsx
async function ProductList() {
  "use cache";

  const products = await getProducts();

  return (
    <>
      {products.map(product => (
        <p key={product.id}>{product.name}</p>
      ))}
    </>
  );
}
```

This fundamentally changes how data fetching works in the App Router. When `cacheComponents` is enabled, data fetching operations are excluded from pre-renders unless explicitly cached. This means data fetching happens at runtime by default, and you must specifically mark components for caching when you want to optimize performance. You enable it in your `next.config.js`:

```ts
const config: NextConfig = {
  cacheComponents: true,
};

export default config;
```

However, if you're using internationalization with `next-intl`, you'll run into compatibility issues.

## The Problem

While Next.js 16 itself is supported by `next-intl@4.4`, `'use cache'` doesn't work seamlessly with the library yet. If you try to use them together:

```tsx
async function ProductList() {
  "use cache";

  const t = await getTranslations("ProductPage");
  const products = await getProducts();

  return (
    <>
      <h2>{t("title")}</h2>
      {products.map(product => (
        <p key={product.id}>{product.name}</p>
      ))}
    </>
  );
}
```

This will error because by default, `getTranslations()` reads from `headers()` internally, and cached components cannot depend on request-time information. The same applies to any dynamic APIs like `cookies()` or `searchParams`.

## Why next-intl Uses headers()

Most developers use i18n libraries like [`next-intl`](https://next-intl.dev/) to handle internationalization in Next.js. Apps that use internationalization typically implement a top-level dynamic segment like `[locale]`. If you want to access the locale in deeply nested components, which you typically do, you need to read the segment value in a page or layout and manually pass it down through your component tree. This becomes cumbersome when many components need the locale argument.

To avoid this manual prop threading, `next-intl` passes the locale as a request header from middleware to Server Components behind the scenes. You can then call `getTranslations()` anywhere without threading the locale through your component tree. However, reading from `headers()` opts all pages into dynamic rendering by default. The library provides `setRequestLocale` to restore static rendering capabilities, but this requires careful implementation from developers.

The proper solution would be the ability to read params deeply from within the component tree without manual threading. This limitation was extensively discussed in the Next.js community as [a missing piece](https://github.com/vercel/next.js/discussions/58862). An upcoming API called `next/root-params` is being developed to address this. Once it ships, `next-intl` will be able to access the locale parameter directly without relying on headers, eliminating the need for `setRequestLocale` and explicit locale prop passing, making `'use cache'` work seamlessly.

## The Workaround

Until `next/root-params` arrives, there's a workaround you can use. To enable static rendering with `next-intl`, you need to follow the [static rendering setup](https://next-intl.dev/docs/routing/setup#static-rendering) from the official documentation. This requires implementing `generateStaticParams`, which returns an array of objects representing the dynamic segments to be statically generated at build time:

```tsx
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }));
}
```

You also need to call `setRequestLocale` in your layouts and pages:

```tsx
import {setRequestLocale} from 'next-intl/server';

export default async function LocaleLayout({children, params}: Props) {
  const {locale} = await params;

  // Enable static rendering
  setRequestLocale(locale);

  return (
    // ...
  );
}
```

This setup resolves errors from `cacheComponents` about needing Suspense boundaries around your `[locale]` dynamic segment and enables static rendering.

Now you can start adding `'use cache'` to your components. If you have a component that doesn't need `'use cache'`, you can keep using `getTranslations()` normally:

```tsx
async function DynamicComponent() {
  const t = await getTranslations("IndexPage");

  return (
    <>
      <h2>{t("dynamicComponent.title")}</h2>
      <p>{t("dynamicComponent.content")}</p>
    </>
  );
}
```

For components where you want to use `'use cache'`, you would need to accept the locale as a prop and pass it explicitly to `getTranslations()`. When you pass a `locale` parameter alongside the namespace, the function will use that value instead of reading from `headers()`:

```tsx
async function CachedComponent({ locale }: { locale: Locale }) {
  "use cache";

  const t = await getTranslations({ locale, namespace: "IndexPage" });

  return (
    <>
      <h2>{t("cachedComponent.title")}</h2>
      <p>{t("cachedComponent.content")}</p>
    </>
  );
}
```

Where would we get this locale value without dynamically rendering? In your page component, you can extract the locale from params and pass it down to the `CachedComponent`:

```tsx
export default async function IndexPage({ params }: PageProps) {
  const { locale } = await params;

  // Enable static rendering
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "IndexPage" });

  return (
    <>
      <h1>{t("title")}</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <DynamicComponent />
      </Suspense>
      <CachedComponent locale={locale} />
      <p>{t("description")}</p>
    </>
  );
}
```

The Suspense boundary around `DynamicComponent` is a requirement when using `cacheComponents`. It allows the cached component to render immediately as part of the static shell while the dynamic component streams in progressively, showing the loading skeleton until its data is ready. This prevents the entire page from blocking on slow data fetching. With Partial Prerendering, which is enabled by default with `cacheComponents`, `CachedComponent` is included in the static shell, delivering immediate content to users.

This follows a broader pattern in Next.js applications where you encode dynamic values into the URL structure to avoid relying on dynamic APIs like `headers()`, `cookies()`, or `searchParams`. Another example of this pattern is the [Vercel Flags SDK precompute pattern](https://flags-sdk.dev/frameworks/next/precompute) for feature flags. I've explored this pattern in a [separate branch of my Next.js 16 commerce demo](https://github.com/aurorascharff/next16-commerce/blob/request-context/proxy.ts), where I implemented a request context system that encodes authentication state into URLs. With `cacheComponents` in Next.js 16, you can now handle many of these cases more elegantly by using `'use cache'` directly instead of encoding everything into URLs, which is why the [main branch](https://github.com/aurorascharff/next16-commerce/blob/main/app/layout.tsx) omits the URL encoding solution.

You can find the full code for the examples in this post on [GitHub](https://github.com/aurorascharff/next-intl-cache-components).

## Update: next/root-params is here (Next.js 16.2)

Since writing this post, `next/root-params` has shipped! As of Next.js 16.2, you can use root params inside `"use cache"` functions thanks to [PR #91191](https://github.com/vercel/next.js/pull/91191). This means the prop-drilling workaround described above is no longer necessary.

To enable it, add the `rootParams` experimental flag in `next.config.ts`:

```ts
const config: NextConfig = {
  experimental: {
    rootParams: true,
  },
  cacheComponents: true,
};
```

Your `[locale]` segment must be a root parameter, which means there can't be an `app/layout.tsx` file above it. The root layout needs to live inside `[locale]`:

```
app/
  [locale]/        ← root parameter
    layout.tsx     ← root layout (renders <html> and <body>)
    page.tsx
```

With this structure, you can import `locale` from `next/root-params` and call it as an async function. In the layout, this replaces `await params`:

```tsx
import { locale as rootLocale } from "next/root-params";

export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
```

The `generateMetadata` function also benefits since it no longer needs to receive params:

```tsx
export async function generateMetadata() {
  const locale = (await rootLocale()) as Locale;
  const t = await getTranslations({ locale, namespace: "LocaleLayout" });

  return {
    title: t("title"),
  };
}
```

The real payoff is in cached components. Previously, the page had to extract locale from params and pass it as a prop. Now the cached component reads it directly from root params, and the value automatically becomes a cache key:

```tsx
import { locale as rootLocale } from "next/root-params";

async function CachedComponent() {
  "use cache";

  const locale = (await rootLocale()) as Locale;
  const t = await getTranslations({ locale, namespace: "IndexPage" });

  return (
    <>
      <h2>{t("cachedComponent.title")}</h2>
      <p>{t("cachedComponent.content")}</p>
    </>
  );
}
```

The page just renders `<CachedComponent />` without passing anything:

```tsx
export default async function IndexPage() {
  setRequestLocale((await rootLocale()) as Locale);

  const t = await getTranslations("IndexPage");

  return (
    <>
      <h1>{t("title")}</h1>
      <Suspense fallback={<ComponentSkeleton />}>
        <DynamicComponent />
      </Suspense>
      <CachedComponent />
      <p>{t("description")}</p>
    </>
  );
}
```

Note that `setRequestLocale` is still needed in layouts and pages for now. You also still need to pass `locale` explicitly to `getTranslations({locale, namespace})` inside `"use cache"`, because `getTranslations('Namespace')` without explicit locale still goes through `getRequestConfig`, which reads from `headers()`. Once `next-intl` integrates root params internally, even that won't be necessary and `getTranslations('Namespace')` will just work everywhere.

I've updated the [demo repo](https://github.com/aurorascharff/next-intl-cache-components) with all of these changes.

## Conclusion

In this blog post, I explored the compatibility challenges between `next-intl` and Next.js 16's `'use cache'`. The temporary workaround involves explicit locale passing, but the proper solution is `next/root-params`, which will allow i18n libraries to access params without relying on headers. With Next.js 16.2, root params are available and work inside `"use cache"`, so the prop-drilling workaround is no longer needed. Once `next-intl` integrates root params internally, you'll be able to simplify even further by removing `setRequestLocale` calls and explicit locale arguments entirely.

Thanks to [Jan Amann](https://x.com/jamannnnnn) for the [detailed explanation](https://x.com/aurorascharff/status/1985333783747285184) of the current state and future plans for `next-intl` compatibility with `'use cache'`.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
