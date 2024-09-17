---
author: Aurora Scharff
pubDatetime: 2024-17-09T09:30:00Z
title: Implementing Feature Flagging with the Next.js App Router
slug: implementing-feature-flagging-with-nextjs-app-router
featured: false
draft: false
tags:
  - React Server Components
  - Next.js
  - Feature flagging
  - Providers
  - App Router
description: In this blog post, I will show you how to implement a simple version of feature flagging with the Next.js App Router. 
---

When working with the Next.js App Router in a real project, you might want to implement feature flagging. Feature flagging is a technique that allows you to enable or disable features in your application without deploying new code. This can be useful for testing new features, rolling out features gradually, or fixing bugs.

Vercel recently released their own [feature flagging solution called](https://vercel.com/blog/toolbar-feature-flags). However, you might want to implement your own feature flagging solution for various reasons. In my case, I am not using Vercel for deployment, and I just want a simple feature flagging solution through my App Service on Azure.

In this blog post, I will show you how to implement a simple version of feature flagging with the Next.js App Router. I am no expert in feature flagging, so I would love to hear your feedback on this approach. It works well for my use case, but I am sure there are better ways to do it.

## Table of contents

## Setting environment variables

We want to turn specific features on or off using the environment variables. Let's pretend we have three experimental features, TEMPLATE, MESSAGES, and FORWARDING. We want to be able to turn these features on or off using environment variables.

 We can do this by creating a `.env` file in the root of our project. Here is an example of how you can set up your environment variables:

```env
NEXT_PUBLIC_API_URL=https://api.example.com
FEATURE_TEMPLATES=1
FEATURE_MESSAGES=1
FEATURE_FORWARDING=0
```

These environment variables will be available in your Next.js application through `process.env`. They can be set in your App Service or other deployment environments.

## Creating a server schema with Zod and exporting the environment variables

We will create a server schema using [Zod](https://www.npmjs.com/package/zod) to validate the environment variables. This is optional but can be useful to ensure that the environment variables are set correctly. In this case it doesn't really matter because we are using the environment variables as booleans, but it can be useful if you want to validate the values.

```ts
export const serverSchema = Yup.object({
  FEATURE_TEMPLATES: Yup.string(),
  FEATURE_MESSAGES: Yup.string(),
  FEATURE_FORWARDING: Yup.string(),
});
export type ServerSchemaType = Yup.InferType<typeof serverSchema>;
```

We will also create a `env.mjs` file to validate the environment variables:

```js
import { serverSchema } from '@/validations/envSchema';

export const serverEnv = serverSchema.validateSync({
  FEATURE_TEMPLATES: process.env.FEATURE_TEMPLATES,
  FEATURE_MESSAGES: process.env.FEATURE_MESSAGES,
  FEATURE_FORWARDING: process.env.FEATURE_FORWARDING,
});
```

Now we can use our `serverEnv` object to access the environment variables in our application.

### Toggling features in Server Components

We can now use the environment variables to toggle features in our server components. Let's create a function to simplify this:

```ts
import type { ServerSchemaType } from '@/validations/envSchema.js';
import { serverEnv } from '../../env.mjs';

export async function getFeature(feature: keyof ServerSchemaType): Promise<boolean> {
  return serverEnv[feature] === '1';
}
```

It can easily be used in our server components.
We can either control the feature in the component/feature itself or hide/show components in different layouts:

```tsx
export default async function Messages() {
  const isEnabled = await getFeature('FEATURE_MESSAGES');

  return isEnabled ? (
    <div>
      <h1>Messages</h1>
    </div>
  ) : null;
```


```tsx
export default async function Page() {
  const messagesIsEnabled = await getFeature('FEATURE_MESSAGES');

  return (
    <div>
      {messagesIsEnabled && <Messages />}
    </div>
  );
```

We can now turn on or off a feature in our App Service or relevant deployment environment by changing the environment variables. On page refresh, the feature will be toggled on or off.

### Toggling features in Client Components

Since we are on the client, we can't access the environment variables directly. But, we still want the same flexibility of live turning on/off features. The initial solution here could be to pass down the feature flags as props to the client components. However, this is not ideal because we might have to pass down the feature flags through multiple the components in the component tree.

Instead, lets create a feature provider that will provide the feature flags to the client components:

```tsx
'use client';

import React, { createContext } from 'react';
import type { ServerSchemaType } from '@/validations/envSchema';

type FeatureContextType = {
  features: ServerSchemaType;
};

const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

export default function FeatureProvider({
  features,
  children,
}: {
  features: ServerSchemaType;
  children: React.ReactNode;
}) {
  return (
    <FeatureContext.Provider
      value={{
        features,
      }}
    >
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeature(feature: keyof ServerSchemaType) {
  const context = React.useContext(FeatureContext);
  if (context === undefined) {
    throw new Error('useFeature must be used within a FeatureProvider');
  }
  return context.features[feature] === '1';
}
```

We can use this in our root layout and pass down the feature flags from the server:

```tsx
...
import { serverEnv } from '../../env.mjs';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
      <FeatureProvider serverEnv={serverEnv}>
        {children}
      </FeatureProvider>
  );
}
```

Now we can use the `useFeature` hook in our client components, and it follows the same pattern as the `getFeature` function in the server components:

```tsx
'use client';
...

export default function Messages() {
  const isEnabled = useFeature('FEATURE_MESSAGES');
```

### Example: Controlling available sidebar routes with feature flags

Let's say we have a sidebar with features we want to toggle on or off. We can mark a item as a feature:

```tsx
type Props = {
  ...
  feature?: keyof ServerSchemaType;
};

export default function SidebarItem({ feature }: Props) {
  const isEnabled = useFeature(feature);

  return isEnabled ? (
    <li>
      <Link>
      ...
      </Link>
    </li>
  ) : null;
}
```

But, we always want to show items that don't have a feature flag. We can add a default feature flag to the `serverSchema`:

```tsx
export const serverSchema = Yup.object({
  FEATURE_DEFAULT: Yup.string().default('1'),
  FEATURE_MALER: Yup.string(),
  FEATURE_MELDINGER: Yup.string(),
  FEATURE_VIDERESENDING: Yup.string(),
});
```

Now we can use the `FEATURE_DEFAULT` flag as a default value in the `SidebarItem` component:

```tsx
export default function SidebarItem({ feature = 'FEATURE_DEFAULT' }: Props) {
  const isEnabled = useFeature(feature);

  return isEnabled ? (
    <li>
      <Link>
      ...
      </Link>
    </li>
  ) : null;
}
```

And our sidebar will always show items that don't have a feature flag.

### Conclusion

In this blog post, I showed you how to implement simple feature flagging with the Next.js App Router. We used environment variables to toggle features in both server and client components.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
