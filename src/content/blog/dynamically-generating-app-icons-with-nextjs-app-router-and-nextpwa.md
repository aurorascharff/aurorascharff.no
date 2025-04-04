---
author: Aurora Scharff
pubDatetime: 2024-11-08T08:00:00Z
title: Dynamically Generating PWA App Icons in the Next.js App Router
slug: dynamically-generating-app-icons-with-nextjs-app-router-and-nextpwa
featured: false
draft: false
tags:
  - React Server Components
  - Next.js
  - App Router
  - next-pwa
  - Progressive Web Apps
  - PWA
description: Progressive Web Apps (PWAs) are a great way to enhance the user experience of your web application. In this blog post, I will show you how to dynamically generate PWA app icons in the Next.js App Router using next-pwa.
---

Progressive Web Apps (PWAs) are a great way to enhance the user experience of your web application. They provide a more app-like experience by allowing users to install the app on their device and access it offline.

I recently had the task of differentiating between different environments in the PWA app icons for a Next.js App Router project. The app icons needed to be dynamically generated based on the environment. I wanted to share how I accomplished this using the Next.js App Router and [next-pwa](https://github.com/shadowwalker/next-pwa).

## Table of contents

## The Use Case

In the project I am working on, we have different environments for development, test, staging, and production. We are differentiating between these environments by changing the logo of the app. This makes it easier for both us and users to identify which environment they are in.

We are also offering the application as a PWA, so we need to generate the app icons dynamically based on the environment to match the logo, since this is the icon that will be displayed on the phone's home screen.

## Setting Up next-pwa

The library we will be using to set it up the PWA is [next-pwa](https://github.com/shadowwalker/next-pwa). Next-pwa is a plugin for Next.js that allows you to add PWA support to your app with ease.

To get started, we need to set it up in our Next.js project. These steps follow a pretty standard process, but I'll walk you through them here.

### Installation

First, install next-pwa:

```bash
npm install next-pwa
```

### Configuration

Next, add the next-pwa configuration to your `next.config.ts` (or `next.config.js`) file:

```ts
// next.config.ts
import type { NextConfig } from 'next';

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  // Your Next.js config
};

module.exports = withPWA(nextConfig);
```

Configure this to your app's needs, such as the `dest`, `disable`, `register`, and `skipWaiting` properties. Refer to the [next-pwa documentation](https://github.com/shadowwalker/next-pwa).

### Creating the manifest.json

The next step is to create the PWA manifest to in a `public/manifest.json` file:

```json
{
  "name": "My App",
  "short_name": "My App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/images/pwa/192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/images/pwa/512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Remember to configure this to your app's needs, such as the `name`, `short_name`, `start_url`, `background_color`, `theme_color`, and `icons` and `screenshots` properties.

### Linking the manifest.json

Lastly, link the `manifest.json` file to your app by adding it to the metadata of the root layout component:

```tsx
// app/layout.tsx

export const metadata: Metadata = {
    description: 'The best app ever',
    manifest: '/manifest.json',
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

That should be all you need to set up next-pwa in your Next.js project! If you're having trouble, refer to the docs or other resources for more information. There's a lot of tutorials and guides out there.

## Testing Locally with HTTPS

When working with PWAs, it's nice to be able to test the app locally. However, to test the PWA features, you need to run your the Next.js app over HTTPS.

The [Next.js documentation](https://nextjs.org/docs/app/api-reference/cli/next#using-https-during-development) contains information on how to run with HTTPS.

In addition, [this article on PWAs from the Next.js docs](https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps#7-testing-locally) explains why and how to run with HTTPs when working with PWAs. It also contains some important security aspects to consider, and other useful information.

Basically, you can run your app with HTTPS with the following command:

```bash
next dev --experimental-https
```

You can also create a command in your `package.json` to easily run it again in the future:

```json
{
  "scripts": {
    "dev": "next dev",
    "dev.https": "next dev --experimental-https",
    ...
  }
}
```

Now, let's move on to dynamically generating the app icons based on the environment.

## Dynamically Generating the manifest.json with an API route

We need to access the environment variables to determine which app icon to use. A way to do this in Next.js is by creating an API route. This API route can read an environment variable and return the appropriate JSON response for the manifest.

For the App Router, we can create an API route in the `app/api/` directory with a folder containing a `route.ts` file. Let's create a `manifest/` directory with a `route.ts` file:

```ts
// app/api/manifest/route.ts

export async function GET() {
  const manifest = {
    name: 'My App',
    short_name: `My App`,
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

Then, we can replace the link to the `manifest.json` file with this API route that fetches the manifest dynamically:

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

And we can just delete the original `public/manifest.json` file.

## Dynamically Generating the webmanifest with manifest.ts

*NB! Currently verifying that this approach works together with next-pwa. Will update this section soon. If you don't need next-pwa, you can definitely use this approach.*

Another way to generate the `manifest.json` dynamically is by creating a `manifest.ts` file in the `app/` directory. This file can read the environment variable and return the appropriate manifest object, the same was as the API route could.

I discovered this in the [Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest) after writing the previous section.

We create a `manifest.ts` file in the `app/` directory:

```ts
// app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My App',
    short_name: `My App`,
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
}
```

This generates a `manifest.webmanifest` file that is added to the head of the HTML document. It can also access the environment variables, so we can decide which icon to use based on the environment.

*TODO*: try linking it to the `app/layout.tsx` file and see if it works with next-pwa.

<!-- This generates a `manifest.webmanifest` file that we can link to in the `app/layout.tsx` file:

```tsx
// app/layout.tsx

export const metadata: Metadata = {
    description: 'The best app ever',
    manifest: '/manifest.webmanifest',
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

And we can also delete the API route. -->

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

## Caching the manifest.json

To avoid re-fetching the manifest.json on every page load, you define caching behavior for it in the `next.config.ts` (or `next.config.js`) file:

```ts
// next.config.ts
import type { NextConfig } from 'next';

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  // Your Next.js config
  headers: async () => {
  return [
    {
      // Cache the manifest file (default: public, max-age=0, must-revalidate)
      headers: [
        {
          key: 'cache-control',
          value: 'public, max-age=3600',
        },
      ],
      source: '/no/api/manifest',
    }
  ];
};

module.exports = withPWA(nextConfig);
```

## Conclusion

In this blog post, I showed you how to dynamically generate PWA app icons in the Next.js App Router with API routes and next-pwa. This approach allows you to differentiate between different environments by changing the app icon, making it easier for both you and users to identify which environment they are in.

Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
