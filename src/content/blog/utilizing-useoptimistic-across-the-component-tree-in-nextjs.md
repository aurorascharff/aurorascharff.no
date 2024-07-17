---
author: Aurora Scharff
pubDatetime: 2024-02-24T15:22:00Z
title: Utilizing useOptimistic() across the component tree in Next.js
slug: utilizing-useoptimistic-across-the-component-tree-in-nextjs
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

I've been struggling with the practicality of the hook when working across the component tree, especially when working across layouts and pages since you can't pass props. I found a solution now - a provider using React Context. I do not know if this is the best solution, but it solves the problem I have been wanting to solve. Feedback appreciated!

Please note that the code here has been simplified for the sake of getting the point across.

## Table of contents

## The Use Case

Let's say we have a simple server component with a list of jokes.

```tsx
// components/JokesList.tsx
export default async function JokesList() {
  const jokes = await prisma.joke.findMany();

  return (
    <ul>
      {jokes.map(({ id, name }) => {
        return <li key={id}>{name}</li>;
      })}
    </ul>
  );
}
```

We also have a form to add new jokes:

```tsx
// components/Form.tsx

return (
  <form action={createJoke}>
    <label>
      Name:
      <input name="name" type="text" />
    </label>
    <label>
      Content:
      <textarea name="content" />
    </label>
    <button type="submit">Add joke</button>
  </form>
);
```

It calls the server action `createJoke` to add a new joke to the database and revalidates the root route to update the list of jokes.

```tsx
"use server";

export async function createJoke(formData: FormData) {
  const joke = await prisma.joke.create({
    data: {
      content: formData.get('content') as string,
      name: formData.get('name') as string,
    },
  });

  revalidatePath('/jokes');
}
```

We want to be able to update the jokes with the `useOptimistic()` hook, and have it "roll-back" if there's an error (similarly to other optimistic UI libraries like React Query). See additional notes at the end of the blog post for more on the value of the useOptimistic hook.

We are tied to the `useOptimistic` hook's structure:

```tsx
const [optimisticJokes, addOptimisticJoke] = useOptimistic(
  jokes,
  (state: OptimisticJoke[], newJoke: OptimisticJoke) => {
    return [...state, newJoke];
  },
);
```

However, our components are not in the same component tree. The list of jokes is in the layout, and the form is in a page a couple routes down. This means we can't pass props between them.

```tsx
'app/new/page.tsx' contains <Form/>
'app/layout.tsx' contains <JokesList/>
```

And even if our components were somewhere inside a `page.tsx` and we could pass props, we don't want to add multiple `"use client"` directives to components that don't need it just to pass the `useOptimistic` hook around.

How do we solve this?

## The Solution

Let's create a provider to wrap the components that need to use the useOptimistic hook.

The provider will take in server-fetched data and pass it to the useOptimistic hook, as the state to show when no action is pending. It will return the optimistic jokes as well as the function to optimistically add a new joke.

```tsx
"use client";

type JokesContextType = {
  optimisticJokes: OptimisticJoke[];
  addOptimisticJoke: (_joke: OptimisticJoke) => void;
};

export const JokesContext = createContext<JokesContextType | undefined>(
  undefined
);

export default function JokesProvider({
  children,
  jokes,
}: {
  children: React.ReactNode;
  jokes: OptimisticJoke[];
}) {
  const [optimisticJokes, addOptimisticJoke] = useOptimistic(
    jokes,
    (state: OptimisticJoke[], newJoke: OptimisticJoke) => {
      return [...state, newJoke];
    }
  );

  return (
    <JokesContext.Provider value={{ optimisticJokes, addOptimisticJoke }}>
      {children}
    </JokesContext.Provider>
  );
}

export function useJokes() {
  const context = React.useContext(JokesContext);
  if (context === undefined) {
    throw new Error(
      "useJokes must be used within a JokesProvider"
    );
  }
  return context;
}
```

Now we can wrap our components in the provider, and pass the server data "truth" to it.

```tsx
// app/layout.tsx
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jokes = await prisma.joke.findMany();

  return (
    <JokesContextProvider jokes={jokes}>
      <JokesList />
      {children}
    </JokesContextProvider>
  );
}
```

The `{children}` prop is the page component, which contains the form.

Next, we can use the `useJokes` hook to access `addOptimisticJoke` in the form component, and use it inside a `createJokeAction` function.

To do this the `Form.tsx` needs to become a client component.

Using the action property, the function is automatically wrapped in `startTransition` (which you should do with `useOptimistic`). If we had been using the onSubmit property, we would have had to add `e.preventDefault()` and call a `startTransition` ourselves.

```tsx
// components/Form.tsx
"use client";

const formRef = useRef();
const { addOptimisticJoke } = useJokesContext();

const createJokeAction = (formData: FormData) => {
  addOptimisticJoke(data);
  formRef.current.reset();
  await createJoke(formData);
};

return (
  <form ref={formRef} action={createJokeAction}>
```

Finally, we can access the `optimisticJokes` in the `JokesList` component. It also needs to be a client component.

```tsx
// components/JokesList.tsx
"use client";

export default function JokesList() {
  const { optimisticJokes } = useJokes();

  return (
    <ul>
      {optimisticJokes.map(({ id, name }) => {
        return <li key={id}>{name}</li>;
      })}
    </ul>
  );
}
```

And that's it! When we add a new joke, it will be added to the list optimistically.

An example where a provider is being used with the useOptimistic hook across the component tree in Next.js can be found [here](https://github.com/aurorascharff/next14-message-box/tree/optimistic-retry)

## Additional notes

Some additional notes on the value of the useOptimistic hook as stated by a [reddit user](https://www.reddit.com/r/nextjs/comments/1azxoon/comment/l9ew8uz/?context=3) (thanks!):

"The value of optimistic state is automatically updated on every new version of the "initial" state passed from the server component after revalidation. Compared to other eager update approaches that rely on e.g. react-query, zustand or simple component state, you would manually need to keep those in sync, probably by returning the updated state from the server action and manually updating the current version on the client. Aside from that, you would also need to manually revert updates in case the server action errors out. This two is taken care of automatically in case of a useOptimistic hook."

## Conclusion

In this blog post, I've shown you how to use useOptimistic across the component tree in Next.js. By passing server-fetched data to a provider and using the `useOptimistic()` hook inside it, we can use it across layouts and pages, we don't have to pass any props, and the simplicity of useOptimistic "merging" the client and server state is retained.

I hope this post has been helpful in understanding the useOptimistic hook and it's limiations. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
