---
author: Aurora Scharff
pubDatetime: 2025-02-25T15:22:00Z
title: Avoiding Server Component Waterfalls with React Cache
slug: avoiding-server-component-waterfalls-with-react-cache
featured: false
draft: true
tags:
  - React Server Components
  - Next.js
  - App Router
  - cache
  - performance
description: In this blog post, I will show you how to use the React cache() API in the Next.js App Router with React Server Components to optimize performance and avoid server component waterfalls.
---

The `cache()` API is a new feature released in React 19. In this blog post, we will explore it, and see how it can be used to preload data, optimizing performance and avoiding server component waterfalls.

## Table of contents

## The React Cache API

The React 19 `cache()` API allows you to cache the result of a data fetch or commutation. It's meant to be used with React Server Components. It enables per-render caching/memoization for data fetches, primarily to reduce data coupling when fetching the same data across multiple components. Check out the [documentation](https://react.dev/reference/react/cache) for more information!

A classic example could be something like a `getUser` function:

```tsx
const getUser = cache(async (userId: string) => {
  const response = await db.getUser(userId);
});
```

It's likely you are calling `getUser` in multiple server components. By using `cache()`, you can avoid fetching the same data multiple times, and rather share the return value. Any time you are fetching the same data in multiple components, you should consider using the `cache()` API. Without it, we would have to hoist data fetching to a higher component to avoid duplicate work. But, that would break composition and introduce coupling between components. Which is why the `cache()` API is so powerful.

Another typical example in Next.js could be when creating dynamic metadata for a page, fetching data inside their `generateMetadata` function.

However, the `cache()` API can also be used to avoid be used to preload data. Let's see how we can use it to avoid server component waterfalls.

## The Use Case

let's say we have a server component, here in the Next.js App Router, `PostsPage`. It receives a parameter from the URL and renders a `Post` component.

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

Here is the `Posts` component. It fetched a specific post, and also renders a list of comments for that post.

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

The `Comments` component fetches the comments for the post:

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

Both `Posts` and `Comments` are server components, and they are both fetching their own data. This is nice, because each component is responsible for both its data and its UI, maintaining composition. However, the comments can not start fetching it's data before `Post` is done running the await to fetch its data, even though `Comments` does not depend on data fetched by the `Posts` component. It's "locked" inside the `Posts` component, leading to a server waterfall.

Frameworks like React Router v7 and TanStack start solve this problem with loaders, ensuring all data is fetched based on the route. However, in Next.js, we don't have this automatic optimization.

## The Solution

Since the `cache()` API allows us to cache the result of a data fetch, we can use it to preload data for the `Comments` component. Let's say our data fetching functions look like this:

```tsx
const getPost = async (postId: string) => {
  await new Promise(resolve => {
    return setTimeout(resolve, 1000);
  });
  return [
    {
      body: 'This is the first post on this blog.',
      id: 1,
      title: 'Hello World',
    },
    ...]
    .find(post => {
    return post.id.toString() === postId;
  });
};
```

```tsx
const getComments = async (postId: string) => {
  await new Promise(resolve => {
    return setTimeout(resolve, 1000);
  });
  return [
    {
      body: 'This is the first comment on this blog.',
      id: 1,
      postId: 1,
    },
    ...].filter(comment => {
    return comment.postId.toString() === postId;
  });
};
```

When running our app, it will take 1 second to render the `Post` component, and another second to render the `Comments` component. This is because the `Comments` component is waiting for the `Post` component to finish fetching its data.

Let's use the `cache()` API to preload the data for the `Comments` component. Let's wrap `getComments` in a `cache()` call:

```tsx
// When using cache(), the return value can be cached/memoized per render across multiple server components
const getComments = cache(async (postId: string) => {
  await new Promise(resolve => {
    return setTimeout(resolve, 1000);
  });
  return [
    {
      body: 'This is the first comment on this blog.',
      id: 1,
      postId: 1,
    },
    ...].filter(comment => {
    return comment.postId.toString() === postId;
  });
});
```

Now, we can trigger the data fetch in a higher up component, in this case the `PostsPage`. It could be any component where the necessary arguments for the data fetch are available. However, to avoid blocking our `PostsPage` component, we should not await the promise:

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

Now, the `Comments` component can reuse the preloaded data already triggered by the `PostsPage` component. In our example, since both promises are resolved after 1 second, the `Comments` component will render immediately after the `Post` component, skipping the waterfall.

The code for example can be found [on Github](https://github.com/aurorascharff/next15-cache-preload), and is deployed on [Vercel](https://next15-cache-preload.vercel.app)!

## Notes on UX and DX

## Conclusion

In this blog post, I've shown you how to use React `cache()` to optimize performance and avoid server component waterfalls in React Server Components. By preloading data in a higher up component, we will not trigger a waterfall of data fetching and a Server Component can reuse the preloaded data.

I hope this post has been helpful in understanding the cache API and its uses. Please let me know if you have any questions or comments, and follow me on [Twitter](https://twitter.com/aurorascharff) for more updates. Happy coding! 🚀
