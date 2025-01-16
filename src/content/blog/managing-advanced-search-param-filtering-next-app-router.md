---
author: Aurora Scharff
pubDatetime: 2024-10-24T10:30:00Z
title: Managing Advanced Search Param Filtering in the Next.js App Router
slug: managing-advanced-search-param-filtering-next-app-router
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - App Router
  - React 19
  - nuqs
  - useOptimistic
  - Search Params
  - Filtering
description: When working with React Server Components and other new features and patterns in the Next.js App Router, it can be hard to manage advanced search param filtering. In this blog post, we will explore how to implement advanced search param filtering in the Next.js App Router, utilizing React 19 features like useOptimistic and the library nuqs.
---

Let's say we want to have some kind of advanced filtering functionality in our Next.js app. For example, we might have a list of tasks and we want to filter them by category and name. We could also be wanting pagination, sorting, and other features.

It is a a common request to put this state in the URL because the current state of the app can be shareable, bookmarkable and reloadable. But, it can be hard to coordinate state in the url with component state with for example useEffect. Instead, its better to use the URL as a single source of truth - essentially lifting the state up, which is a well known pattern in React.

However, when working with React Server Components and other new features and patterns in the Next.js App Router, it can be hard to manage this state smoothly. In this blog post, we will explore how to implement advanced search param filtering in the Next.js App Router, utilizing React 19 features like `useOptimistic()`, and finally switching to the library [nuqs](https://nuqs.47ng.com/).

## The Goal

The filters should provide instant user feedback, and they should not override each other when multiple filters are applied.

## The First Attempt

We are working with a search component:

```tsx
// Search.tsx

'use client';
...

export default function Search() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  return (
    <form className="relative flex w-full flex-col gap-1 sm:w-fit">
      <label className="font-semibold uppercase" htmlFor="search">
        Search
      </label>
      <input
        id="search"
        onChange={e => {
          const newSearchParams = new URLSearchParams(searchParams.toString());
          newSearchParams.set('q', e.target.value);
          router.push(`?${newSearchParams.toString()}`);
        }}
        defaultValue={q}
        className="w-full pl-10 sm:w-96"
        name="q"
        placeholder="Search in task title or description..."
        type="search"
      />
      <SearchStatus searching={false} />
    </form>
  );
}
```

And a category filter component:

```tsx
// CategoryFilter.tsx

'use client';
...

export default function CategoryFilter({ categoriesPromise }: Props) {
  const categoriesMap = use(categoriesPromise);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedCategories = searchParams.getAll('category');

  return (
    <div>
      <ToggleGroup
        toggleKey="category"
        options={Object.values(categoriesMap).map(category => {
          return {
            label: category.name,
            value: category.id.toString(),
          };
        })}
        selectedValues={selectedCategories}
        onToggle={newCategories => {
          const params = new URLSearchParams(searchParams);
          params.delete('category');
          newCategories.forEach(category => {
            return params.append('category', category);
          });
          router.push(`?${params.toString()}`);
        }}
      />
    </div>
  );
}
```

They are pushing the search and filter state to the URL, and then in a separate `page.tsx` server component we are using the filters to query the database directly and display the results in a table.

This is a logical implementation for a search and filter component, coding from a SPA perspective. However, the app is not working as expected. There are a few issues:

- There is no way to know that the onChange for the search has been triggered, because the app is not searching instantly.
- After we click a category, its takes time for the toggle button to become active.
- The category filtering is not working as expected. When we click multiple filters quickly, only the last clicked category is applied.
- When searching, then clicking a category before it's completed, the search is thrown away (and vice versa).

## The Reason for the Issues

It all comes down to the way the Next.js router works. Pay attention to the URL in this example:

![Slow filters example](@assets/filters.gif)

We click a category, but the URL does not update until the await in the `page.tsx` doing the data fetching is resolved. The router is waiting for the server components to finish rendering on the server before it updates the URL. Since we are relying on the URL to be updated instantly, our implementation logic breaks.

## Tracking the Pending State of the Search

Let's begin by fixing the search component. We want to track the pending state of the search, so we can show a loading spinner when the search is being performed.

This one is pretty simple. We are already using an uncontrolled input and we can see our keystrokes updating, so all we need to do is use `useTransition` from React 18 to track the pending state of the navigation. We can then use its `isPending` property to show a spinner.

```tsx
// Search.tsx

  const [isPending, startTransition] = useTransition();

  return (
    <form className="relative flex w-full flex-col gap-1 sm:w-fit" key={params.tab as TaskStatus}>
      <label className="font-semibold uppercase" htmlFor="search">
        Search
      </label>
      <input
        id="search"
        onChange={e => {
          const newSearchParams = new URLSearchParams(searchParams.toString());
          newSearchParams.set('q', e.target.value);
          startTransition(() => {
            router.push(`?${newSearchParams.toString()}`);
          });
        }}
        defaultValue={q}
        className="w-full pl-10 sm:w-96"
        name="q"
        placeholder="Search in task title or description..."
        type="search"
      />
      <SearchStatus searching={isPending} />
    </form>
  );
```

## Fixing the Category Filter

Next, lets track the pending state of the filtering. We can use the same `useTransition` hook around the push to the router. It is not suitable to put a spinner here, but we can put a data-pending attribute on the wrapper div and bind it to the pending state.

```tsx
// CategoryFilter.tsx
  ...
  const [isPending, startTransition] = useTransition();
  const selectedCategories = searchParams.getAll('category');

  return (
    <div data-pending={isPending ? '' : undefined}>
      <ToggleGroup
        toggleKey="category"
        options={Object.values(categoriesMap).map(category => {
          return {
            label: category.name,
            value: category.id.toString(),
          };
        })}
        selectedValues={selectedCategories}
        onToggle={newCategories => {
          ...
          startTransition(() => {
            router.push(`?${params.toString()}`);
          });
```

Then, we can use this data-pending attribute to update the UI using CSS. We can put a class `group` on a parent div in the root layout:

```tsx
// layout.tsx

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  ...

  return (
    <html lang="en">
      <body className={cn(GeistSans.className, 'flex flex-col px-4 py-16 sm:px-16 xl:px-48 2xl:px-96')}>
        <div className="group flex flex-col gap-10">
        ...
```

And then use the `group-has` pseudo class to show a pulsing animation on the table in the `page.tsx` when the filter is pending.

```tsx
// page.tsx

  return (
    <div className="overflow-x-auto rounded group-has-[[data-pending]]:animate-pulse">
      <table>
        <thead>
        ...
```

However, we also want the category filter buttons to be instantly responsive.

This one is a bit harder. The filter is controlled by the URL, but we need to instantly update the toggled state of the button. You could try and add your own `useState()` and `useEffect()` to track the toggled state, but that would be a lot of work and it would be hard to keep in sync with the URL.

Instead, we can use the new React 19 hook `useOptimistic()`. The way it works, is it takes in a state to show nothing is pending, which can be our "true" state in the URL. Then, it returns an trigger function and a optimistic state. The hook creates a temporary optimistic state on the client. When the transition is completed, the optimistic state is thrown away and replaced with the "true" state.

```tsx
// CategoryFilter.tsx
  ...
  const [isPending, startTransition] = useTransition();
  const [optimisticCategories, setOptimisticCategories] = useOptimistic(searchParams.getAll('category'));

  return (
    <div data-pending={isPending ? '' : undefined}>
      <ToggleGroup
        toggleKey="category"
        options={Object.values(categoriesMap).map(category => {
          return {
            label: category.name,
            value: category.id.toString(),
          };
        })}
        selectedValues={optimisticCategories}
        onToggle={newCategories => {
          const params = new URLSearchParams(searchParams);
          params.delete('category');
          newCategories.forEach(category => {
            return params.append('category', category);
          });
          startTransition(() => {
            setOptimisticCategories(newCategories);
            router.push(`?${params.toString()}`);
          });
        }}
      />
    </div>
  );
```

This is pretty nice. We can instantly update the state of the button, and wait for the new page to load with the generated server components and the URL to update in the background.

![Multiple filter example](@assets/filters2.gif)

Credit to Sam Selikoff with hos post on [buildui](https://buildui.com/posts/instant-search-params-with-react-server-components) for this awesome pattern.

A working example can be found [on Vercel](https://next15-filterlist.vercel.app/todo) and the code can be found [on GitHub](https://github.com/aurorascharff/next15-filterlist).

NB! Database might be sleeping, give it a minute after the initial application error.

## Coordinating the Search and Filter

We still have a problem. When we search, then click a category before it's settled, the search is thrown away (and vice versa). We need to coordinate the search and filter state.

To do that, we need to get them into the same transition and the same optimistic state. We could put the filters in the same component, or create a parent component, but to make it flexible and maintain composition, we should make a provider using React Context.

First, we define a `filterSchema`, which we can use parse the search params from the URL. Then, we can define a `Filter` type from the schema and a context to hold and update the filter state. Now we also have type safety when updating and parsing the search params!

```tsx
// FilterProvider.tsx

'use client';

const filterSchema = z.object({
  category: z.array(z.string()).default([]).optional(),
  q: z.string().default('').optional(),
});

type Filters = z.infer<typeof filterSchema>;
type FilterContextType = {
  filters: Filters;
  isPending: boolean;
  updateFilters: (_updates: Partial<Filters>) => void;
};

export const FilterContext = createContext<FilterContextType | undefined>(undefined);
```

A filter provider can hold the optimistic search params, and should define to always use the previous optimistic state when updating the state. Otherwise, we will not get the correct state when updating filters quickly.
  
```tsx
export default function FilterProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filters = filterSchema.safeParse({
    category: searchParams.getAll('category'),
    q: searchParams.get('q') || undefined,
  });
  
  const [isPending, startTransition] = useTransition();
  const [optimisticFilters, setOptimisticFilters] = useOptimistic(
    filters.data,
    (prevState, newFilters: Partial<Filters>) => {
      return {
        ...prevState,
        ...newFilters,
      };
    },
  );
```

Then, we can define an `updateFilters` function to update the filters, which uses a transition to correctly update the URL and the optimistic state, and track the pending state.

```tsx
  function updateFilters(updates: Partial<typeof optimisticFilters>) {
    const newState = {
      ...optimisticFilters,
      ...updates,
    };
    const newSearchParams = new URLSearchParams();

    Object.entries(newState).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => {
          newSearchParams.append(key, v);
        });
      } else if (value !== undefined) {
        newSearchParams.set(key, value);
      }
    });

    startTransition(() => {
      setOptimisticFilters(updates || {});
      router.push(`?${newSearchParams}`);
    });
  }
```

Finally, we can use the `FilterContext.Provider` to provide the optimistic filters, an update function, and an `isPending` property to track the pending state of the filtering. Then we export a `useFilters` hook to get and update the filters in any component.

```tsx
  return (
    <FilterContext.Provider value={{ filters: optimisticFilters || {}, isPending, updateFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = React.useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
}
```

See the full code for the provider [here](https://github.com/aurorascharff/next15-filterlist/blob/filter-provider/providers/FilterProvider.tsx).

The filters are now super easy to use:

```tsx
// Search.tsx

export default function Search() {
  const params = useParams();
  const { filters, updateFilters } = useFilters();
  const [isPending, startTransition] = useTransition();

  return (
    <form className="relative flex w-full flex-col gap-1 sm:w-fit" key={params.tab as TaskStatus}>
      <label className="font-semibold uppercase" htmlFor="search">
        Search
      </label>
      <input
        id="search"
        onChange={e => {
          startTransition(() => {
            updateFilters({ q: e.target.value });
          });
        }}
        defaultValue={filters.q}
        className="w-full pl-10 sm:w-96"
        name="q"
        placeholder="Search in task title or description..."
        type="search"
      />
      <SearchStatus searching={isPending} />
    </form>
  );
}
```

```tsx
// CategoryFilter.tsx

export default function CategoryFilter({ categoriesPromise }: Props) {
  const categoriesMap = use(categoriesPromise);
  const { filters, updateFilters } = useFilters();
  const categories = filters.category || [];
  const [isPending, startTransition] = useTransition();

  return (
    <div data-pending={isPending ? '' : undefined}>
      <ToggleGroup
        toggleKey="category"
        options={Object.values(categoriesMap).map(category => {
          return {
            label: category.name,
            value: category.id.toString(),
          };
        })}
        selectedValues={categories}
        onToggle={newCategories => {
          startTransition(() => {
            updateFilters({
              category: newCategories,
            });
          });
        }}
      />
    </div>
  );
}
```

Note that I have added an additional `useTransition` hook to track the pending state of each filtering. This is because we don't want to show the spinner when the categories are being updated, and vice versa.

After implementing the above changes, the app is working as expected. The search and filter are instantly responsive, and they do not override each other when multiple filters are applied.

![Multiple filter example](@assets/filters3.gif)

The code can be found [on GitHub](https://github.com/aurorascharff/next15-filterlist/tree/filter-provider).

## Switching to nuqs

While this solution is nice, it's probably not a good idea to write your own serialized state manager (as stated by Tanner Linsley in [his recent talk on Tanstack Router](https://www.youtube.com/watch?v=VlCxEjxprKg)). Instead, let's use a library that does this for us.

[Nuqs](https://nuqs.47ng.com/) is a library that provides a type-safe way to manage search params as state in React. I implemented the same features using it, and the implementation is pretty simple.

We need a `NuqsAdapter` for Next.js in our root layout:

```tsx
// layout.tsx

import { NuqsAdapter } from 'nuqs/adapters/next/app';
...
export default function RootLayout({ children }: { children: React.ReactNode }) {
  ...
  return (
    <html lang="en">
      <body className={cn(GeistSans.className, 'flex flex-col px-4 py-6 sm:px-16 sm:py-16 xl:px-48 2xl:px-96')}>
        <NuqsAdapter>
          ...
        </NuqsAdapter>
      </body>
    </html>
```

And a global search param type:

```tsx
// searchParams.ts

import { parseAsString, createSearchParamsCache, parseAsArrayOf } from 'nuqs/server';

export const searchParams = {
  category: parseAsArrayOf(parseAsString).withDefault([]),
  q: parseAsString.withDefault(''),
};
export const searchParamsCache = createSearchParamsCache(searchParams);
```

Then, we can use the `useQueryState` hook to get and update the search params in any component.

The way nuqs is implemented, the search params are actually pushed to the URL instantly. To trigger the page to reload with the result, we set the option `shallow: false`.

Finally, we can pass the `startTransition` to the `useQueryState` options, and use the pending state of the transitions to display user feedback as we did before:

```tsx
// Search.tsx

export default function Search() {
  const params = useParams();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useQueryState(
    'q',
    searchParams.q.withOptions({
      shallow: false,
      startTransition,
    }),
  );

  return (
    <form className="relative flex w-full flex-col gap-1 sm:w-fit">
      <label className="font-semibold uppercase" htmlFor="search">
        Search
      </label>
      <input
        autoComplete="off"
        id="search"
        onChange={e => {
          setQ(e.target.value);
        }}
        defaultValue={q}
        className="w-full pl-10 sm:w-96"
        name="q"
        placeholder="Search in task title or description..."
        type="search"
      />
      <SearchStatus searching={isPending} />
    </Form>
  );
}
```

```tsx
// CategoryFilter.tsx

export default function CategoryFilter({ categoriesPromise }: Props) {
  const categoriesMap = use(categoriesPromise);
  const [isPending, startTransition] = useTransition();
  const [categories, setCategories] = useQueryState(
    'category',
    searchParams.category.withOptions({
      shallow: false,
      startTransition,
    }),
  );

  return (
    <div data-pending={isPending ? '' : undefined}>
      <ToggleGroup
        toggleKey="category"
        options={Object.values(categoriesMap).map(category => {
          return {
            label: category.name,
            value: category.id.toString(),
          };
        })}
        selectedValues={categories}
        onToggle={newCategories => {
          setCategories(newCategories);
        }}
      />
    </div>
  );
}
```

The result is really nice! Notice the difference from the provider example - here the search params are instantly updated in the URL and not after the navigation. Then the page is reloaded with the result as before.

![Nuqs filters example](@assets/filters4.gif)

The code for the nuqs implementation can be found [here](https://github.com/aurorascharff/next15-filterlist/tree/filter-nuqs).

## Conclusion

In this blog post, we explored how to implement advanced search param filtering in the Next.js App Router. We learned how to track the pending state of the search with `useTransition()`, implement a responsive category filter with `useOptimistic()`, and coordinate the search and filter state with a React Context provider. Finally, we switched to using nuqs for a more robust solution.

You can also watch my [talk at Next.js Conf](https://www.youtube.com/watch?v=CvAySC5ex9c) for a more in-depth explanation of many of the patterns used in this post. It covers everything until the point where we are coordinating the search and filter state.

Don't forget that you can apply the same pattern to other filters, like pagination and sorting.

I hope this post has been helpful to you. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
