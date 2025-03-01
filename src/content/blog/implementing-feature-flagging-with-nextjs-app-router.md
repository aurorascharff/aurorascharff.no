---
author: Aurora Scharff
pubDatetime: 2024-09-17T09:30:00Z
title: Implementing Feature Flagging with the Next.js App Router
slug: implementing-feature-flagging-with-nextjs-app-router
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - Feature flagging
  - Providers
  - App Router
description: Feature flagging is a technique that allows you to enable or disable features in your application without deploying new code. In this blog post, I will show you how to implement a simple version of feature flagging with the Next.js App Router. 
---

When working with the Next.js App Router in a real project, you might want to implement feature flagging. Feature flagging is a technique that allows you to enable or disable features in your application without deploying new code. This can be useful for testing new features, rolling out features gradually, or fixing bugs.

Vercel recently released their own [feature flagging solution](https://vercel.com/blog/toolbar-feature-flags). However, you might want to implement your own feature flagging solution for various reasons. In my case, I am not using Vercel for deployment, and I just want a basic feature flagging solution through my App Service on Azure. It also works with ie. Docker deployment though Azure AKS or equivalent service.

In this blog post, I will show you how to implement a simple version of feature flagging with the Next.js App Router. I am no expert in feature flagging, so I would love to hear your feedback on this approach. It works well for my use case, but I am sure there are better ways to do it.

## Table of contents

## Setting Environment Variables

We want to turn specific features on or off using the environment variables. Let's pretend we have three experimental features, TEMPLATE, MESSAGES, and FORWARDING. We want to be able to turn these features on or off using environment variables.

 We can do this by creating a `.env` file in the root of our project. Here is an example of how you can set up your environment variables:

```env
...
FEATURE_TEMPLATES=1
FEATURE_MESSAGES=1
FEATURE_FORWARDING=0
```

These environment variables will be available in your Next.js application through `process.env`. They can be set in your App Service or other deployment environments. Any feature that does not have an environment variable set to "1" will be turned off by default.

## Creating a Feature Schema with Yup and Exporting the Environment Variables

We will create a feature schema using [Yup](https://www.npmjs.com/package/yup) to validate the environment variables. You could also use Zod with its equivalent methods. This will make sure we don't expose any other environment variables than the ones we want to use for feature flagging.

```ts
export const featureSchema = Yup.object({
  FEATURE_TEMPLATES: Yup.string(),
  FEATURE_MESSAGES: Yup.string(),
  FEATURE_FORWARDING: Yup.string(),
});
export type FeatureSchemaType = Yup.InferType<typeof featureSchema>;
```

Then we will create a `env.mjs` file to validate the environment variables:

```js
import { featureSchema } from '@/validations/envSchema';

export const featureEnv = featureSchema.validateSync({
  FEATURE_TEMPLATES: process.env.FEATURE_TEMPLATES,
  FEATURE_MESSAGES: process.env.FEATURE_MESSAGES,
  FEATURE_FORWARDING: process.env.FEATURE_FORWARDING,
});
```

Now we can use our `featureEnv` object to access the environment variables in our application.

## Toggling Features in Server Components

We can now use the environment variables to toggle features in our server components. Let's create a function to simplify this:

```ts
import type { FeatureSchemaType } from '@/validations/envSchema.js';
import { featureEnv } from '../../env.mjs';

export async function getFeature(feature: keyof FeatureSchemaType): Promise<boolean> {
  return featureEnv[feature] === '1';
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

## Toggling Features in Client Components

Since we are on the client, we can't access the environment variables directly. But, we still want the same flexibility of live turning on/off features. The initial solution here could be to pass down the feature flags as props to the client components. However, this is not ideal because we might have to pass down the feature flags through multiple the components in the component tree.

Instead, lets create a feature provider that will provide the feature flags to the client components:

```tsx
'use client';

import React, { createContext } from 'react';
import type { FeatureSchemaType } from '@/validations/envSchema';

type FeatureContextType = {
  features: FeatureSchemaType;
};

const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

export default function FeatureProvider({
  features,
  children,
}: {
  features: FeatureSchemaType;
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

export function useFeature(feature: keyof FeatureSchemaType) {
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
import { featureEnv } from '../../env.mjs';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
      <FeatureProvider featureEnv={featureEnv}>
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

## Example: Controlling Available Sidebar Routes with Feature Flags

Let's say we have a sidebar with features we want to toggle on or off. We can assign the name of the feature per sidebar item:

```tsx
export type RouteObject = {
  name: string;
  path: string;
  icon?: React.ReactNode;
  isAuthenticated?: boolean;
  feature?: keyof FeatureSchemaType;
};

...

{ icon: <HelpIcon  />, name: 'help', path: routes.help() },
{
  feature: 'FEATURE_TEMPLATES',
  icon: <DocIcon  />,
  isAuthenticated: true,
  name: 'templates',
  path: routes.templates(),
},
...
```

And our sidebar looks something like this:

```tsx
<ul>
  {visibleRoutes.map(item => {
    if (item.isAuthenticated && !isAuthenticated) {
      return null;
    }
    return (
      <SidebarItem
        feature={item.feature}
        key={item.path}
        name={item.name}
        icon={item.icon}
        path={item.path}
      />
    );
  })}
</ul>
```

Then, we can check if the feature is enabled in the `SidebarItem` component:

```tsx
type Props = {
  ...
  feature?: keyof FeatureSchemaType;
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

And this works well. However, we always want to show items that don't have a feature flag. We can add a default feature flag to the `featureSchema`:

```tsx
export const featureSchema = Yup.object({
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

## Conclusion

In this blog post, I showed you how to implement simple feature flagging with the Next.js App Router. We used environment variables to toggle features in both server and client components.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
