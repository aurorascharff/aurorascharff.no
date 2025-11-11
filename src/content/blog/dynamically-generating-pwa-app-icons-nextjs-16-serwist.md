---
author: Aurora Scharff
pubDatetime: 2024-11-08T08:00:00Z
modDatetime: 2025-11-11T08:00:00Z
title: Dynamically Generating PWA App Icons in Next.js 16 with Serwist
slug: dynamically-generating-pwa-app-icons-nextjs-16-serwist
featured: false
draft: false
tags:
  - React Server Components
  - Next.js
  - App Router
  - Serwist
  - Progressive Web Apps
  - PWA
description: Learn how to dynamically generate PWA app icons in Next.js 16 using Serwist. This guide shows how to create environment-specific icons for development, staging, and production environments.
---

Progressive Web Apps (PWAs) are a great way to enhance the user experience of your web application. They provide a more app-like experience by allowing users to install the app on their device and access it offline.

I recently had the task of differentiating between different environments in the PWA app icons for a Next.js 16 project. The app icons needed to be dynamically generated based on the environment. I wanted to share how I accomplished this using the Next.js App Router and [Serwist](https://serwist.pages.dev/).

**Update (Nov 2025)**: This article has been updated to use Serwist instead of next-pwa, as next-pwa is no longer compatible with Next.js 16.

## Table of contents

## The Use Case

In the project I am working on, we have different environments for development, test, staging, and production. We are differentiating between these environments by changing the logo of the app. This makes it easier for both us and users to identify which environment they are in.

We are also offering the application as a PWA, so we need to generate the app icons dynamically based on the environment to match the logo, since this is the icon that will be displayed on the phone's home screen.

## Setting Up Serwist

The library we will be using to set up the PWA is [Serwist](https://serwist.pages.dev/) via `@serwist/next`. Serwist is a modern, actively maintained service worker library that works with Next.js 16 and beyond. It's the recommended replacement for next-pwa, which is no longer compatible with newer Next.js versions.

To get started, we need to set it up in our Next.js project. These steps follow a pretty standard process, but I'll walk you through them here.

### Installation

First, install the required packages:

```bash
npm install @serwist/next serwist
npm install -D @serwist/cli
```

### Configuration

Next, add the Serwist configuration to your `next.config.ts` (or `next.config.js`) file:

```ts
// next.config.ts
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  // Your Next.js config
};

export default withSerwist(nextConfig);
```

Configure this to your app's needs, such as the `swSrc`, `swDest`, and `disable` properties. Refer to the [Serwist documentation](https://serwist.pages.dev/).

### Creating the Service Worker Source File

Create a service worker source file at `src/sw.ts`:

```ts
// src/sw.ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

This file will be compiled to `public/sw.js` during the build process.

### Creating the Manifest Route

Instead of using a static `public/manifest.json` file, we'll create a dynamic API route that generates the manifest. This allows us to access environment variables and customize the manifest based on the runtime environment, which is what we need for generating different app icons for development, staging, and production.

Create an API route in your `app/` directory:

```ts
// app/api/manifest/route.ts (or app/[locale]/api/manifest/route.ts if using i18n)

export async function GET() {
  const manifest = {
    name: 'My App',
    short_name: 'My App',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/images/pwa/192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/images/pwa/512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
```

Remember to configure this to your app's needs, such as the `name`, `short_name`, `start_url`, `background_color`, `theme_color`, `icons` and `screenshots` properties.

### Linking the Manifest

Lastly, link the manifest route to your app by adding it to the metadata of the root layout component:

```tsx
// app/layout.tsx

export const metadata: Metadata = {
    description: 'The best app ever',
    manifest: '/api/manifest',
    title: `My App`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

That should be all you need to set up Serwist in your Next.js project! If you're having trouble, refer to the [Serwist documentation](https://serwist.pages.dev/) for more information.

## Testing Locally with HTTPS

When working with PWAs, it's nice to be able to test the app locally. However, to test the PWA features, you need to run your Next.js app over HTTPS.

**Important Note for Serwist Users**: Serwist does not currently support Turbopack (Next.js 16's default dev bundler) - see [GitHub issue #54](https://github.com/serwist/serwist/issues/54). To test PWA functionality in development, you need to use webpack by adding the `--webpack` flag:

```bash
next dev --experimental-https --webpack
```

You can create a command in your `package.json` to easily run it:

```json
{
  "scripts": {
    "dev": "next dev",
    "dev.https": "next dev --experimental-https --webpack",
    ...
  }
}
```

**Note**: To suppress the Turbopack warning in development, add this to your `.env` file:

```env
SERWIST_SUPPRESS_TURBOPACK_WARNING=1
```

The [Next.js documentation](https://nextjs.org/docs/app/api-reference/cli/next#using-https-during-development) contains more information on running with HTTPS, and [this article on PWAs from the Next.js docs](https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps#7-testing-locally) explains why HTTPS is needed and includes important security considerations.

## Generating App Icons Based on the Environment

The last step is to generate the app icons based on the environment.

We assume that there is an `.env` file in the root of our project with the following environment variables, which are also available in the deployed environment:

```env
// .env

NEXT_PUBLIC_ENVIRONMENT=dev
// other envvars
```

We can read this variable inside the `manifest` API route to generate the correct icon based on the environment.

The icon-images, i.e `/images/pwa/512_dev.png`, are inside the `public/` directory. By naming the files with the environment, we can easily differentiate between them without writing a lot of code:

```ts
// app/api/manifest/route.ts

export async function GET() {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT;
  const iconSrc512 = `/images/pwa/512_${environment}.png`;
  const iconSrc192 = `/images/pwa/192_${environment}.png`;

  const manifest = {
    name: 'My App',
    short_name: `My App`,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: iconSrc192,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: iconSrc512,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
```

Tailor the generation of the `manifest.json` to your app's needs. For example, you can have a helper function to get the environment label based on the environment:

```ts
// app/api/manifest/route.ts
import { getEnvironmentLabel } from '@/utils/getEnvironmentLabel';

export async function GET() {
  const environmentLabel = getEnvironmentLabel();
  const iconSrc512 = `/images/pwa/512_${environmentLabel}.png`;
  const iconSrc192 = `/images/pwa/192_${environmentLabel}.png`;
  ...
```

It can look something like this:

```ts
// utils/getEnvironmentLabel.ts
import { env } from '@/../env.mjs';

type EnvironmentLabel = 'DEV' | 'INTERN TEST' | 'TEST' | '';

export function getEnvironmentLabel(): EnvironmentLabel {
  const environment = env.NEXT_PUBLIC_ENVIRONMENT;

  const environmentMap: Record<string, EnvironmentLabel> = {
    dev: 'DEV',
    staging: 'TEST',
    test: 'INTERN TEST',
  };

  return environmentMap[environment as EnvironmentLabel] || '';
}
```

It's up to you and the requirements of your project what you want to do here. You can do other dynamic things other than just generating icons as well.

## Result

Now, when you access the app on each environment URL and download it, the app icons will be different. It can look something like this:

![Multiple apps example](@assets/pwa-icons.jpeg)

Beautiful!

## Caching the Manifest

To avoid re-fetching the manifest on every page load, you can define caching behavior for it in the `next.config.ts` (or `next.config.js`) file:

```ts
// next.config.ts
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  headers: async () => {
    return [
      {
        // Cache the manifest file
        headers: [
          {
            key: 'cache-control',
            value: 'public, max-age=3600',
          },
        ],
        source: '/api/manifest',
      },
    ];
  },
};

export default withSerwist(nextConfig);
```

## Conclusion

In this blog post, I showed you how to dynamically generate PWA app icons in the Next.js App Router with API routes and Serwist. This approach allows you to differentiate between different environments by changing the app icon, making it easier for both you and users to identify which environment they are in.

Serwist is the modern, actively maintained solution for PWAs in Next.js and works great with Next.js 16. While it doesn't support Turbopack yet, you can easily test PWA functionality in development by using webpack with the `--webpack` flag.

Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
