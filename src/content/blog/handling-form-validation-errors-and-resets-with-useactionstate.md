---
author: Aurora Scharff
pubDatetime: 2024-10-04T10:30:00Z
title: Handling Form Validation Errors and Resets with useActionState
slug: handling-form-validation-errors-and-resets-with-useactionstate
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - App Router
  - React 19
  - useActionState
  - Progressive Enhancement
  - Server Actions
  - Server Functions
description: With React 19 RC announced, the `useActionState` hook is a powerful tool for creating a state based on the result of an action, typically useful with form submissions. However, there are unclear usage patterns and some gotchas that can make it hard to work with. In this blog post, we'll create a validated form using the hook, and we'll see how we can handle form resets and errors with it.
---

The React 19 `useActionState` hook is a powerful tool for creating a state based on the result of an action, typically useful with form submissions. However, there are unclear usage patterns and some gotchas that can make it hard to work with. In this blog post, we'll create a validated form using the hook, and we'll see how we can handle form resets and errors with it.

The final result can be found [on GithHub](https://github.com/aurorascharff/next15-remix-contacts-rebuild-v2/blob/main/app/contacts/%5BcontactId%5D/edit/_components/ContactForm.tsx) and tried out [on Vercel](https://next15-remix-contacts-rebuild-v2.vercel.app/). Just give the app a minute if it initially throws an application error - the database is sleeping.

## Table of contents

## The starting point

We have a simple form that allows us to edit a contact. The form is a React component that receives a `contact` prop, which is the contact we want to edit. The form has fields for the contact's first name, last name, twitter, notes, and an avatar URL.

```tsx
export default function ContactForm({ contact }: { contact: Contact }) {
  return (
    <form className="flex max-w-[40rem] flex-col gap-4 @container">
      <div className="grip-rows-5 grid gap-2 @sm:grid-cols-[1fr_4fr] @sm:gap-4">
        <span className="flex">Name</span>
        <div className="flex gap-4">
          <Input
            defaultValue={contact?.first || undefined}
            aria-label="First name"
            name="first"
            type="text"
            placeholder="First"
          />
          <Input
            aria-label="Last name"
            defaultValue={contact?.last || undefined}
            name="last"
            placeholder="Last"
            type="text"
          />
        </div>
        <label htmlFor="avatar">Avatar URL</label>
        <Input
          defaultValue={contact?.avatar || undefined}
          name="avatar"
          placeholder="https://sessionize.com/image/example.jpg"
          type="text"
        />
        ...
```

## Submitting the form with an action

We want to submit the form to our database using an action with the upgraded React 19 `action` property. This property can now be bound to a function, ƒor example a Server Function. It will receive the form data as a `FormData` object.

Let's write the Server Function that will handle the form submission. We'll call it `updateContact`.

```ts
'use server';

...

export async function updateContact(contactId: string, formData: FormData) {
  const data = Object.fromEntries(formData);

  await prisma.contact.update({
    data,
    where: {
      id: contactId,
    },
  });

  revalidatePath(routes.home());
  redirect(routes.contactId({ contactId }));
}
```

The function will update the contact in the database, revalidate the home page, and redirect to the contact page.

We can now bind the action to the form.

```tsx
export default function ContactForm({ contact }: { contact: Contact }) {
  return (
    <form className="flex max-w-[40rem] flex-col gap-4 @container" action={updateContact}>
      <div className="grip-rows-5 grid gap-2 @sm:grid-cols-[1fr_4fr] @sm:gap-4">
        <span className="flex">Name</span>
        <div className="flex gap-4">
        ...
```

However, we have typescript errors, because the `updateContact` function requires a `contactId` argument. We can pass it as a hidden input in the form, or we can bind `updateContact` with initial arguments.

```tsx
export default function ContactForm({ contact }: { contact: Contact }) {
  const updateContactById = updateContact.bind(null, contact.id);
 
  return (
    <form className="flex max-w-[40rem] flex-col gap-4 @container" action={updateContactById}>
      <div className="grip-rows-5 grid gap-2 @sm:grid-cols-[1fr_4fr] @sm:gap-4">
        <span className="flex">Name</span>
        <div className="flex gap-4">    
        ...
```

And this should nicely update the contact in the database when the form is submitted and redirect to the contact page.

## Adding server-side validation

We want to add some validation to the form. The form here actually doesn't require any fields to be filled. However we want to validate the avatar URL because the image won't load if it's not a valid URL or if its not from a valid domain. We also want to validate that the twitter handle starts with an `@`.

Let's make a Zod schema for the form data. We're also gonna export the types for the schema and the error type - we need them later.

```ts
import { z } from 'zod';

export const contactSchema = z.object({
  avatar: z
    .string()
    .url()
    .startsWith('https://sessionize.com', 'Avatar URL must be from sessionize.com')
    .or(z.literal(''))
    .nullable(),
  first: z.string().nullable(),
  last: z.string().nullable(),
  notes: z.string().nullable(),
  twitter: z.string().startsWith('@', 'Twitter handle must start with @').or(z.literal('')).nullable(),
});

export type ContactSchemaType = z.infer<typeof contactSchema>;

export type ContactSchemaErrorType = z.inferFlattenedErrors<typeof contactSchema>;
```

Now we can use the schema to validate the form data in the `updateContact` function. If there are errors, we want to return them to from the Server Function.

```ts
'use server';

...

export async function updateContact(contactId: string, formData: FormData) {
  const data = Object.fromEntries(formData);
  const result = contactSchema.safeParse(data);

  if (!result.success) {
    return {
      errors: result.error.formErrors,
    };
  }

  await prisma.contact.update({
    where: {
      id: contactId,
    },
  });

  revalidatePath(routes.home());
  redirect(routes.contactId({ contactId }));
}
```

## Displaying the returned errors

Now we need to display the errors in the form. We can use the `useActionState` hook for that. The hook will create a state based on the result of the action.

We will pass the `updateContactById` function to the hook, and we will also pass an initial state with an empty `errors` object, utilizing the `ContactSchemaErrorType` type we created earlier.

And we need to make the component a client component, because we are using the `useActionState` hook. And we have to pass the returned, wrapped action `updateContactAction` to the form.

Then, we can use these errors to display them in the form. On form submission, the errors will be returned from the action and displayed in the form.

```tsx
"use client"


export default function ContactForm({ contact }: { contact: Contact }) {
  const updateContactById = updateContact.bind(null, contact.id);
  const [state, updateContactAction] = useActionState(updateContactById, {
    errors: {} as ContactSchemaErrorType,
  });

  return (
    <form className="flex max-w-[40rem] flex-col gap-4 @container" action={updateContactAction}>
      <div className="grip-rows-5 grid gap-2 @sm:grid-cols-[1fr_4fr] @sm:gap-4">
        <span className="flex">Name</span>
        <div className="flex gap-4">
          <Input
            errors={state.errors?.fieldErrors?.first}
            defaultValue={contact?.first || undefined}
            aria-label="First name"f
            name="first"
            type="text"
            placeholder="First"
          />
          <Input
            errors={state.errors?.fieldErrors?.last}
            aria-label="Last name"
            defaultValue={contact?.last || undefined}
            name="last"
            placeholder="Last"
            type="text"
          />
        </div>
        <label htmlFor="avatar">Avatar URL</label>
        <Input
          errors={state.errors?.fieldErrors?.avatar}
          defaultValue={contact?.avatar || undefined}
          name="avatar"
          placeholder="https://sessionize.com/image/example.jpg"
          type="text"
        />
        ...
```

We are getting more typescript errors. That's because the action that `useActionState` is wrapping is passed an additional parameter, the previous state. This is useful when we want to access the previous state of the action. However, we don't need it in this case.

So we define this additional parameter in the `updateContact` function as `_prevState`.  

We will also define a `State` type for pervious state.

```ts
type State = {
  errors?: ContactSchemaErrorType;
};

export async function updateContact(contactId: string, _prevState: State, formData: FormData) {
  const data = Object.fromEntries(formData);
  ...
```

Everything should now work as expected. The form will display errors if there are any, and the contact will be updated in the database if there are no errors.

## Handling form resets

We notice that when we submit the form, but it fails due to errors, the form resets. This is because in React 19, when using uncontrolled inputs and the `action` property, the form will reset on submission. This can be good because it mimics the MPA form submission behavior.

When it resets, it resets back to its default values, which is the contact data. If we didn't have default values, it would be reset back to an empty form.

For our case, this is not a good user experience. We can opt out by using an `onSubmit` or by using controlled inputs. However, this is not a very good solution. Instead, lets return the data submitted from the Server Function. We will use the `ContactSchemaType` type we created earlier to type the `data` object in the state.

```ts
'use server';

...

type State = {
  data?: ContactSchemaType;
  errors?: ContactSchemaErrorType;
};

export async function updateContact(contactId: string, _prevState: State, formData: FormData) {
  const data = Object.fromEntries(formData);
  const result = contactSchema.safeParse(data);

  if (!result.success) {
    return {
      data: data as ContactSchemaType,
      errors: result.error.formErrors,
    };
  }

  await prisma.contact.update({
    data: result.data,
    where: {
      id: contactId,
    },
  });

  revalidatePath(routes.home());
  redirect(routes.contactId({ contactId }));
}
```

And we will update the `useActionState` hook to use the contact as the initial values of the data, but then have it update with the data returned from the action.

```tsx
"use client"

...

export default function ContactForm({ contact }: { contact: Contact }) {
  const updateContactById = updateContact.bind(null, contact.id);
  const [state, updateContactAction] = useActionState(updateContactById, {
    data: {
      avatar: contact.avatar,
      first: contact.first,
      last: contact.last,
      notes: contact.notes,
      twitter: contact.twitter,
    },
    errors: {} as ContactSchemaErrorType,
  });
  ...
```

Then, we will instead use the returned data from the action as our default form values.

```tsx
  return (
    <form className="flex max-w-[40rem] flex-col gap-4 @container" action={updateContactAction}>
      <div className="grip-rows-5 grid gap-2 @sm:grid-cols-[1fr_4fr] @sm:gap-4">
        <span className="flex">Name</span>
        <div className="flex gap-4">
          <Input
            errors={state.errors?.fieldErrors?.first}
            defaultValue={state.data?.first || undefined}
            aria-label="First name"
            name="first"
            type="text"
            placeholder="First"
          />
          <Input
            errors={state.errors?.fieldErrors?.last}
            aria-label="Last name"
            defaultValue={state.data?.last || undefined}
            name="last"
            placeholder="Last"
            type="text"
          />
          ...
```

What happens now is that when the form is submitted, the data is returned from the Server Function and the form is updated with the data. If there are errors, the form is updated with the errors. This way, it feels like the form is not resetting.

## Note on Progressive Enhancement

We called `useActionState` directly with a Server Function, and passed the returned, wrapped action directly to the form. This enables the form to be used without JavaScript, before hydration has completed. Had we used the `onSubmit` event, the form would not have worked without JavaScript.

This is a great example of Progressive Enhancement, where we enhance the form with JavaScript, but it still works without it. This blog post did not cover additional loading states and interactions, but these can be added to further enhance the form.

## Conclusion

In this blog post, we've seen how to use the `useActionState` hook to create a validated form. We've also seen how to handle form resets with it. The final result can be found [on GithHub](https://github.com/aurorascharff/next15-remix-contacts-rebuild-v2/blob/main/app/contacts/%5BcontactId%5D/edit/_components/ContactForm.tsx) and tried out [on Vercel](https://next15-remix-contacts-rebuild-v2.vercel.app/). Again, just give the app a minute if it initially throws an application error - the database is sleeping.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
