---
author: Aurora Walberg Scharff
pubDatetime: 2024-02-24T15:22:00Z
title: Utilizing useOptimistic() across the component tree in Next.js
postSlug: utilizing-useoptimistic-across-the-component-tree-in-nextjs
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - useOptimistic
  - Server Actions
description: The React Canary (soon to be React 19) hook useOptimistic is a powerful tool for building fast and responsive UIs. It allows you to update the UI optimistically while waiting for the server to respond. In this blog post, I'll show you how to use useOptimistic across the component tree in Next.js.
---

The React Canary (soon to be React 19) hook `useOptimistic()` is a powerful tool for building fast and responsive UIs. It allows you to update the UI optimistically while waiting for the server to respond.

I've been struggling with the practicality of the hook when working across the component tree, especially when working across layouts and pages since you can't pass props. I found a solution now - a provider. I do not know if this is the best solution, but it solves the problem I have been wanting to solve. Feedback appreciated!

Please note that the code here has been simplified for the sake of getting the point across.

## Table of contents

## The Use-Case

Let's say we have a simple server component with a list of jokes.

```tsx
// components/JokesList.tsx
export default async function JokesList() {
  const jokes = await getJokes();

  return (
    <ul>
      {jokes.map(({ id, name }) => {
        return <li key={id}>{name}</li>;
      })}
    </ul>
  );
}
```

We also have a form to add new jokes (in my case a react-hook-form, hence the the `onSubmit()` property).

```tsx
// components/Form.tsx
const onSubmit = handleSubmit(data => {
  startTransition(async () => {
    const response = await createJoke(data);
    if (response?.error) {
      toast.error(response.error);
    } else {
      reset();
    }
  });
});

return (
  <form onSubmit={onSubmit}>
    <label>
      Name:
      <input {...register("name")} name="name" type="text" />
    </label>
    <label>
      Content:
      <textarea {...register("content")} name="content" />
    </label>
    <button type="submit">Add joke</button>
  </form>
);
```

It calls the server action `createJoke` to add a new joke to the database and revalidates the root route to update the list of jokes.

```tsx
"use server";

export async function createJoke(data: JokeSchemaType) {
  try {
    await prisma.joke.create({
      data,
    });
  } catch (error) {
    return {
      error: "SERVER ERROR",
    };
  }
  revalidatePath("/");
}
```

We want to be able to update the jokes with the `ùseOptimistic()` hook, and have it "roll-back" with `revalidatePath()` if there's an error.

We are tied to the `useOptimistic` hook's structure:

```tsx
  const [optimisticJokes, addOptimisticJoke] = useOptimistic(
    jokes,
    (state: JokeSchemaType[], newJoke: JokeSchemaType) => {
      return [...state, newJoke];
    },
  );
```

However, our components are not in the same component tree. The list of jokes is in the layout, and the form is in a page a couple routes down. This means we can't pass props between them.

```tsx
'app/new/page.tsx' contains <Form/>
'app/layout.tsx' contains <JokesList/>
```

And even if our components were somewhere inside a `page.tsx` and we could pass props, we don't want to add multiple `"use client"` directives to components that don't need it just to pass props around.

How do we solve this?

## The solution

Let's create a provider to wrap the components that need to use the useOptimistic hook.

The provider will take in server-fetched data and pass it to the useOptimistic hook. It will return the optimistic jokes as well as the function to optimistically add a new joke.

```tsx
"use client";

type JokesContextType = {
  optimisticJokes: JokeSchemaType[];
  addOptimisticJoke: (joke: Joke) => void;
};

export const JokesContext = createContext<JokesContextType | undefined>(
  undefined
);

export default function JokesContextProvider({
  children,
  jokes,
}: {
  children: React.ReactNode;
  jokes: JokeSchemaType[];
}) {
  const [optimisticJokes, addOptimisticJoke] = useOptimistic(
    jokes,
    (state: JokeSchemaType[], newJoke: JokeSchemaType) => {
      return [...state, newJoke];
    }
  );

  return (
    <JokesContext.Provider value={{ optimisticJokes, addOptimisticJoke }}>
      {children}
    </JokesContext.Provider>
  );
}

export function useJokesContext() {
  const context = React.useContext(JokesContext);
  if (context === undefined) {
    throw new Error(
      "useJokesContext must be used within a JokesContextProvider"
    );
  }
  return context;
}
```

Now we can wrap our components in the provider.

```tsx
// app/layout.tsx
export default async function Layout({children}: {
  children: React.ReactNode
}) {
  const jokes = await getJokes(); // Function to fetch jokes from the db

  return (
    <JokesContextProvider jokes={jokes}>
      <JokesList />
      {children}
    </JokesContextProvider>
  );
}
```

The `{children}` prop is the page component, which contains the form.

Next, we can use the `useJokesContext` hook to access `addOptimisticJoke` in the form component, and use it inside the `onSubmit` function.

```tsx
// components/Form.tsx
const { addOptimisticJoke } = useJokesContext();

const onSubmit = handleSubmit(data => {
  startTransition(async () => {
    addOptimisticJoke(data);
    const response = await createJoke(data);
    if (response.error) {
      toast.error(response.error);
    } else {
      reset();
    }
  });
});
```

Then we have to update the `createJoke` server action to revalidate on error so that the optimistic state is rolled back.

```tsx
"use server";

export async function createJoke(data: Joke) {
  try {
    await prisma.joke.create({
      data,
    });
  } catch (error) {
    revalidatePath("/");
    return {
      error: "SERVER ERROR",
    };
  }
  revalidatePath("/");
}
```

Finally, we can access the `optimisticJokes` in the list component. To do this we must turn it into a client component.

```tsx
// components/JokesList.tsx
"use client";

export default function JokesList() {
  const { optimisticJokes } = useJokesContext();

  return (
    <ul>
      {optimisticJokes.map(({ id, name }) => {
        return <li key={id}>{name}</li>;
      })}
    </ul>
  );
}
```

And that's it! We can now use useOptimistic across the component tree, and avoid any uneccessary prop drilling or `"use client"` directives.

## Conclusion

In this blog post, I've shown you how to use useOptimistic across the component tree in Next.js. By passing server-fetched data to a provider and using the `useOptimistic()` hook inside it, we don't have to pass any props, and the simplicity of useOptimistic "merging" the client and server state is retained.
