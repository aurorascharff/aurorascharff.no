---
author: Aurora Walberg Scharff
pubDatetime: 2024-04-05T08:22:00Z
title: Rebuilding "Remix Contacts" in Next.js 14
slug: rebuilding-remix-contacts-in-nextjs-14-with-server-actions
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - Remix
  - Server Actions
  - useOptimistic
  - useTransition
  - Prisma
description: Remix Contacts is Remix's official tutorial. In this post, we'll rebuild it in Next.js 14 using React Server Components and Server Actions, and compare the two approaches.
---

## Table of contents

## The Goal

- Replicate the Remix Contacts tutorial in Next.js 14 using React Server Components and Server Actions, while mainataining progressive enhancement.

This app also replaces the Remix stylesheet with a tailwind one and uses Prisma instead of a fake db.

## Executing the Rebuild

Please view the [GutHub repo](https://github.com/aurorascharff/next14-remix-contacts-rebuild) for the full code. These steps are more to give an overview of the process and discuss the descisions made.

Refer to the [Remix tutorial](https://remix.run/docs/en/main/start/tutorial) for each step of the process.

### "The root route"

Starting from a fresh Next.js project, we paste the code from the Remix Contacts tutorial into the root layout component, since this is a sidebar that will be present on all pages.

### "Adding stylesheets with Links"

We add the css to the globals.css. The repo contains the tailwind version.

### "The Contact Route UI"

We make a new folder called `contacts/` and added a dynamic route subfolder `[contactId]/` containing a `page.tsx` for the contact route. We copied the code from the Remix tutorial into this file. However, I'll extract the favorite component into a separate file inside a folder called `components/`. In addition, we'll pass the contact as a prop to the favorite component using the DB schema:

```tsx
// components/Favorite.tsx
export default function Favorite({ contact }: { contact: Contact }) {
  const favorite = contact.favorite;
  return (
    <form method="post">
      <button
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        name="favorite"
        value={favorite ? "false" : "true"}
      >
        {favorite ? "★" : "☆"}
      </button>
    </form>
  );
}
```

We're also getting errors because I'm using `onSubmit` on the form, which is not allowed in server components. I'll split the form into a separate component with `"use client"`, `DeleteContactButton.tsx`.

In addition, we'll replace the `<form action="edit">` with a Next.js `Link` component to the edit page (and update styling):

```tsx
<Link href={`/contacts/${contact.id}/edit`}>Edit</Link>
```

### "Nested Routes and Layouts"

We just need to add the `children` prop from the root layout inside the jsx:

```tsx
<div id="detail">{children}</div>
```

### "Client Side Routing"

Let's just replace the relevant `<a>` tags with Next.js `Link` components.

### "Loading Data"

We will not be using route loaders, but instead fetch the data inside the root layout by making it async and calling a database query through a file in a new data access layer, `lib/services/getContacts.ts`, and add the tutorial code to the layout component. The database query will be a simple Prisma query, and we mark the file with `"server-only"` to avoid it being called from client code:

```tsx
// app/layout.tsx

export default async function RootLayout({ children }: Props) {
  const contacts = await getContacts();
```

```ts
// lib/services/getContacts.ts
import "server-only";

import { prisma } from "../../db";

export async function getContacts() {
  return prisma.contact.findMany();
}
```

### "Type Interference"

We will get type interference automatically.

### "URL Params in Loaders"

We don't have to use loaders, we can just make another server function in the data access layer, `lib/services/getContact.ts`, and call it from the contact route with the params from the Nextjs page properties:

```tsx
// app/contacts/[contactId]/page.tsx
type PageProps = {
  params: {
    contactId: string;
  };
};

export default async function ContactPage({ params }: PageProps) {
  const contact = await getContact(params.contactId);
```

```ts
// lib/services/getContact.ts
import "server-only";

import invariant from "tiny-invariant";
import { prisma } from "../../db";

export async function getContact(contactId: string) {
  const contact = await prisma.contact.findUnique({
    where: {
      id: contactId,
    },
  });
  return contact;
}
```

### "Validating Params and Throwing Responses"

We can just use the `notFound` function from Next.js to throw the correct error if the contact is not found, and create an error boundary with `[contactId]/not-found.tsx` to catch the error and display a 404 page.

```ts
// lib/services/getContact.ts

import { notFound } from "next/navigation";
import invariant from "tiny-invariant";
import { prisma } from "../../db";

export async function getContact(contactId: string) {
  invariant(contactId, "Missing contactId param");
  const contact = await prisma.contact.findUnique({
    where: {
      id: contactId,
    },
  });
  if (!contact) {
    notFound();
  }
  return contact;
}
```

### "Data Mutations"

We will be following Remix's approach to data mutations, which is to use a form for mutations to ensure progressive enhancement. However, in Remix the action for the route is automatically called for a form submit, but we will define which function to call per form. We will be binding to React's modified `<form>` element's `action` property to call the server action when the form is submitted.

### "Creating Contacts"

We will create a new file in the data access layer, `lib/actions/createEmptyContact.ts`, and bind it to the form in the root layout:

```ts
// lib/actions/createEmptyContact.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../db";

export async function createEmptyContact() {
  await prisma.contact.create({
    data: {},
  });
  revalidatePath("/");
}
```

```tsx
<form action={createEmptyContact}>
  <button type="submit">New</button>
</form>
```

The createEmptyContact function will be called when the form is submitted, and the contact will be created in the database. We also have to revalidate the root path to update the contacts list, unlike in Remix where this is done automatically.

### "Updating Data"

We will create a new subfolder with a new page, `contacts/[contactId]/edit/page.ts` to handle the edit page. We will just get the contact from the database like we did in the contact page, and paste the tutorial code into the page.

### "Updating Contacts with FormData"

We will create a new file in the data access layer, `lib/actions/updateContact.ts`, and bind it to the form in the edit page.

However, we have a problem. We don't recieve route params in the server action (unlike the action function in Remix), so we have to pass it to the action from the page. To do this without breaking the progressive enhancement, we could either create a hidden form field, or make a copy of `updateContact` with the `contactId` as initial arguments by using `.bind`. We will go with the latter:

```tsx
// app/contacts/[contactId]/edit/page.tsx
export default async function EditContactPage({ params: { contactId } }: PageProps) {
  const contact = await getContact(contactId);
  const updateContactById = updateContact.bind(null, contact.id);

  return (
    <form key={contact.id} id="contact-form" action={updateContactById}>
```

```ts
// lib/actions/updateContact.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import invariant from "tiny-invariant";
import { prisma } from "../../db";

export async function updateContact(contactId: string, formData: FormData) {
  invariant(contactId, "Missing contactId param");
  const updates = Object.fromEntries(formData);
  await prisma.contact.update({
    data: updates,
    where: {
      id: contactId,
    },
  });
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}`);
}
```

The formData is also passed to the server action, and the contact is updated in the database. Again, we have to revalidate the path, then use Next's `redirect` to the navigate to the contact page after the contact has been updated. See the Remix tutorial for more information on the formData object handling.

### "Redirecting new records to the edit page"

We will just redirect to the edit page for the created contacts after creating it in the database:

```ts
// lib/actions/createEmptyContact.ts
"use server";

export async function createEmptyContact() {
  const contact = await prisma.contact.create({
    data: {},
  });
  revalidatePath("/");
  redirect(`/contacts/${contact.id}/edit`);
}
```

### "Active Link Styling"

Next.js does not have a `NavLink` component like remix. We have to make a new client component, `ContactButton.tsx`, that uses the `usePathname` hook (which requires client-side js) to check if the current path matches the contact id, and then apply the active styling.

In addition, we have to use a transition to track the state of the page that is loading. We add an `onClick` handler to the `Link` component in addition to the `href` prop, prevent the default behavior and call the `router.push` function inside a transition:

```tsx
// components/ContactButton.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useTransition } from "react";
import type { Contact } from "@prisma/client";

export default function ContactButton({ contact }: { contact: Contact }) {
  const pathName = usePathname();
  const isActive = pathName.includes(`/contacts/${contact.id}`);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Link
      className={isActive ? "active" : isPending ? "pending" : ""}
      href={`/contacts/${contact.id}`}
      onClick={e => {
        e.preventDefault();
        startTransition(() => {
          router.push(`/contacts/${contact.id}`);
        });
      }}
    >
      {contact.first || contact.last ? (
        <>
          {contact.first} {contact.last}
        </>
      ) : (
        <i>No Name</i>
      )}{" "}
      {contact.favorite ? <span>★</span> : null}
    </Link>
  );
}
```

### "Global Pending UI"

This is where it gets interesting. We want to fade the main page whenever the app is in a loading state, and we know that different buttons across the app can trigger this state.

In remix, we would use the `useNavigation()` hook. However, Next.js does not expose router events for composability reasons, and expects you to use transitions instead.

I found the article [Global progress in Next.js](https://buildui.com/posts/global-progress-in-nextjs) by Sam Selikoff and Ryan Toronto on how to create a global progress bar very helpful here - please refer to it for more information.

I tested out adding a `data-pending` to the component firing a global pending state as mentioned in the article [Instant Search Params with React Server Components](https://buildui.com/posts/instant-search-params-with-react-server-components"), however I don't want to add this logic to every component that can trigger a loading state.

Instead, let's create a global pending state provider that can trigger a common transition for all components inside `providers/LoadingContext.tsx`:

```tsx
// providers/LoadingContext.tsx
"use client";

import React, { createContext, useTransition } from "react";

type LoadingContextType = {
  isLoading: boolean;
  startTransition: (_action: () => void) => void;
};

export const LoadingContext = createContext<LoadingContextType | undefined>(
  undefined
);

export default function LoadingStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  const start = (action: () => void) => {
    startTransition(() => {
      action();
    });
  };

  return (
    <LoadingContext.Provider
      value={{ isLoading: isPending, startTransition: start }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = React.useContext(LoadingContext);
  if (context === undefined) {
    throw new Error(
      "useThemeContext must be used within a ThemeContextProvider"
    );
  }
  return context;
}
```

However, to use this we now need to make all the components that can trigger a loading state a progressively enhanced client component that can use the `useLoading` hook. This is a lot of boilerplate code. Let's make some abstractions:

```tsx
// components/NavButton.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useLoading } from "../providers/LoadingContext";

type Props = {
  children: React.ReactNode;
  href: string;
};

export default function NavButton({ children, href }: Props) {
  const router = useRouter();
  const { startTransition } = useLoading();

  return (
    <Link
      href={href}
      onClick={e => {
        e.preventDefault();
        startTransition(() => {
          router.push(href);
        });
      }}
    >
      {children}
    </Link>
  );
}
```

```tsx
// components/ActionButton.tsx
"use client";

import React from "react";
import { useLoading } from "../providers/LoadingContext";

type Props = {
  action: () => void;
  onClick?: () => void;
  children: React.ReactNode;
};

export default function ActionButton({ action, onClick, children }: Props) {
  const { startTransition } = useLoading();

  return (
    <form
      action={action}
      onSubmit={e => {
        e.preventDefault();
        startTransition(() => {
          onClick ? onClick() : action();
        });
      }}
    >
      <button type="submit">{children}</button>
    </form>
  );
}
```

We'll wrap the app with the `LoadingStateProvider` in `layout.tsx`.

Then we'll just use these components in place of the `Link` and `form` components in the layout and contact components:

```tsx
// app/layout.tsx
<ActionButton action={createEmptyContact}>
  New
</ActionButton>

// contacts/[contactId]/page.tsx
<NavButton href={`/contacts/${contactId}/edit`}>Edit</NavButton>
```

You get the idea. We also add the `ActionButton` inside the `DeleteContactButton` component, and extract the contact form into a separate client component `ContactForm` to add logic here as well:

```tsx
// components/ContactForm.tsx
'use client';

import React from 'react';
import { deleteContact } from '../lib/actions/deleteContact';
import ActionButton from './ActionButton';

export default function ContactForm({ contact }: { contact: Contact }) {
  const updateContactById = updateContact.bind(null, contact.id);
  const { startTransition } = useLoading();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      await updateContactById(new FormData(event.currentTarget));
    });
  };

  return (
    <form action={updateContactById} onSubmit={onSubmit} key={contact.id}>
```

Here we also use the `bind` function to pass the contact id to the server action, and replicate the loading state logic.

### "Deleting Records"

Phew, let's get to something easier. Instead of creating seperate routes for specific form operations like in the Remix example, server actions let's us easily call a delete function in the data access layer, `lib/actions/deleteContact.ts`, and bind it to the delete button in the contact component:

```ts
// lib/actions/deleteContact.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import invariant from "tiny-invariant";
import { prisma } from "../../db";

export async function deleteContact(contactId: string) {
  invariant(contactId, "Missing contactId param");
  await prisma.contact.delete({
    where: {
      id: contactId,
    },
  });
  revalidatePath("/");
  redirect("/");
}
```

```tsx
// components/DeleteContactButton.tsx
"use client";

import React from "react";
import { deleteContact } from "../lib/actions/deleteContact";
import ActionButton from "./ActionButton";

export default function DeleteContactButton({
  contactId,
}: {
  contactId: string;
}) {
  const deleteContactById = deleteContact.bind(null, contactId);

  return (
    <ActionButton
      onClick={() => {
        const response = confirm(
          "Please confirm you want to delete this record."
        );
        if (!response) {
          return;
        }
        deleteContactById();
      }}
      action={deleteContactById}
      className="text-red-400"
    >
      Delete
    </ActionButton>
  );
}
```

### "Index Routes"

We will just add content to the root page, `app/page.tsx`, with the same code as in the Remix tutorial.

### "Cancel Button"

We already made an abstraction for navigating and tracking the state, so we can just use the `NavButton` component for the cancel button in the edit page:

```tsx
// contacts/[contactId]/edit/page.tsx
<NavButton href={`/contacts/${contact.id}`}>Cancel</NavButton>
```

### "URLSearchParams and GET Submissions"

In Next.js, search params are not being passed to layout components, so the search params must be fetched from the client-side hook. I made a `ContactList` client component to filter the data based on the search params:

```tsx
// components/ContactList.tsx
"use client";

import { matchSorter } from "match-sorter";
import { useSearchParams } from "next/navigation";
import React from "react";
import ContactButton from "./ContactButton";
import type { Contact } from "@prisma/client";

export default function ContactList({ contacts }: { contacts: Contact[] }) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const filteredContacts = query
    ? matchSorter(contacts, query, {
        keys: ["first", "last"],
      })
    : contacts;

  return (
    <nav className="flex-1 overflow-auto px-8 pt-4">
      {filteredContacts.length ? (
        <ul>
          {filteredContacts.map(contact => {
            return (
              <li key={contact.id} className="mx-1">
                <ContactButton contact={contact} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p>
          <i>No contacts</i>
        </p>
      )}
    </nav>
  );
}
```

This is not the behavior of the Remix tutorial. I would prefer to use the search params in the layout and get contacts based on the query. At least our search is now quicker.

I'm not entirely sure why this is working without JavaScript. I think it might be because the `useSearchParams` hook behaves as URLSearchParams on the server. I could be completely wrong here, though. Please let me know if you have any insights.

### "Synchronizing URLs to Form State"

We will extract the search form into a new `Search` client component to use the `useSearchParams()` to sync the default value of the input with the search params:

```tsx
// components/Search.tsx
"use client";

import { useSearchParams } from "next/navigation";
import React from "react";

export default function Search() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  return (
    <form role="search">
      <input
        defaultValue={query}
        aria-label="Search contacts"
        name="q"
        placeholder="Search"
        type="search"
      />
      <div
        aria-hidden
        className="search-spinner absolute left-10 top-7 h-4 w-4 animate-spin"
      />
    </form>
  );
}
```

### "Submitting Form's onChange"

We will just use an onChange and push the new search params to the router:

```tsx
// components/Search.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

export default function Search() {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  return (
    <form role="search">
      <input
        onChange={e => {
          router.push(`${pathName}?q=${e.target.value}`);
        }}
        defaultValue={query}
        aria-label="Search contacts"
        name="q"
        placeholder="Search"
        type="search"
      />
    </form>
  );
}
```

### "Adding Search Spinner"

We will bring in a transition to track the state of router, and add a spinner to the search component:

```tsx
// components/Search.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useTransition } from "react";
import { cn } from "../utils/style";

export default function Search() {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [isPending, startTransition] = useTransition();
  const searching = isPending && query;

  return (
    <form role="search">
      <input
        className={searching ? "loading" : ""}
        onChange={e => {
          startTransition(() => {
            router.push(`${pathName}?q=${e.target.value}`);
          });
        }}
        defaultValue={query}
        aria-label="Search contacts"
        name="q"
        placeholder="Search"
        type="search"
      />
      <div aria-hidden hidden={!searching} className="search-spinner" />
    </form>
  );
}
```

In the Remix tutorial, code is written to avoid the main screen from fading out when the search spinner is active. However, since we are using a singular transition here in this component (and not using our "global navigating" hook), we don't have to worry about this.

Also, I had to wrap a Suspense component around the `ContactList` component in the layout to [resolve build errors and follow best practises](https://nextjs.org/docs/app/api-reference/functions/use-search-params), and locally this does not break progressive enhancement. However, when deployed on vercel, it does. I'm not sure why.

That leaves my `app/layout.tsx` containing this:

```tsx
// app/layout.tsx
<Suspense>
  <div>
    <Search />
    <ActionButton action={createEmptyContact}>New</ActionButton>
  </div>
  <ContactList contacts={contacts} />
</Suspense>
```

### "Managing the History Stack"

We will just switch between `router.push()` and `router.replace()` in the search component based on the query:

```tsx
onChange={e => {
  const isFirstSearch = query === null;
  startTransition(() => {
    isFirstSearch
      ? router.push(`${pathName}?q=${e.target.value}`)
      : router.replace(`${pathName}?q=${e.target.value}`);
  });
}}
```

### "Forms Without Navigation"

Since we're using server actions on forms we don't have to worry about the default page refresh behavior of the form element. We'll make a new server action to update the favorite flag on the contact, `lib/actions/updateFavorite.ts`. We'll are going to use the same pattern of binding to this function with initial `contactId` arguments as we did in the `updateContact` function to maintain progressive enhancement:

```ts
// lib/actions/favoriteContact.ts
"use server";

import { revalidatePath } from "next/cache";
import invariant from "tiny-invariant";
import { prisma } from "../../db";

export async function favoriteContact(contactId: string, isFavorite: boolean) {
  invariant(contactId, "Missing contactId param");
  await prisma.contact.update({
    data: {
      favorite: !isFavorite,
    },
    where: {
      id: contactId,
    },
  });
  revalidatePath("/");
}
```

Then we will use this action in the `Favorite` component:

```tsx
// components/Favorite.tsx
import React from "react";
import { favoriteContact } from "../lib/actions/favoriteContact";
import type { Contact } from "@prisma/client";

export default function Favorite({ contact }: { contact: Contact }) {
  const favorite = contact.favorite;
  const favoriteContactById = favoriteContact.bind(null, contact.id, favorite);

  return (
    <form action={favoriteContactById}>
      <button
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      >
        {favorite ? "★" : "☆"}
      </button>
    </form>
  );
}
```

### "Optimistic UI"

For this task, we will use the new `useOptimistic()` hook. We will create an `onSubmit` function that will trigger if JavaScript is loaded. The action poroperty will be used as a fallback. Then we can use the optimistic value to display the star-icon. We also have to prevent the default behavior inside our `onSubmit`, and wrap it in a transition (as instructed by the React docs):

```tsx
// components/Favorite.tsx
"use client";

import React, { useOptimistic, useTransition } from "react";
import { favoriteContact } from "../lib/actions/favoriteContact";
import { cn } from "../utils/style";
import type { Contact } from "@prisma/client";

export default function Favorite({ contact }: { contact: Contact }) {
  const favorite = contact.favorite;
  const favoriteContactById = favoriteContact.bind(null, contact.id, favorite);
  const [optimisticFavorite, addOptimisticFavorite] = useOptimistic(favorite);
  const [, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      addOptimisticFavorite(!favorite);
      await favoriteContactById();
    });
  };

  return (
    <form action={favoriteContactById} onSubmit={onSubmit}>
      <button
        type="submit"
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      >
        {optimisticFavorite ? "★" : "☆"}
      </button>
    </form>
  );
}
```

And thats it! Please refer to the [GitHub repo](https://github.com/aurorascharff/next14-remix-contacts-rebuild) for the full code.

## Discussing the Two Approaches

### Problem 1: Global Navigation Events

[Execution](#global-pending-ui)

As encountered, we had to create a custom provider to handle global navigation events since next.js does not expose router events. To trigger the common transition, we made progressively enhanced client components, `NavButton` and `ActionButton`, that can use the `useLoading` hook.

I could have just used the `data-pending` attribute on the component firing a global pending state and style the layout based on it. That would also be fine for this example, but I wanted to try out a generalized solution.

Either way, we end up with a lot of boilerplate code to handle this, a trade-off for Next.js' composability.

The correct Nextjs approach might be to use a combination of Suspense and Transitions to handle loading states, but I wanted to replicate the features of Remix tutorial as closely as possible.

### Problem 2: Search Params in Layouts

[Execution](#urlsearchparams-and-get-submissions)

As encountered, we had to use a client component to fetch the search params in the layout component, since Next.js's layouts does not pass search params. I would prefer to use the search params in the layout and get contacts based on the query, but in return we get instant search.

However, we had to wrap a Suspense component around the `ContactList` and `Search` component in the layout, which breaks progressive enhancement when deployed on vercel for some reason.

### Problem 3: Server Actions and Optimistic UI

[Execution](#optimistic-ui)

Server Actions are queued, and before firing a new one, the previous one must be resolved. In addition, unlike Remix, the actions are not automatically cancelled if fired in quick succession.

This causes problems with our optimistic UI. If a user clicks the favorite button multiple times in quick succession, multiple server actions will fire, and the final value won't update until all of them are done.

We might want to add some timeout logic to prevent this. Howver, it is a known drawback of Server Actions, and we might as well wait for improvements from the Next.js team.

### The Next.js Approach

Positives

- Is more flexible and allows for more customization and composability.
- Is more familiar to React developers.

Neutrals

- Generates more components. This could be good for future development, but might be overkill for a small project.

Negatives

- Is more complex and requires more boilerplate code.
- Is more difficult to learn and understand.
- Deviates from web standards.
- Does not progressively enhance as well as the Remix approach.

### The Remix Approach

Positives

- Is more straightforward and easier to learn and understand.
- Is more in line with web standards.
- Progressively enhances better.
- Contains less boilerplate code.

Neutrals

- Is less "React-y" and more "HTML-y".

## Conclusion

In this blog post, I've rebuilt the Remix Contacts tutorial in Next.js 14 using React Server Components and Server Actions, and compared the two approaches. I've found that the Next.js approach is more flexible and allows for more customization and composability, but is more complex and requires more boilerplate code. The Remix approach is more straightforward and easier to learn and understand, and progressively enhances better.

I hope this post has been helpful in understanding the differences between the two approaches and how to implement them in your own projects. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
