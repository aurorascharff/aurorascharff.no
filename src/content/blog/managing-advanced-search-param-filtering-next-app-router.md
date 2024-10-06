---
author: Aurora Scharff
pubDatetime: 2024-10-24T10:30:00Z
title: Managing Advanced Search Param Filtering in the Next.js App Router
slug: managing-advanced-search-param-filtering-next-app-router
featured: true
draft: true
tags:
  - React Server Components
  - Next.js
  - App Router
  - React 19
  - useOptimistic
  - Search Params
  - Filtering
description: When working with React Server Components and other new features and patterns in the Next.js App Router, it can be hard to manage advanced search param filtering. In this blog post, we will explore how to implement advanced search param filtering in the Next.js App Router, utilizing React 19 features like useOptimistic.
---

Let's say we want to have some kind of advanced filtering functionality in our Next.js app. We want to be able to filter a list of items based on multiple criteria. For example, we might have a list of tasks and we want to filter them by category and name. We could also be wanting pagination, sorting, and other features.

It is a a common request to put this state in the URL because the current state of the app can be shareable and reloadable. But, it can be hard to coordinate state in the url with component state with for example useEffect. Instead, its better to use the URL as a single source of truth - essentially lifting the state up, which is a well known pattern in React.

However, when working with React Server Components and other new features and patterns in the Next.js App Router, it can be hard to manage this state smoothly. In this blog post, we will explore how to implement advanced search param filtering in the Next.js App Router, utilizing React 19 features like `useOptimistic()`.

## the goal

Here is what we want to achieve:

![Multiple filter example](@assets/filters2.gif)

The filters should be instantly responsive, and they should not override each other when multiple filters are applied.

## The first attempt

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
    <form className="relative flex w-full flex-col gap-1 sm:w-fit" key={params.tab as TaskStatus}>
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
    <div className="flex flex-wrap gap-2">
      {Object.values(categoriesMap).map(category => {
        return (
          <ToggleButton
            onClick={() => {
              const categoryId = category.id.toString();
              const newCategories = selectedCategories.includes(categoryId)
                ? selectedCategories.filter(id => {
                    return id !== categoryId;
                  })
                : [...selectedCategories, categoryId];

              const params = new URLSearchParams(searchParams);
              params.delete('category');
              newCategories.forEach(id => {
                return params.append('category', id);
              });
              router.push(`?${params.toString()}`);
            }}
            key={category.id}
            active={selectedCategories.includes(category.id.toString())}
          >
            {category.name}
          </ToggleButton>
        );
      })}
    </div>
  );
}
```

They are pushing the search and filter state to the URL, and then in a separate `page.tsx` component we are using the filters to query the database and display the results in a table.

This is a logical implementation for a search and filter component, coding from a SPA perspective. However, the app is not working as expected. There are a few issues:

- There is no way to know that the onChange for the search has been triggered, because the app is not searching instantly.
- After we click a category, its takes time for the toggle button to become active.
- The category filtering is super buggy, and it is not working as expected. When we click multiple filters, the filters are not applied correctly.
- When searching, then clicking a category, the search is not thrown away (and vice versa).

## The reason for the issues

It all comes down to the way the Next.js router works. Pay attention to the URL in this example:

![Slow filters example](@assets/slowfilters.gif)

We click a category, but the URL does not update until the await on the `page.tsx` doing the data fetching is resolved. This is because the router is waiting for the page to be rendered before it updates the URL. Since we are relying on the URL to be updated instantly, our implementation logic breaks.

## Tracking the pending state of the search

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
          startTransition(() => {
            const newSearchParams = new URLSearchParams(searchParams.toString());
            newSearchParams.set('q', e.target.value);
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

## Fixing the category filter

This one is a bit harder. The filter is controlled by the URL, but we need to instantly update the toggled state of the button. You could try and add your own `useState()` and `useEffect()` to track the toggled state, but that would be a lot of work and it would be hard to keep in sync with the URL.

Instead, we can use the new React 19 hook `useOptimistic()`. The way it works, is it takes in a state to show when no action is pending, which can be our "true" state in the URL. Then, it returns an trigger function and a optimistic state. The optimistic state is the state that is shown when the action is pending. When the action is resolved, the optimistic state is replaced with the true state.

```tsx
// CategoryFilter.tsx

  const [optimisticCategories, setOptimisticCategories] = useOptimistic(searchParams.getAll('category'));

  return (
    <div className="flex flex-wrap gap-2">
      {Object.values(categoriesMap).map(category => {
        return (
          <ToggleButton
            onClick={() => {
              const categoryId = category.id.toString();
              const newCategories = optimisticCategories.includes(categoryId)
                ? optimisticCategories.filter(id => {
                    return id !== categoryId;
                  })
                : [...optimisticCategories, categoryId];

              const params = new URLSearchParams(searchParams);
              params.delete('category');
              newCategories.forEach(id => {
                return params.append('category', id);
              });
              setOptimisticCategories(newCategories);
              router.push(`?${params.toString()}`);
            }}
            key={category.id}
            active={optimisticCategories.includes(category.id.toString())}
          >
            {category.name}
          </ToggleButton>
        );
      })}
    </div>
  );
```

This is pretty nice. We can instantly update the state of the button, and then update the URL in the background. And when clicking multiple filters, the transition batches them together, avoiding race conditions.

However, we don't know that the result of the filter is still pending. We can use the same `useTransition` hook to return the pending state of the navigation. Then, we can put a data-pending attribute on the component to track the pending state.

```tsx
// CategoryFilter.tsx

  const [isPending, startTransition] = useTransition();
  const [optimisticCategories, setOptimisticCategories] = useOptimistic(searchParams.getAll('category'));

  return (
    <div data-pending={isPending ? '' : undefined} className="flex flex-wrap gap-2">
      {Object.values(categoriesMap).map(category => {
        return (
          <ToggleButton
            onClick={() => {
              ...
              startTransition(() => {
                setOptimisticCategories(newCategories);
                router.push(`?${params.toString()}`);
              });
            }}
```

Next, we can use this data-pending attribute to update the UI using CSS. We can put a class `group` on a parent div:

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

And then use the `group-has` pseudo class to show a pulse animation on the table in the `page.tsx` when the filter is pending.

```tsx
// page.tsx

  return (
    <div className="overflow-x-auto rounded group-has-[[data-pending]]:animate-pulse">
      <table>
        <thead>
        ...
```

Credit to Sam Selikoff with hos post on [buildui](https://buildui.com/posts/instant-search-params-with-react-server-components) for this awesome pattern.

## Coordinating the search and filter

We still have a problem. When we search, then click a category, the search is still thrown away (and vice versa). We need to coordinate the search and filter state.

To do that, we need to get them into the same transition and the same optimistic state. We could put the filters in the same component, or create a parent component, but to make it flexible and maintain composition, we should make a provider using React Context.

First, we can define a Filter type and a context to hold and update the filter state:

```tsx

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

Then, we can define an `updateFilters` function to update the filters, which uses a transition to correctly update the URL and the optimistic state, and return a pending state.

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
    <div data-pending={isPending ? '' : undefined} className="flex flex-wrap gap-2">
      {Object.values(categoriesMap).map(category => {
        return (
          <ToggleButton
            onClick={() => {
              const categoryId = category.id.toString();
              const newCategories = categories.includes(categoryId)
                ? categories.filter(id => {
                    return id !== categoryId;
                  })
                : [...categories, categoryId];
              startTransition(() => {
                updateFilters({
                  category: newCategories,
                });
              });
            }}
            key={category.id}
            active={categories.includes(category.id.toString())}
          >
            {category.name}
          </ToggleButton>
        );
      })}
    </div>
  );
}
```

Note that I have added an additional `useTransition` hook to track the pending state of each filtering. This is because we don't want to show the spinner when the categories are being updated, and vice versa.

## The result

After implementing the above changes, the app is working as expected. The search and filter are instantly responsive, and they do not override each other when multiple filters are applied.

Don't forget that you can apply the same pattern to other filters, like pagination and sorting.

A working example can be found [on Vercel](next15-filterlist.vercel.app) and the code can be found [on GitHub](https://github.com/aurorascharff/next15-filterlist).

## Note on Nuqs

I tried to implement the same pattern with Nuqs, and the implementation is pretty simple. However, when clicking multiple filters, there are some buggy flashes going on. It's possible that I did something wrong with my implementation.
The code for the nuqs implementation can be found [here](https://github.com/aurorascharff/next15-filterlist/tree/filter-nuqs).

## Conclusion

In this blog post, we explored how to implement advanced search param filtering in the Next.js App Router. We learned how to track the pending state of the search with `useTransition()`, implement a responsive category filter with `useOptimistic()`, and coordinate the search and filter state with a React Context provider.

I hope this post has been helpful to you. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
