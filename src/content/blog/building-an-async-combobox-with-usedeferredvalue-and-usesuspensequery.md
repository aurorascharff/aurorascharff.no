---
author: Aurora Scharff
pubDatetime: 2025-08-07T21:22:00Z
title: Building an Async Combobox with useSuspenseQuery() and useDeferredValue()
slug: building-an-async-combobox-with-usesuspensequery-and-usedeferredvalue
featured: true
draft: false
tags:
  - React 19
  - useSuspenseQuery
  - TanStack Query
  - useDeferredValue
  - Combobox
  - Suspense
  - React Error Boundary
description: Learn how to build smooth search experiences by combining `useDeferredValue()` with `useSuspenseQuery()` for declarative async state management.
---

React concurrent features have unlocked new ways to build performant and responsive applications. In this blog post, I'll show you how to create a declarative combobox component using `useDeferredValue()` and `useSuspenseQuery()`. We'll explore how these hooks work together to deliver smooth user experiences, simplify loading and error state management, and provide automatic caching for optimal performance.

## Table of contents

## useDeferredValue() Refresher

You might be familiar with [`useDeferredValue()`](https://react.dev/reference/react/useDeferredValue) from React 18, which allows you to defer rendering a part of the UI.

It has a simple API:

```jsx
const deferredValue = useDeferredValue(value);
```

Where `value` is the value you want to defer, and `deferredValue` is the deferred version of that value. It's a concurrent feature that tells React to prioritize urgent updates over less critical ones, keeping your application responsive.

The most common use of `useDeferredValue()` is for rendering optimization. When you have expensive UI updates that might block user interactions, you can defer them to keep your app responsive.

For example, if you have a search input that updates frequently, you can defer the rendering of a suggestions list until the browser has time to process it, reducing lag while typing.

Let's say you have an input field where users can type a search query, and a list of items that filters based on that query:

```jsx
function SearchInput() {
  const [query, setQuery] = useState('');

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <List query={query} />
    </>
  );
}
```

The list component would filter items based on the `query` state:

```jsx
function List({ query }) {
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <ul>
      {filteredItems.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

If this list was really long, or it contained some heavy components, it could lead to performance issues as the user types. This is where `useDeferredValue()` comes in handy.

You can wrap the `query` state with `useDeferredValue()` to defer the updates to the list:

```jsx
function SearchInput() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <List query={deferredQuery} />
    </>
  );
} 
```

Then, you would memoize the `List` component to only re-render when the deferred query changes:

```jsx
const List = React.memo(({ query }) => {
  //...
});
```

It tells React that re-rendering the list can be deprioritized so that it doesn’t block the keystrokes. The list will “lag behind” the input and then “catch up”. Like before, React will attempt to update the list as soon as possible, but will not block the user from typing.

For a more detailed explanation of the rendering optimization aspect of `useDeferredValue()`, check out the blog post [Snappy UI Optimization with useDeferredValue()](https://www.joshwcomeau.com/react/use-deferred-value/) by [Josh Comeau](https://bsky.app/profile/joshwcomeau.com).

However, `useDeferredValue()` can also be used with a suspense enabled data source to create a smooth stale-while-revalidate experience, which is what we will explore in this blog post.

## A Suspense Enabled Data Source

A Suspense-enabled data source is any data-fetching mechanism that integrates with React's Suspense API. This includes:

- **Data fetching with Suspense-enabled frameworks** like Relay and Next.js
- **Lazy-loading component code** with [`lazy`](https://react.dev/reference/react/lazy)
- **Reading the value of a Promise** with [`use`](https://react.dev/reference/react/use)

When you use these approaches, React can suspend the component and show fallback UI (like loading spinners or skeleton UI) while waiting for the data to resolve, ensuring your components only render when the data is ready.

The [React documentation](https://react.dev/reference/react/useDeferredValue#showing-stale-content-while-fresh-content-is-loading) frequently uses `use()` with a simple cached promise as a suspense-enabled data source in its sandboxes to simplify data fetching.

## useSuspenseQuery() Refresher

TanStack Query can function as a suspense enabled data source, providing the [`useSuspenseQuery()`](https://tanstack.com/query/v5/docs/framework/react/reference/useSuspenseQuery) hook.

Here's a quick example of how you might use it:

```jsx
import { useSuspenseQuery } from '@tanstack/react-query';

function SuspendedComponent() {
  const { data } = useSuspenseQuery({
    queryKey: ['dataKey'],
    queryFn: fetchData
  });

  return <p>{data}</p>;
}
```

This hook fetches data and suspends the component until the data is available, allowing you to use Suspense fallbacks to show loading states:

```jsx
import { Suspense } from 'react';

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SuspendedComponent />
    </Suspense>
  );
}
```

This is all the knowledge we need to build a combobox component that uses `useDeferredValue()` and `useSuspenseQuery()` together.

## Building the Combobox

### Setting Up the Component

Let's start by looking at a simplified combobox component API:

```jsx
<Combobox
  asyncSearchFn={fetchData} 
  onSelect={handleSelect} 
  placeholder="Search data..." 
/>
```

In a real combobox, you might want to add enhancements like support for static or default options, keyboard navigation, and accessibility improvements. And you might to build on top of a library like [Ariakit](https://ariakit.org/). For this example, we'll keep things simple and focus on the essential async search pattern.

Here's our main component structure:

```jsx
export default function Combobox({
  asyncSearchFn,
  onSelect,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");

  const handleItemClick = (item) => {
    setFilterText(item.name);
    setIsOpen(false);
    onSelect?.(item);
  };

  return (
    <div>
      <input
        placeholder={placeholder}
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <div className="combobox-container">
          {/* Search results will go here */}
        </div>
      )}
    </div>
  );
}
```

### The Problem with Manual State Management

The natural way to build this might be to keep a search result state, calling the `asyncSearchFn` on every input change to fetch results, and handle loading and error states manually.

It could look something like this:

```jsx
export default function BadCombobox({
  asyncSearchFn,
  onSelect,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleItemClick = (item) => {
    setFilterText(item.name);
    setIsOpen(false);
    onSelect?.(item);
  };

  const handleSearch = async (text) => {
    setIsLoading(true);
    try {
      const results = await asyncSearchFn(text);
      setIsError(false);
      setSearchResults(results);
    } catch (error) {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <input
        placeholder={placeholder}
        value={filterText}
        onChange={(e) => {
          setFilterText(e.target.value);
          if (e.target.value.length > 0) {
            handleSearch(e.target.value);
          } else {
            setSearchResults([]);
            setIsLoading(false);
            setIsError(false);
          }
        }}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <div className="combobox-container">
          {isLoading ? (
            <div>Loading...</div>
          ) : isError ? (
            <div>Error loading results</div>
          ) : (
            searchResults.map((item, index) => (
              <div
                key={item.id || index}
                className="combobox-option"
                onClick={() => handleItemClick(item)}
              >
                {item.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

This quickly becomes cumbersome, and while searching we get an [unstable and flickering UX](https://stackblitz.com/edit/vitejs-vite-7vdcz5t4?file=src%2FApp.jsx) in the dropdown list. This happens because we are [not using Actions](https://react.dev/reference/react/useTransition#examples) for our async function. However, rather messing around with more states to fix it, or using Actions, let's try something different.

### Extracting the SearchResults Component with useSuspenseQuery

Let's extract a `SearchResults` component, which will use `useSuspenseQuery()` to call the `asyncSearchFn` with the current `filterText`.

```jsx
function SearchResults({ query, asyncSearchFn, onItemClick }) {
  const { data: results } = useSuspenseQuery({
    queryKey: ["search", query],
    queryFn: () => asyncSearchFn(query),
  });

  if (!results || results.length === 0) {
    return <span>No results found</span>;
  }

  return results.map((item, index) => (
    <div
      key={item.id || index}
      className="combobox-option"
      onClick={() => onItemClick(item)}
    >
      {item.name}
    </div>
  ));
}
```

We can now use this `SearchResults` component inside our `Combobox`. Then, we can wrap it in a `Suspense` component to handle loading states, and additionally an error boundary for error handling:

```jsx
import { ErrorBoundary } from 'react-error-boundary';

export default function Combobox({
  asyncSearchFn,
  onSelect,
  placeholder = "Search...",
}) {
  // ... state variables and handlers

  return (
    <div>
      <input
        placeholder={placeholder}
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <div className="combobox-container">
          <ErrorBoundary fallback={<div>Error loading results</div>}>
            <Suspense fallback={<div>Loading results...</div>}>
              <SearchResults
                query={filterText}
                asyncSearchFn={asyncSearchFn}
                onItemClick={handleItemClick}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
```

We now have a declarative way to fetch and display search results based on user input! The `SearchResults` component will automatically suspend while fetching data, showing a loading state until the results are ready, and it will handle errors gracefully if the fetch fails.

### Improving User Experience with useDeferredValue

Currently, the `SearchResults` component will re-suspend on every input change, which will hide the results until the new data is fetched. This can feel jarring to users, especially if they are typing quickly.

Let's fix this by using `useDeferredValue()` to defer the input value updates, and pass this deferred value down to the `SearchResults`:

```jsx
export default function Combobox({
  asyncSearchFn,
  onSelect,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const deferredFilterText = useDeferredValue(filterText);

  const handleItemClick = (item) => {
    // ...
  };

  return (
    <div>
      <input
        placeholder={placeholder}
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <div className="combobox-container">
          <ErrorBoundary fallback={<div>Error loading results</div>}>
            <Suspense fallback={<div>Loading results...</div>}>
              <SearchResults
                query={deferredFilterText}
                asyncSearchFn={asyncSearchFn}
                onItemClick={handleItemClick}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
```

Now, as the user types, the `SearchResults` component will remain visible with the previous results while the new search is being performed. This creates a smoother user experience, as the results will update once the new data is ready without hiding the previous results.

We will further indicate the stale content by adding an `isStale` value:

```jsx
export default function Combobox({
  asyncSearchFn,
  onSelect,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const deferredFilterText = useDeferredValue(filterText);
  const isStale = filterText !== deferredFilterText;
```

When the `filterText` changes, `isStale` is true for as long as `useSuspenseQuery()` is fetching new data. We can use this value to add a visual indicator to the stale contents.

```jsx
<ErrorBoundary fallback={<div>Error loading results</div>}>
  <Suspense fallback={<div>Loading results...</div>}>
    <div className={isStale ? "animate-pulse" : ""}>
      <SearchResults
        query={deferredFilterText}
        asyncSearchFn={asyncSearchFn}
        onItemClick={handleItemClick}
      />
    </div>
  </Suspense>
</ErrorBoundary>
```

Perfect!

Keep it mind that `useDeferredValue()` itself does not prevent extra network requests from being made. It only defers the rendering of the results. If you type quickly, you will still see multiple requests being sent to the server. However, `useSuspenseQuery()` provides built-in caching that automatically deduplicates requests, and shows instant cache hits for repeated queries.

Let's add a min 2 chars requirement for searching:

```jsx
{deferredFilterText.length < 2 ? (
  <div>Type at least 2 characters to search</div>
) : (
  <ErrorBoundary fallback={<div>Error loading results</div>}>
    <Suspense fallback={<div>Loading results...</div>}>
      <div className={isStale ? "animate-pulse" : ""}>
        <SearchResults
          query={deferredFilterText}
          asyncSearchFn={asyncSearchFn}
          onItemClick={handleItemClick}
        />
      </div>
    </Suspense>
  </ErrorBoundary>
)}
```

Here is the complete code for our `Combobox` component:

```jsx
import { useState, useDeferredValue, Suspense } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

export default function Combobox({
  asyncSearchFn,
  onSelect,
  placeholder = "Search...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const deferredFilterText = useDeferredValue(filterText);
  const isStale = filterText !== deferredFilterText;

  const handleItemClick = (item) => {
    setFilterText(item.name);
    setIsOpen(false);
    onSelect?.(item);
  };

  return (
    <div>
      <input
        placeholder={placeholder}
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <div className="combobox-container">
          {deferredFilterText.length < 2 ? (
            <div>Type at least 2 characters to search</div>
          ) : (
            <ErrorBoundary fallback={<div>Error loading results</div>}>
              <Suspense fallback={<div>Loading results...</div>}>
                <div className={isStale ? "animate-pulse" : ""}>
                  <SearchResults
                    query={deferredFilterText}
                    asyncSearchFn={asyncSearchFn}
                    onItemClick={handleItemClick}
                  />
                </div>
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      )}
    </div>
  );
}
function SearchResults({ query, asyncSearchFn, onItemClick }) {
  const { data: results } = useSuspenseQuery({
    queryKey: ["search", query],
    queryFn: () => asyncSearchFn(query),
  });

  if (!results || results.length === 0) {
    return <span>No results found</span>;
  }

  return results.map((item, index) => (
    <div
      key={item.id || index}
      className="combobox-option"
      onClick={() => onItemClick(item)}
    >
      {item.name}
    </div>
  ));
}
```

This component now provides a smooth and responsive autocomplete experience, leveraging React's concurrent features effectively, while keeping the code declarative and easy to understand.

Check it out in [Stackblitz](https://stackblitz.com/edit/vitejs-vite-7vdcz5t4?file=src%2FApp.jsx)!

In a real app, this component would be extended with more functionality. Additionally, the patterns demonstrated are applicable to a lot more cases than just a combobox component! However, for this blog post, a simple version is enough to grasp the main concepts.

## Key Takeaways

- Extracting data fetching logic into separate components with `useSuspenseQuery()` keeps concerns isolated
- Suspense and error boundaries eliminate the need for manual loading and error state management in components
- Immediate state for input fields combined with deferred state for data fetching prevents search results from disappearing while users type
- `useDeferredValue()` isn't just for rendering optimization—it creates smooth stale-while-revalidate UX when combined with Suspense-enabled data sources
- Built-in query caching provides instant results for repeated searches and automatic request deduplication
- The pattern extends beyond comboboxes—any time you need to balance immediate UI responsiveness with background data updates, these concurrent features provide an elegant solution

## Conclusion

In this post, we explored how to build responsive search interfaces using React's concurrent features. We looked at how `useDeferredValue()` and `useSuspenseQuery()` work together to create smooth user experiences, from basic component structure to advanced stale-while-revalidate patterns. By following the essential pattern of separating immediate user interactions from deferred data fetching, we can create components that are performant, declarative, and easy to maintain.

I hope this post has been helpful in understanding React's concurrent features better. Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
