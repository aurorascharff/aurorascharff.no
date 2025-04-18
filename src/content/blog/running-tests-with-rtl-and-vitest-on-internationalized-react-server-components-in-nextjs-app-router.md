---
author: Aurora Scharff
pubDatetime: 2023-09-10T15:22:00Z
title: Running Tests with RTL and Vitest on Async and Internationalized React Server Components in Next.js App Router
slug: running-tests-with-rtl-and-vitest-on-internationalized-react-server-components-in-nextjs-app-router
featured: false
draft: false
tags:
  - React Server Components
  - Next.js
  - Testing
  - App Router
  - i18n
description: Considering the relatively new React Server Components (RSC) and Next.js App Router, there is not a lot of documentation on how to test them. In this blog post, I'll explain a method I found to work for running tests with Vitest and RTL (React Testing Library) on React Server Components that utilizes internationalization (i18n) via the next-international package.
---

Testing is a crucial part of any software development process, ensuring that your code functions as expected and maintains its integrity as your application evolves. Considering the relatively new React Server Components (RSC) and Next.js App Router, there is not a lot of documentation on how to test them. In this blog post, I'll explain a method I found to work for running tests with Vitest and RTL (React Testing Library) on React Server Components that utilizes internationalization (i18n) via the next-international package.

Please note that this method is not officially supported by Next.js or next-international, and may not work for all use cases. I am also not an expert on testing, so if you have any suggestions for improvements, please let me know!

## Table of contents

## Prerequisites

This method applies to an existing Next.js app that uses the App Router and next-international for i18n. If you don't have an existing app, you can create a starter app using the following command:

```bash
npx create-next-app@latest
```

### Setting up next-international

To set up next-international, follow the steps in the [next-international documentation](https://www.npmjs.com/package/next-international). After doing it correctly, you will have:

- A `/src/locales` folder, containing [locale].ts files for each locale you want to support, as well as a `client.ts` and `server.ts` exporting i18n functions.
- Locale based routing using a `/src/app/[locale]/` dynamic route.
- A `/src/middleware.js` file containing middleware for setting the locale based on the route and rewriting urls.
- A modified `next.config.js` file containing transpile packages for next-international.

### Setting up Vitest

Vitest is a testing framework for React Server Components. It is built on top of Jest and React Testing Library. To set up Vitest, follow the steps in for example [this blogpost](https://dev.to/azadshukor/setting-up-nextjs-13-with-vitest-51ol).

Make sure your vitest config file looks something like this:

```js
// vitest.config.js
import react from "@vitejs/plugin-react";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteTsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "src/setupTests.ts",
  },
});
```

Notice especially the `setupFiles` property, which points to a file that will be run before each test. Create this file inside the `/src` folder (or at the root if not using a `/src` folder) and add the following code:

```ts
// src/setupTests.ts
import "@testing-library/jest-dom";
```

Now we have set up Vitest with Jest and React Testing Library. We will configure this file further later.

## Testing React Server Components

Lets say we have an async React Server Component called `HelloWorld.tsx` that we want to test. _Note_: When a server component isn't async, we can test it normally. However, if we are fetching async data, the components has to be async. In this case there is no data, but there could have been. It looks something like this:

```tsx
// src/components/HelloWorld.tsx
export default async function HelloWorld() {
  return (
    <div>
      <h1 data-testid="hello-world">Hello World</h1>
    </div>
  );
}
```

Let's write a test for this component. We create a file called `HelloWorld.test.tsx`.

```tsx
// src/components/tests/HelloWorld.test.tsx
import { screen, render } from "@testing-library/react";
import HelloWorld from "../HelloWorld";

describe("HelloWorld", () => {
  it("renders ", async () => {
    render(<HelloWorld />);

    expect(screen.getByTestId("hello-world")).toHaveTextContent("Hello World");
  });
});
```

We run the test using the following command:

```bash
npm run test
```

The test fails with the following error:

```bash
Error: Objects are not valid as a React child (found: [object Promise]). If you meant to render a collection of children, use an array instead.
```

This is because the component is async, and we need to use `await` to get the component before we can render it. At the moment there is not a lot of documentation on testing React Server Components, but there is an ongoing discussion on the [RTL GitHub](https://github.com/testing-library/react-testing-library/issues/1209).

One workaround from there is by _caleb531_. We need to create a custom render function that uses `await` to get the component before rendering it. The code for the custom render function looks like this:

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, render } from '@testing-library/react';

// Return true if the supplied value is an async function; otherwise, return
// false
function isAsyncFunction(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object AsyncFunction]';
}

// Retrieve the nearest (i.e. outermost) client component in the component tree
// represented by the given JSX node
async function getNearestClientComponent(node: JSX.Element) {
  if (!isAsyncFunction(node.type)) {
    return node;
  }
  const nodeReturnValue = await node.type({ ...node.props });
  return getNearestClientComponent(nodeReturnValue);
}

// Follow <https://github.com/testing-library/react-testing-library/issues/1209>
// for the latest updates on React Testing Library support for React Server
// Components (RSC)
export async function renderAsync(node: JSX.Element) {
  await act(async () => {
    render(await getNearestClientComponent(node));
  });
}
```

Using it results in the following modified test:

```tsx
// src/components/tests/HelloWorld.test.tsx
...
import { renderAsync } from '@/test-utils/renderAsync';

describe('HelloWorld', () => {
  it('renders ', async () => {
    await renderAsync(<HelloWorld />);

    expect(screen.getByTestId('hello-world')).toHaveTextContent('Hello World');
  });
});
```

Now the test passes! We can also use the `renderAsync` function to test other async React Server Components.

### Note on testing nested async React Server Components

If you are testing an async server component that contains other async server components, the same error as previously encountered will occur. My fix for this so far is to mock the nested components. For example, if we have a `HelloWorldContainer.tsx` component that contains the `HelloWorld.tsx` component, we can mock the `HelloWorld.tsx` component in the test for `HelloWorldContainer.tsx` and test it separately. The test for `HelloWorldContainer.tsx` would contain some kind of mock like this:

```tsx
vi.mock('./HelloWorld.tsx', () => {', () => {
  return {
    __esModule: true,
    default: () => {
      return <div />;
    },
  };
});
```

### Updated Method

Another, better solution is to follow the [recommended workaround](https://github.com/testing-library/react-testing-library/issues/1209#issuecomment-1569813305) By NickMcCurdy which includes using React Canary and testing with Suspense and async test-calls.

If the method is failing, make sure you are using the correct React version in your tests. You can check it by throwing a `console.log(React.version)` into a test. If it is not using React 19, run `npm install react@rc react-dom@rc` again (even though you already have React RC in your dependencies).

If using this method your test calls will look like this:

```tsx
// src/components/tests/HelloWorld.test.tsx
...
import { render } from '@testing-library/react';

describe('HelloWorld', () => {
  it('renders ', async () => {
    render(
      <Suspense>
        <HelloWorld />
      </Suspense>
    );

    expect(await screen.findByTestId('hello-world')).toHaveTextContent('Hello World');
  });
});
```

Notice the `await` in the `expect` call. This is because the `findBy` queries are async and need to be awaited.

Note that you do not need to worry about nested async components with this method. You can of course also create your own custom render function that includes the `Suspense` component:

```tsx
import { render } from '@testing-library/react';
import { Suspense } from 'react';

export function suspenseRender(children: JSX.Element) {
  return render(<Suspense>{children}</Suspense>);
}
```

## Note on Testing React 19 Hooks

If you are using React 19 hooks such as `useFormStatus` and `useOptimistic` in your components, you may run into issues. For RTL to work correctly in Next.js, you need to make sure RTL is using React 19 RC. Follow the same steps as above to check the React version in your tests.

With it installed, all the new hooks can be tested as expected.

When suspending a component using the `use` API, using a Suspense and `await` with `findBy` can be used again to wait for the component to be resolved before running tests.

## Testing Internationalized React Server Components

Next-international provides methods for getting the current locale and setting the locale. It also provides `useI18n()` (for client components) and `getI18n()` (async method for server components) functions and hooks that can be used to translate text in your app.

Now let's say we have an internationalized React Server Component called `HelloWorld.tsx` that we want to test. It looks something like this:

```tsx
// src/components/HelloWorld.tsx
import { getI18n } from "@/locales/server";

export default async function HelloWorld() {
  const t = await getI18n();

  return (
    <div>
      <h1 data-testid="hello-world">{t("helloWorld")}</h1>
    </div>
  );
}
```

This component calls the async `getI18n()` function from next-international to get the current locale and use it to translate the text. The `getI18n()` function is async, so we need to use `await` to get the locale before we can use it. That means we need an async component as well.

When running the test, we get the following error:

```bash
This module cannot be imported from a Client Component module. It should only be used from a Server Component.
```

Let's solve this problem by mocking the `getI18n()` function inside our test. We can use the `vi.mock()` function from Vitest to mock the `getI18n()` function. Then, lets return the translation directly from the mock. The test now looks like this:

```tsx
// src/components/tests/HelloWorld.test.tsx
...
import { vi } from 'vitest';
import en from '@/locales/en';

vi.mock('@/locales/server', async () => {
  return {
    getI18n: () => {
      return (str: string) => {
        return en[str as keyof typeof en];
      };
    },
  };
});

describe('HelloWorld', () => {
  it('renders ', async () => {
    suspenseRender(
      <HelloWorld />
    );

    expect(await screen.findByTestId('hello-world')).toHaveTextContent('Hello World');
  });
});

```

And it runs again! Let's mock all the next-international functions we need to use in our test. Move the vi.mock() logic to the `src/setupTests.ts` file, and add mocks for the rest of the exported functions, including the client side hooks:

```ts
beforeEach(() => {
  vi.mock("@/locales/server", async () => {
    return {
      getCurrentLocale: () => {
        return "en";
      },
      getI18n: () => {
        return (str: string) => {
          return en[str as keyof typeof en];
        };
      },
      getScopedI18n: () => {
        return (str: string) => {
          return en[str as keyof typeof en];
        };
      },
      getStaticParams: () => {
        return {};
      },
    };
  });

  vi.mock("@/locales/client", async () => {
    return {
      useChangeLocale: () => {
        return () => {
          return;
        };
      },
      useCurrentLocale: () => {
        return "en";
      },
      useI18n: () => {
        return (str: string) => {
          return en[str as keyof typeof en];
        };
      },
      useScopedI18n: () => {
        return (str: string) => {
          return en[str as keyof typeof en];
        };
      },
      useStaticParams: () => {
        return {};
      },
    };
  });
});

afterEach(() => {
  cleanup();
});
```

That's it! Now we can test our internationalized React Server Components. This method ensures you can control the locale you are testing with, and that the locale is set before the component is rendered. Of course this also allows us to test client component using the mocks.

## Conclusion

In this blog post, I walked you through what I have learned about running tests with Vitest and RTL on internationalized React Server Components in Next.js App Router.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
