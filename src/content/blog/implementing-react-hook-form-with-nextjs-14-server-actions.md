---
author: Aurora Walberg
pubDatetime: 2023-12-30T15:22:00Z
title: Implementing React Hook Form with Next.js 14 and Server Actions
postSlug: implementing-react-hook-form-with-nextjs-14-server-actions
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - React Hook Form
  - Server Actions
description:
  React Hook Form is a popular library for building interactive forms in React. In this blog post, I'll explain how to use React Hook Form with Next.js 14 and Server Actions.
---

React Hook Form is a popular library for building forms in React. In this blog post, I'll explain how to use React Hook Form with Next.js 14 and Server Actions.

There seems to be a misconception that we do not need React Hook Form now that we have the new React hooks such as `useFormStatus()` and `useFormState()`. However, React Hook Form still provides a lot of features that are not supported here, such as change or blur-triggered client-side validation. Note that useFormStatus has its own benefits such as being able to work without JavaScript (progressive enhancement).

We are going to be using Zod for validation and Prisma for our database. We will also be using Toast for displaying error messages. Then we will use the new React hook `useOptimistic()` to add optimistic UI in the end.

I do not have a separate repository for this blog post, but you can find working code [here](https://github.com/aurorawalberg/next14-remix-jokes-rebuild/blob/main/src/app/demo/forms/_components/ReactHookForm.tsx).

## Table of contents

## Pre-requisites

This method applies to an existing Next.js 13 or 14 app that uses the App Router. If you don't have an existing app, you can create a starter app using the following command:

```bash
npx create-next-app@latest
```

I will be skipping the setup of Prisma and Toast as they are not relevant to this blog post. Refer to my Github repository for the full code or use the Prisma and Toast documentation to set them up.

### Setting up React Hook Form and Zod

Simply install React Hook Form and Zod using the following command:

```bash
npm install react-hook-form zod
```

And install the Zod resolver for React Hook Form:

```bash
npm install @hookform/resolvers
```

## Making a React Hook Form

React Hook Form is client-side only, so our starting point will be a `"use client"` component.

```tsx
'use client';

export default function ReactHookForm() {
  return (
    <div>ReactHookForm</div>
  )
}
```

Lets start by making a React Hook Form. We will be using the `useForm()` hook to create a form. The `onChange` mode will be used to validate the form as the user types. We will need the methods `handleSubmit()`, `register()`, `reset()`, and `formState` from  React Hook Form.

```tsx
  const {
    handleSubmit,
    register,
    reset,
    formState: { isSubmitting, isValid },
  } = useForm({
    mode: 'onChange',
  });
```

Then let's add the form labels and inputs. Our form will allow us to submit a joke to a database. We will be using the `register()` method to register the inputs. We will also be using the `isSubmitting` and `isValid` variables to disable the submit button when the form is submitting or invalid.

```tsx
  return (
    <form onSubmit={onSubmit}>
      <div>
        <label htmlFor="name">Name:</label>
        <input {...register('name')} id="name" name="name" type="text" />
      </div>
      <div>
        <label htmlFor="content">Content:</label>
        <textarea {...register('content')} id="content" name="content" />
      </div>
      <button className="self-end" disabled={isSubmitting || !isValid} type="submit">
        {isSubmitting ? 'Adding...' : 'Add'}
      </button>
    </form>
  );
```

Let's add our `onSubmit` function. We will fill this out later. For now we can just log the form data to the console and reset the form.

```tsx
  const onSubmit = handleSubmit(async data => {
    console.log('data', data);
    reset();
  });
```

The full code for our initial React Hook Form looks like this:

```tsx
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';

export default function ReactHookForm() {
  const {
    handleSubmit,
    register,
    reset,
    formState: { isSubmitting, isValid },
  } = useForm({
    mode: 'onChange',
  });

  const onSubmit = handleSubmit(async data => {
    console.log('data', data);
    reset();
  });

  return (
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="name">Name:</label>
          <input {...register('name')} id="name" name="name" type="text" />
        </div>
        <div>
          <label htmlFor="content">Content:</label>
          <textarea {...register('content')} id="content" name="content" />
        </div>
        <button className="self-end" disabled={isSubmitting || !isValid} type="submit">
          {isSubmitting ? 'Adding...' : 'Add'}
        </button>
      </form>
  );
}
```

## Adding client-side validation

To give the form interactive validation and utilize the `onChange` mode, let's add client-side validation with Zod. Import the Zod resolver and add it to the `useForm()` hook. In addition, we will need the `errors` from the React Hook Form state.

```tsx

import { zodResolver } from '@hookform/resolvers/zod';
...

export default function ReactHookForm() {
  const {
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<JokeSchemaType>({
    mode: 'onChange',
    resolver: zodResolver(JokeSchema),
  });
```

The `JokeSchemaType` and `JokeSchema` are defined as follows:

```tsx
export const JokeSchema = z.object({
  content: z.string().min(5, {
    message: 'Content must be at least 5 characters long',
  }),
  id: z.string().optional(),
  name: z.string().min(2, {
    message: 'Name must be at least 2 characters long',
  }),
});

export type JokeSchemaType = z.infer<typeof JokeSchema>;
```

Next, we can display the validation errors. They will appear after the field has been started, but not valid, and removed once the field is valid.

```tsx
  return (
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="name">Name:</label>
          <input {...register('name')} id="name" name="name" type="text" />
          {errors?.name && <p className="text-red">{errors?.name?.message}</p>}
        </div>
        <div>
          <label htmlFor="content">Content:</label>
          <textarea {...register('content')} id="content" name="content" />
          {errors?.content && <p className="text-red">{errors?.content?.message}</p>}
        </div>
        ...
      </form>
  );
```

## Submitting with Server Actions

Let's now implement the `onSubmit` function. We will be using Server Actions to submit the form data to the server. We can call it async and await the response. If there is an error, we can display it using Toast. If there is no error, we can display a success message and reset the form.

```tsx
  const onSubmit = handleSubmit(async data => {
    const response = await createJoke(data);
    if (response?.error) {
      toast.error(response.error);
    } else {
      toast.success('Joke added!');
      reset();
    }
  });
```

The `createJoke()` function is defined as follows:

```tsx
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/db';
import { type JokeSchemaType } from '@/src/validations/jokeSchema';

export async function createJoke(data: JokeSchemaType) {
  await prisma.joke.create({
    data,
  });
  revalidatePath('/');
}
```

It doesn't do much yet. It simply creates a joke in the database and revalidates the page. However this is now enough to make our form work!

Note the `"use server` directive at the top of the file. This is what makes it a Server Action, allowing us to call it from the client. It's like a hidden API endpoint. Note also the `revalidatePath()` function. This is a new function in Next.js App Router that allows us to revalidate a page by path or tag. It will update all parts of the page that have changed after the Server Action has been called.

## Adding server-side validation

We can also use Zod to server-side validate the data. This is important because we don't want to trust the client. Let's also handle the case of our Prisma query failing.

```tsx
'use server';
...

export async function createJoke(data: JokeSchemaType) {
  const result = JokeSchema.safeParse(data);

  if (!result.success) {
    const errorMessages = result.error.issues.reduce((prev, issue) => {
      return (prev += issue.message);
    }, '');
    return {
      error: errorMessages,
    };
  }

  try {
    await prisma.joke.create({
      data,
    });
  } catch (error) {
    return {
      error: 'SERVER ERROR',
    };
  }
  revalidatePath('/');
}
```

And that's it. A fully functional form with client-side and server-side validation!

## Adding optimistic UI

We can also add optimistic UI to our form. This will make the form feel more responsive and interactive. We will be using the new `useOptimistic()` hook to do this.

```tsx
export default function ReactHookForm({ jokes }: { jokes: Joke[] }) {
  const [optimisticJokes, addOptimisticJoke] = useOptimistic(
    jokes,
    (state: JokeSchemaType[], newJoke: JokeSchemaType) => {
      return [...state, newJoke];
    },
  );
  ...
```

We pass the initial data and a function to update data optimistically. We can use the `optimisticJokes` return value somewhere else to display the data.

Then we add the `addOptimisticJoke()` inside our `onSubmit()` function. In addition, we must use a transition around the state update.

```tsx
  const [, startTransition] = useTransition();

  const onSubmit = handleSubmit(async data => {
    startTransition(async () => {
      addOptimisticJoke(data);
      const response = await createJoke(data);
      if (response?.error) {
        toast.error(response.error);
      } else {
        toast.success('Joke added!');
        reset();
      }
    });
  });
```

Lastly, we update our createJoke function to revalidate on errors. This will remove the optimistic data if there is an error.

```tsx
'use server';
...

export async function createJoke(data: JokeSchemaType) {
  const result = JokeSchema.safeParse(data);

  if (!result.success) {
    const errorMessages = result.error.issues.reduce((prev, issue) => {
      return (prev += issue.message);
    }, '');
    revalidatePath('/');
    return {
      error: errorMessages,
    };
  }

  try {
    await prisma.joke.create({
      data,
    });
  } catch (error) {
    revalidatePath('/');
    return {
      error: 'SERVER ERROR',
    };
  }
  revalidatePath('/');
}
```

The final code for our React Hook Form could look something like this:

```tsx
'use client';

...
import React, { useOptimistic } from 'react';

export default function ReactHookForm({ jokes }: { jokes: Joke[] }) {
  const [optimisticJokes, addOptimisticJoke] = useOptimistic(
    jokes,
    (state: JokeSchemaType[], newJoke: JokeSchemaType) => {
      return [...state, newJoke];
    },
  );
  const [, startTransition] = useTransition();

  const {
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<JokeSchemaType>({
    mode: 'onChange',
    resolver: zodResolver(JokeSchema),
  });

  const onSubmit = handleSubmit(async data => {
    startTransition(async () => {
      addOptimisticJoke(data);
      const response = await createJoke(data);
      if (response?.error) {
        toast.error(response.error);
      } else {
        toast.success('Joke added!');
        reset();
      }
    });
  });

  return (
    <>
      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="name">Name:</label>
          <input {...register('name')} id="name" name="name" type="text" />
          {errors?.name && <p className="text-red">{errors?.name?.message}</p>}
        </div>
        <div>
          <label htmlFor="content">Content:</label>
          <textarea {...register('content')} id="content" name="content" />
          {errors?.content && <p className="text-red">{errors?.content?.message}</p>}
        </div>
        <button className="self-end" disabled={isSubmitting || !isValid} type="submit">
          {isSubmitting ? 'Adding...' : 'Add'}
        </button>
      </form>
      <JokesList jokes={optimisticJokes} />
    </>
  );
}
```

Of course, add your own styling and make it look nice.

A working example of this code can as mentioned be found [here](https://github.com/aurorawalberg/next14-remix-jokes-rebuild/blob/main/src/app/demo/forms/_components/ReactHookForm.tsx).

## Conclusion

In this blog post, I walked you through how to use React Hook Form with Server Actions to make an interactive and user-friendly form. I hope you found this blog post helpful!
