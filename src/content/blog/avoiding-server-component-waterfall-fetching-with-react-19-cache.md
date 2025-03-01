---
author: Aurora Scharff
pubDatetime: 2025-02-25T15:22:00Z
title: Avoiding Server Component Waterfall Fetching with React 19 cache()
slug: avoiding-server-component-waterfall-fetching-with-react-19-cache
featured: false
draft: false
tags:
  - React Server Components
  - Next.js
  - App Router
  - React 19
  - cache
  - performance
description: In this blog post, I will show you how to use the React 19 cache() API in the Next.js App to optimize performance and avoid fetch waterfalls when using React Server Components.
---

The `cache()` API is a new feature released in React 19. In this blog post, we will explore it in the Next.js App Router, and see how it can be used to reduce data coupling and preload data, optimizing performance and avoiding waterfall fetching when using React Server Components.

## Table of contents

## The React 19 Cache API

The React 19 `cache()` API allows you to cache the result of a data fetch or computation. It's meant to be used with React Server Components. It enables per-render caching/memoization for data fetches, primarily useful to reduce data coupling when fetching the same data across multiple components. Check out the [documentation](https://react.dev/reference/react/cache) for more information!

A classic example could be something like a `getUser` function:

```tsx
const getUser = cache(async (userId: string) => {
  return db.getUser(userId);
});
```

It's likely you are calling `getUser` in multiple server components. By using `cache()`, you can avoid fetching the same data multiple times, and rather share the return value.

Any time you are fetching the same data in multiple components, you should consider using the `cache()` API. Local fetching let's you keep things uncoupled, and `cache()` let's you not care whether two leaf components need the same data. Without it, we would have to hoist data fetching to a higher component to avoid duplicate work. But, that would break composition and introduce coupling between components. Which is why the `cache()` API is so powerful.

Another typical example in Next.js could be when creating dynamic metadata for a page, fetching data inside its `generateMetadata` function. You would want to use `cache()` around the data fetching function to avoid fetching the same data multiple times for that page.

However, the `cache()` API can also be used to preload data with the [preload pattern](https://nextjs.org/docs/app/building-your-application/data-fetching/fetching#preloading-data). Let's see how we can use it to avoid server fetch waterfalls occurring.

## The Use Case

let's say we have a server component, here in the Next.js App Router, `PostsPage`. It receives a parameter from the URL and renders an async server component, the `Post` component. It also uses `Suspense` to show a fallback loading state for the `Post` while the data is being fetched.

```tsx
export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;

  return (
    <div>
      <h1>Post: {postId}</h1>
      <Suspense fallback={<div>Loading post...</div>}>
        <Post postId={postId} />
      </Suspense>
    </div>
  );
}
```

Here is the `Posts` component. It asynchronously fetches a specific post, and also renders a list of comments for that post inside another suspense boundary:

```tsx
async function Post({ postId }: { postId: string }) {
  const post = await getPost(postId);

  return (
    <div className="rounded border-2 border-blue-500 p-4">
      <h2>Title: {post?.title}</h2>
      Post comments:
      <Suspense fallback={<div>Loading comments...</div>}>
        <Comments postId={postId} />
      </Suspense>
    </div>
  );
}
```

The `Comments` component asynchronously fetches the comments for the post:

```tsx
async function Comments({ postId }: { postId: string }) {
  const comments = await getComments(postId);

  return (
    <div className="rounded border-2 border-slate-500 p-4">
      <h2>Comments</h2>
      <ul>
        {comments.map(comment => {
          return <li key={comment.id}>{comment.body}</li>;
        })}
      </ul>
    </div>
  );
}
```

Both `Post` and `Comments` are server components, and they are both fetching their own data asynchronously. This is nice, because each component is responsible for both its data and its UI, maintaining composition. However, the `Comments` component cannot start fetching its data before `Post` is done running the await to fetch its data, even though `Comments` does not depend on data fetched by the `Post` component. It's blocked inside the `Post` component, leading to a fetch waterfall.

Frameworks like React Router v7 and TanStack Start solve this problem with the loader pattern, ensuring all necessary data can be fetched and preloaded for the for route. However, in Next.js, we don't have this automatic optimization.

## The Naive Approach

Let's start by solving the waterfall problem by using hoisting the data fetching up to the `Posts` components and using `Promise.all()` to fetch comments and post data in parallel.

```tsx
async function Post({ postId }: { postId: string }) {
  const [post, comments] = await Promise.all([getPost(postId), getComments(postId)]);

  return (
    <div className="rounded border-2 border-blue-500 p-4">
      <h2>Title: {post?.title}</h2>
      Post comments:
      <Comments comments={comments} />
    </div>
  );
}
```

This is a common approach, and it works well. However, it does introduce some data coupling, as the `PostsPage` component now has to know about both data fetching functions. If we later decide to remove the `Comments` component, we would have to remember to also remove the data fetching for it in the `Post` component. In addition, if the comments are slower than the posts, the `Post` component will still be blocked until the comments are fetched.

Another potential issue is that if you end up hoisting up to a layout, you could be blocking your entire page from rendering while waiting for the data inside `Promise.all()` to be fetched.

## The Solution

Since the `cache()` API allows us to cache the result of a data fetch, we can use it to preload data for the `Comments` component. Let's say our data fetching functions look like this:

```tsx
const getPost = async (postId: string) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    {
      body: 'This is the first post on this blog.',
      id: 1,
      title: 'Hello World',
    },
    ...
  ].find(post => {
    return post.id.toString() === postId;
  });
};
```

```tsx
const getComments = async (postId: string) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    {
      body: 'This is the first comment on this blog.',
      id: 1,
      postId: 1,
    },
    ...
  ].filter(comment => {
    return comment.postId.toString() === postId;
  });
};
```

When running our app, we will first see the Suspense fallback for the `Post` component, and then the `Comments` component will start fetching its data, showing its own Suspense fallback. It will take 1 second to render the `Post` component, and another 1 second to render the `Comments` component.

Let's use the `cache()` API to preload the data for the `Comments` component.

We can wrap `getComments` in a `cache()` call:

```tsx
// When using cache(), the return value can be cached/memoized per render across multiple server components
const getComments = cache(async (postId: string) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    {
      body: 'This is the first comment on this blog.',
      id: 1,
      postId: 1,
    },
    ...
  ].filter(comment => {
    return comment.postId.toString() === postId;
  });
});
```

Now, we can trigger the data fetch in a higher up component, in this case the `PostsPage`. It could be any component where the necessary arguments for the data fetch are available.

```tsx
export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;

  // Prefetch the comments, but don't await the promise, so it doesn't block rendering
  getComments(postId);

  return (
    <div>
      <h1>Post: {postId}</h1>
      <Suspense fallback={<div>Loading post...</div>}>
        <Post postId={postId} />
      </Suspense>
    </div>
  );
}
```

It's important to not await the promise, or else it will block rendering of the `PostsPage`.

Now, the `Comments` component can reuse the preloaded data already triggered by the `PostPage` component. In our example, since both promises are resolved after 1 second, the `Comments` component will render immediately after the `Post` component, skipping the waterfall!

The code example can be found [on Github](https://github.com/aurorascharff/next15-cache-preload), and is deployed on [Vercel](https://next15-cache-preload.vercel.app)!

## Additional notes

When adding the preload pattern, it's worth noting the hidden data coupling that can occur when refactoring. If you are using the `cache()` API to preload data, and later decide to refactor the component tree and delete a deep child, you might end up with an unused preloading data fetch. This is because the data fetch is not directly coupled to the component that uses it. Worst case, you might end up with a preloading data fetch that is never used.

Therefore, it's worth thinking about when you add the preloading pattern. Rather than adding it prematurely everywhere, use it to solve a specific performance problem. And keep it in mind when refactoring - if you are refactoring a component that uses the preloading pattern, make sure to check if the preloading is still necessary.

Another thing to note is that when using the `fetch()` API in Next.js, the data is already cached/memoized per render. So, if you are using the `fetch()` API to fetch the same data in multiple components or to preload data, you don't need to wrap with `cache()`. The `cache()` API is primarily useful when you are fetching through a database, or running some other custom data fetching function or computation.

## Key Takeaways

- The `cache()` API allows you to cache the result of a data fetch or computation, enabling per-render caching/memoization for data fetches.
- The `cache()` API can be used to reduce data coupling and maintain component composition.
- Any time you are fetching the same data in multiple components, you should consider using the `cache()` API, unless your data fetching is already using the `fetch()` API.
- The `cache()` API can also be used to preload data, allowing deeper components to reuse the preloaded data and avoid triggering a waterfall of data fetching, increasing performance. Remember not to await the preloading function.
- It's important to carefully consider where and when to implement the preloading pattern to avoid unnecessary complexity in your component hierarchy.

## Conclusion

In this blog post, I've shown you how to use React `cache()` to reduce data coupling and preload data, optimizing performance and avoiding waterfall fetching.

Thanks to Robin Wieruch and Sam Selikoff for insightful discussions [on X](https://x.com/samselikoff/status/1894394514036375668)!

I hope this post has been helpful in understanding the `cache()` API and its uses. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
