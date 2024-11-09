---
author: Aurora Scharff
pubDatetime: 2024-11-08T08:00:00Z
title: Dynamically Generating PWA App Icons in the Next.js App Router
slug: dynamically-generating-app-icons-with-nextjs-app-router-and-nextpwa
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - App Router
  - next-pwa
  - Progressive Web Apps
  - PWA
description: Progressive Web Apps (PWAs) are a great way to enhance the user experience of your web application. In this blog post, I will show you how to dynamically generate PWA app icons in the Next.js App Router using NextPWA.
---

Progressive Web Apps (PWAs) are a great way to enhance the user experience of your web application. They provide a more app-like experience by allowing users to install the app on their device and access it offline.

I recently had the task of differentiating between different environments in the PWA app icons for a Next.js App Router project. The app icons needed to be dynamically generated based on the environment. I wanted to share how I accomplished this using the Next.js App Router and [next-pwa](https://github.com/shadowwalker/next-pwa).

## Table of contents

## The Use Case

In the project I am working on, we have different environments for development, test, staging, and production. We are differentiating between these environments by changing the logo of the app. This makes it easier for both us and users to identify which environment they are in.

We are also offering the application as a PWA, so we need to generate the app icons dynamically based on the environment to match the logo, since this is the icon that will be displayed on the phone's home screen.

## Setting Up next-pwa

The library we will be using to set it up the PWA is [next-pwa](https://github.com/shadowwalker/next-pwa). Next-pwa is a plugin for Next.js that allows you to add PWA support to your app with ease.

To get started, we need to it up in our Next.js project. These steps follow a pretty standard process, but I'll walk you through them here.

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

### Adding the manifest.json

Then, add the PWA manifest to your `public/manifest.json` file:

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
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Remember to configure this to your app's needs, such as the `name`, `short_name`, `start_url`, `background_color`, `theme_color`, and `icons` and `screenshots` properties.

### Linking the manifest.json to the App

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

In addition, [this article on PWAs from the Next.js docs](https://nextjs.org/docs/app/building-your-application/configuring/progressive-web-apps#7-testing-locally) explains why and how to run with HTTPs when working with PWAs. It also contains some important security aspects to consider!

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

## Dynamically Generating the manifest.json

We need to access the environment variables to determine which app icon to use. A way to do this in Next.js is by creating an API route. This API route can read an environment variable and return the appropriate JSON response for the manifest.

For the App Router, we can create an API route in the `app/api` directory with a folder containing a `route.ts` file. Let's create a `manifest/` directory with a `route.ts` file:

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

## Generating App Icons Based on the Environment

The last step is to generate the app icons based on the environment.

We assume that there is an `.env` file in the root of our project with the following environment variables, which are also available in the deployed environment:

```env
// .env

NEXT_PUBLIC_ENVIRONMENT=dev
// other envvars
```

We can read this variable inside the API route and generate the `manifest.json` with the correct icon based on the environment.

The icon-images, i.e `/images/pwa/512_dev`, are inside the `public` directory. By naming the files with the environment, we can easily differentiate between them without writing a lot of code:

```ts
// app/api/manifest/route.ts

export async function GET() {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT;
  const iconSrc512 = `/images/pwa/512_${environment}.png`;
  const iconSrc192 = `/images/pwa/192_${environment}.png`;

  const manifest = {
    name: 'My App',
    short_name: `${environment} My App`,
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

Notice I am also generating the `short_name` based on the environment.

Tailor the generation of the `manifest.json` to your app's needs. For example, in my actual project, I have a helper function to get a environment label based on the environment:

```ts
import { env } from '@/../env.mjs';

export type EnvironmentLabel = 'DEV' | 'INTERNAL TEST' | 'IT' | 'TEST' | '';

export function getEnvironmentLabel(type: 'short' | 'full' = 'full'): EnvironmentLabel {
  const environment = env.NEXT_PUBLIC_ENVIRONMENT;

  let environmentLabel: EnvironmentLabel = '';
  if (environment === 'dev') {
    environmentLabel = 'DEV';
  } else if (environment === 'test') {
    environmentLabel = type === 'short' ? 'IT' : 'INTERNAL TEST';
  } else if (environment === 'staging') {
    environmentLabel = 'TEST';
  }

  return environmentLabel;
}
```

## Result

Now, when you access the app, the app icons will be generated based on the environment. Here is an example of how the app icons could look like for the different environments:

![Multiple apps example](@assets/pwa-icons.jpg)

## Conclusion

In this blog post, I showed you how to dynamically generate PWA app icons in the Next.js App Router using NextPWA. This approach allows you to differentiate between different environments by changing the app icon, making it easier for both you and users to identify which environment they are in.

Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
