---
author: Aurora Scharff
pubDatetime: 2026-05-22T12:00:00Z
title: Component Architecture for React Server Components
slug: component-architecture-for-react-server-components
featured: true
draft: false
tags:
  - React Server Components
  - Next.js 16
  - App Router
  - Composition
  - Suspense
  - Architecture
description: React Server Components let each component fetch the data it needs. Pages stop being giant loaders that prop-drill everything down. Here's how that changes how you architect a page, where loading boundaries live, and why it leads to better UX.
---

For most of React's history, the conventional way to load data on a page has been to fetch at the top of a route and pass it down through props. Most React developers still reach for that model first, even when working in the Next.js App Router.

In this blog post, we will look at why that habit ends up producing tightly coupled components and clumsy loading states, and explore how React Server Components let us architect a page differently. We will walk through the progression from `useEffect` to [React Query](https://tanstack.com/query) to loaders to RSCs, and then put together a page that describes the loading experience rather than managing all the data.

## Table of contents

## Background

Data fetching on the server is faster than fetching on the client, for a straightforward reason. When we fetch on the client, we have to wait for the JavaScript bundle to download, parse, and execute before the first request can even fire. As the UI renders and more components mount, each one can trigger its own fetch, leading to waterfalls where requests happen in sequence rather than in parallel. The server, on the other hand, sits next to the database and can fetch in parallel with rendering, sending the result inline with the HTML. The end user gets data without paying for an extra roundtrip.

This is why loaders in frameworks like the old [Remix](https://remix.run/) (v1 and v2), the Next.js Pages Router, and more recently [React Router v7](https://reactrouter.com/start/data/data-loading) and [TanStack Router](https://tanstack.com/router) have been so popular. They put data fetching at the route boundary on the server, which is the right place for it. With TanStack Router the loader is actually optional, and a common setup is to combine it with TanStack Query, where each component still uses its own `useQuery` for data and the loader only kicks off prefetching for that data on the route. That's arguably a nicer split, because we keep component-local fetching while still getting the route-level head start.

The question is what we lose in the process, and whether RSCs let us keep the server-side wins without the trade-offs. For a deeper look at the performance side of this, Nadia Makarevich's article [React Server Components: Do They Really Improve Performance?](https://www.developerway.com/posts/react-server-components-performance) is a great companion to this post. She measures the same app across CSR, SSR with loaders, and RSCs, and shows that the real performance gains only land once we rewrite data fetching to be server-first and add deliberate Suspense boundaries.

## The Use Case

For the rest of this post, let's imagine we are building a social feed page. The UI has a sidebar, a feed of posts, a section of user suggestions, and a list of trending tags. In plain JSX, the page looks something like this:

```tsx
function Page() {
  return (
    <Layout>
      <Sidebar />
      <main>
        <PageHeader title="Home" />
        <Feed />
      </main>
      <aside>
        <TrendingTags />
        <UserSuggestions />
      </aside>
    </Layout>
  );
}
```

This is just the layout. No data yet, no fetching, no loading states. Every component here will eventually need data, but right now we are just describing what the page looks like. From here, we can explore how different approaches to data fetching change the shape of this page.

### 1. Local Data Fetching

The original way to handle data in React was with [`useEffect`](https://react.dev/reference/react/useEffect) and [`useState`](https://react.dev/reference/react/useState). Each component fetches its own data, owns its own loading flag, and lifts state up when something else needs to know:

```tsx
function Feed() {
  const [posts, setPosts] = useState<PostT[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFeed().then(p => {
      setPosts(p);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <FeedSkeleton />;
  return <ul>{posts.map(post => <Post key={post.id} post={post} />)}</ul>;
}
```

This works for a single component, but the moment another part of the tree needs the same data, we have to hoist `posts` and `setPosts` up to a common ancestor and pass them down. Mutations follow the same pattern: if `Post` wants to like itself and have the count update elsewhere, the `like` handler has to live somewhere both components can reach, which is usually higher than either of them needs to be. We end up lifting state for reasons that have nothing to do with the UI structure:

```tsx
function Page() {
  const [posts, setPosts] = useState<PostT[]>([]);
  // ...fetch logic...

  function handleLike(postId: string) {
    likePost(postId).then(() => {
      fetchFeed().then(setPosts);
    });
  }

  return (
    <Feed posts={posts} onLike={handleLike} />
  );
}

function Feed({ posts, onLike }: Props) {
  return (
    <ul>
      {posts.map(post => (
        <Post key={post.id} post={post}>
          <LikeButton onClick={() => onLike(post.id)} />
        </Post>
      ))}
    </ul>
  );
}
```

The `like` handler lives in `App` because it needs to update `posts`. `Feed` receives both the data and the callback. `LikeButton` has no idea where the handler comes from. Everything flows through props.

React Query and similar libraries cleaned this up significantly. The data is keyed and cached centrally, so any component can ask for it without prop drilling, and mutations can invalidate or update entries from anywhere:

```tsx
function Feed() {
  const { data, isLoading } = useQuery({ queryKey: ["feed"], queryFn: fetchFeed });
  if (isLoading) return <FeedSkeleton />;
  return <ul>{data.map(post => <Post key={post.id} post={post} />)}</ul>;
}

function LikeButton({ postId }: { postId: string }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => likePost(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });
  return <button onClick={() => mutation.mutate()}>Like</button>;
}
```

Suddenly the state doesn't need to live higher than the component that owns it. `LikeButton` can sit deep in the tree, fire its mutation, and the `Feed` query refetches without anyone above either component knowing. This is genuinely better, and a big part of why React Query has the position it does.

The downside, in either case, is that every component decides when it is ready independently, and we end up with *popcorn UI*: things pop into the page one by one in whatever order the network happens to return them. We haven't designed a loading sequence, we have outsourced it to the network. On top of that, all of this fetching happens on the client, so the user has to wait for the JavaScript to download and execute before any data request even starts. Loaders were an attempt to solve this.

### 2. Route-Level Loaders

To fix the client-fetching problem, we can move the data fetching to the server with a route-level loader. Instead of each component fetching on its own, a single function fetches everything the page needs up front, and the result is passed down to the page component. In React Router, that looks like this:

```tsx
// React Router / Remix style
export async function loader() {
  const user = await getCurrentUser();
  const [feed, suggestedUsers, trendingTags] = await Promise.all([
    getFeed(user.handle),
    getSuggestedUsers(user.handle),
    getTrendingTags(),
  ]);
  return { user, feed, suggestedUsers, trendingTags };
}

export default function Page() {
  const { user, feed, suggestedUsers, trendingTags } = useLoaderData<typeof loader>();

  return (
    <Layout>
      <Sidebar user={user} />
      <Feed posts={feed.posts} currentUser={user} />
      <aside>
        <TrendingTags tags={trendingTags} />
        <UserSuggestions users={suggestedUsers} currentUser={user} />
      </aside>
    </Layout>
  );
}
```

The equivalent in the old Next.js Pages Router would be [`getServerSideProps`](https://nextjs.org/docs/pages/api-reference/functions/get-server-side-props), which passes the data as props to the page. Either way, the loader sits at the route boundary and the components below it receive concrete data shapes. Notice that mutations like the `LikeButton` from earlier are no longer visible at the page level: the loader only handles reads, and writes typically go through separate API calls or form submissions that trigger a page reload or revalidation.

The same mindset is easy to recreate at the page component level in the Next.js App Router. We just make the page itself `async` and `await` everything at the top:

```tsx
// Next.js App Router, loader mindset
export default async function Page() {
  const user = await getCurrentUser();
  const [feed, suggestedUsers, trendingTags] = await Promise.all([
    getFeed(user.handle),
    getSuggestedUsers(user.handle),
    getTrendingTags(),
  ]);

  return (
    <Layout>
      <Sidebar user={user} />
      <Feed posts={feed.posts} currentUser={user} />
      <aside>
        <TrendingTags tags={trendingTags} />
        <UserSuggestions users={suggestedUsers} currentUser={user} />
      </aside>
    </Layout>
  );
}
```

The framework is different, but the shape is identical. The page is still the data owner, and the components are still views that receive whatever the page chose to fetch.

This feels organized, but the components are now coupled to whatever the page chose to fetch for them. Our `UserSuggestions` component just renders whatever it receives:

```tsx
function UserSuggestions({ users, currentUser }: Props) {
  return (
    <ul>
      {users.map(user => (
        <UserRow key={user.handle} user={user} currentUser={currentUser} />
      ))}
    </ul>
  );
}
```

On the home page, it works fine because the page already fetches `suggestedUsers`. But now we want to reuse it on a profile page too:

```tsx
// home page
const [user, feed, suggestedUsers] = await Promise.all([
  getCurrentUser(),
  getFeed(/* ... */),
  getSuggestedUsers(/* ... */),
]);

// profile page (now needs the same thing)
const [user, profile, suggestedUsers] = await Promise.all([
  getCurrentUser(),
  getProfile(handle),
  getSuggestedUsers(/* ... */), // duplicated
]);

<UserSuggestions users={suggestedUsers} currentUser={user} />;
```

The component itself didn't change, but every new route that wants to use it has to fetch the same data, in the same shape, and thread the same props through every wrapper above it. The component is essentially welded to whichever loader happens to be fetching its data. This is inherent to the loader pattern in any framework: the data lives at the route boundary, and everything below it is a view that receives props.

### 3. Async Server Components

What if each component could fetch its own data on the server, without needing a loader to hand it down? That is exactly what [React Server Components](https://react.dev/reference/rsc/server-components) enable. They can be `async`, they run on the server, they can read from the database directly, and they never execute in the browser. This is what lets us keep the composability of the [`useEffect` approach](#1-local-data-fetching) while still fetching on the server like with [loaders](#2-route-level-loaders): each component owns its data, but the fetch happens during server rendering and the result is sent to the client as rendered HTML.

The Next.js App Router is where most developers encounter RSCs today, and it makes this the default: every component is a server component unless we explicitly mark it with `"use client"`.

Instead of the page fetching everything and passing it down, each component fetches what it needs based on minimal props, usually just an identifier. The component is self-contained: the consumer passes the minimum it needs to know (often just an ID or a handle), and the component resolves whatever else it requires internally. Let's take `UserSuggestions` from the [loader example](#2-route-level-loaders). As a server component, it doesn't need the `users` and `currentUser` props the page was handing it. It can resolve the current user and fetch the suggestions itself:

```tsx
export async function UserSuggestions() {
  const handle = await getCurrentUserHandle();
  const users = await getSuggestedUsers(handle);
  return (
    <ul>
      {users.map(user => (
        <UserRow key={user.handle} handle={user.handle} />
      ))}
    </ul>
  );
}
```

Now we can use `<UserSuggestions />` on any page without wiring up the data from above. The same component that needed two separate loaders earlier just works.

The same applies to `Feed`. In the loader version, it received `posts` and `currentUser` as props. As a server component, it fetches its own data:

```tsx
export async function Feed() {
  const handle = await getCurrentUserHandle();
  const { posts } = await getFeed(handle);
  return <ul>{posts.map(post => <Post key={post.id} id={post.id} />)}</ul>;
}
```

The page just renders `<Feed />`.

With every component fetching its own data, the page itself goes back to looking like this:

```tsx
export default function Page() {
  return (
    <Layout>
      <Sidebar />
      <main>
        <PageHeader title="Home" />
        <Feed />
      </main>
      <aside>
        <TrendingTags />
        <UserSuggestions />
      </aside>
    </Layout>
  );
}
```

The structure is the same as the [use case](#the-use-case). The difference is that every component in this tree is now fetching its own data on the server.

You might be worried about duplicate fetches at this point. With each component fetching its own data, the same `getCurrentUserHandle` could be called from multiple places in the same render. React's [`cache()`](https://react.dev/reference/react/cache) function deduplicates these per request, so calling it ten times in the same render hits the source once. This is similar to what React Query's centralized cache does on the client, but built into the server render itself. I covered this in more depth in my previous post on [Avoiding Server Component Waterfall Fetching with React 19 cache()](/posts/avoiding-server-component-waterfall-fetching-with-react-19-cache).

This composability is also why AI coding agents work so well with React in general, and RSCs extend that composability model to the server. A self-contained component can be moved to a new page, reused in a different layout, or refactored without touching anything outside its own file. The agent doesn't need to trace data through loaders or prop chains to understand what a component needs.

## Building the App

Now that we have components that fetch their own data and can be reused across pages without loaders, the next question is: how do we build real apps with this? Let's say our social feed app has more than one page:

```
app/
  layout.tsx            // root shell: nav, sidebar
  page.tsx              // home feed
  explore/
    page.tsx            // discover feed
  post/
    [id]/
      page.tsx          // single post with replies
```

A component like `<UserSuggestions />` works on any of these pages without the page having to fetch anything for it. The page is free to focus on what the user actually sees while things load.

### Avoiding Blocking Renders

Server components render on the server as a stream, which means React can start sending HTML to the client before every async component has finished fetching. [`Suspense`](https://react.dev/reference/react/Suspense) is what makes this work. Wrapping an async component in a `Suspense` boundary with a `fallback` tells React to send the fallback immediately while the component resolves in the background. Once it is ready, React streams the real content in and swaps it into place:

```tsx
<Suspense fallback={<FeedSkeleton />}>
  <Feed />
</Suspense>
```

Without `Suspense`, the page waits for every async component to finish before sending anything. Adding a boundary is how we avoid that, and it is also what unlocks the real performance gains that [Nadia's article](#background) measures.

### Making Skeletons That Stay in Sync

The fallback we pass to `Suspense` is what the user sees while an async component is fetching. Usually this is a skeleton: a lightweight placeholder that matches the shape of the content it stands in for, with the same dimensions and layout but no real data. Sometimes a spinner is enough instead. Either way, it is just HTML and CSS, and the goal is to avoid layout shift when the real content arrives.

A way I prefer to keep a skeleton in sync with its component is to export both from the same file:

```tsx
// features/post/components/feed.tsx
export async function Feed() {
  const handle = await getCurrentUserHandle();
  const { posts } = await getFeed(handle);
  return <ul>{posts.map(post => <Post key={post.id} id={post.id} />)}</ul>;
}

export function FeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </ul>
  );
}
```

Notice that `FeedSkeleton` is composed from `PostSkeleton`, the same way `Feed` is composed from `Post`. The skeletons mirror the component tree. When we edit `Post` to add a new line of metadata or change the avatar size, `PostSkeleton` is right there in the same file. Drift between the loading state and the rendered state, which is the most common cause of layout jank, gets caught at the time the change is made instead of in a QA pass later. An AI coding agent editing the component will see it too and remember to update the skeleton to match. When we compose a page, we know where to find the right fallback shape for each component.

### Designing the Loading Experience

With `Suspense` and skeletons in place, the question becomes: how do we want the page to load? We could wrap the entire content area in a single boundary:

```tsx
export default function Page() {
  return (
    <Layout>
      <Sidebar />
      <Suspense fallback={<PageSkeleton />}>
        <main>
          <PageHeader title="Home" />
          <Feed />
        </main>
        <aside>
          <TrendingTags />
          <UserSuggestions />
        </aside>
      </Suspense>
    </Layout>
  );
}
```

The sidebar shows up immediately. Everything else waits behind one boundary and appears at once. Simple, but the user stares at a single skeleton until the slowest component finishes.

Or we can split the boundaries so that each section streams independently:

```tsx
export default function Page() {
  return (
    <Layout>
      <Sidebar />
      <main>
        <PageHeader title="Home" />
        <Suspense fallback={<FeedSkeleton />}>
          <Feed />
        </Suspense>
      </main>
      <aside>
        <Suspense fallback={<TrendingTagsSkeleton />}>
          <TrendingTags />
        </Suspense>
        <Suspense fallback={<UserSuggestionsSkeleton />}>
          <UserSuggestions />
        </Suspense>
      </aside>
    </Layout>
  );
}
```

Now the sidebar and header are part of the static shell, and the feed, user suggestions, and trending tags each resolve on their own. If user suggestions are fast and the feed is slow, the user sees suggestions first. This can also feel fragmented: three separate regions popping in at different times is not always a better experience.

We could also group the aside behind a single boundary:

```tsx
export default function Page() {
  return (
    <Layout>
      <Sidebar />
      <main>
        <PageHeader title="Home" />
        <Suspense fallback={<FeedSkeleton />}>
          <Feed />
        </Suspense>
      </main>
      <Suspense fallback={<TrendingTagsSkeleton />}>
        <aside>
          <TrendingTags />
          <UserSuggestions />
        </aside>
      </Suspense>
    </Layout>
  );
}
```

The page now loads in two groups instead of three. Notice that the fallback is only `<TrendingTagsSkeleton />`. TrendingTags can return a variable number of items, so we don't know how tall it will be. If we also showed a `<UserSuggestionsSkeleton />` below it, the skeleton would likely be at the wrong vertical position once the real trending tags resolve. By only showing the trending tags skeleton, we avoid that mismatch. The entire aside appears at once when both components are ready.

When every component manages its own loading state on the client, the page has no say in what appears when. With `Suspense`, the page decides where the user waits. There is no formula for the perfect boundary placement; it comes down to trying different groupings, seeing how they feel, and iterating.

Notice how readable the page is at this point. We can look at the JSX and see exactly what renders, what shows a skeleton, and what is part of the static shell.

> Modern loaders can stream too. In [React Router v7](https://reactrouter.com/how-to/suspense), returning a promise from a loader lets that data resolve behind a `Suspense` boundary while the rest of the route renders. The page still receives the data as props through `useLoaderData`, though, so we are back to passing data down from the route boundary, which is what we are trying to avoid here.

### Building a Parameterized Page

Our route tree also has a parameterized route at `post/[id]/page.tsx`. In the Next.js App Router, `params` is a Promise (since Next.js 15), so we need to resolve it. We could `await` it at the page level:

```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageHeader back title="Post" />
      <Suspense fallback={<PostDetailSkeleton />}>
        <PostDetail id={id} />
      </Suspense>
      <Suspense fallback={<RepliesSkeleton />}>
        <Replies postId={id} />
      </Suspense>
    </div>
  );
}
```

This works, but it makes the page `async`, which means it has to wait for `params` to resolve before rendering anything. We could extract the content into a smaller component to keep the page synchronous, but we don't need to. Instead, we can use `.then()`:

```tsx
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <PageHeader back title="Post" />
      <Suspense fallback={<PostDetailSkeleton />}>
        {params.then(({ id }) => (
          <>
            <PostDetail id={id} />
            <section>
              <SectionHeader>Replies</SectionHeader>
              <Suspense fallback={<RepliesSkeleton />}>
                <Replies postId={id} />
              </Suspense>
            </section>
          </>
        ))}
      </Suspense>
    </div>
  );
}
```

The `.then()` resolves `params` so that `PostDetail` and `Replies` still receive a plain `id` string as a prop, and the page stays synchronous and readable. The loading sequence follows the same thinking as on the home feed: the header is part of the static shell, the post detail streams in behind a `Suspense` boundary, and `Replies` has its own boundary inside so it can resolve independently from the post. This pattern also sets us up nicely for [cache components](#a-note-on-cache-components) later, where keeping pages synchronous matters even more.

### Adding Interactivity

The feed itself might have interactive parts: the like button on every post needs JavaScript on the client. Client components can compose the same way. Here is a `LikeButton` that uses a [form action](https://react.dev/reference/react-dom/components/form#props) to call a [Server Function](https://react.dev/reference/rsc/server-functions) (`likePost`), with [`useOptimistic`](https://react.dev/reference/react/useOptimistic) for instant feedback:

```tsx
'use client';

export function LikeButton({ postId, liked, count }: Props) {
  const [optimistic, setOptimistic] = useOptimistic({ liked, count });

  const likeAction = async () => {
    setOptimistic({
      liked: !optimistic.liked,
      count: optimistic.count + (optimistic.liked ? -1 : 1),
    });
    await likePost(postId);
  };

  return (
    <form action={likeAction}>
      <Button>{optimistic.liked ? "♥" : "♡"} {optimistic.count}</Button>
    </form>
  );
}
```

The form calls `likePost` directly across the server boundary, and `useOptimistic` updates the UI before the server responds.

> `useOptimistic` is local to the component that uses it. If the update only affects the local component, that is enough. When another part of the page needs to react to the same update (a follower count, a notification badge), we can either lift the optimistic state into a context or let the framework revalidate.

Every `Post` in the feed composes it alongside the rest of the server-rendered content:

```tsx
<article>
  <PostHeader post={post} />
  <PostBody post={post} />
  <LikeButton postId={post.id} liked={post.liked} count={post.likes} />
</article>
```

My previous blog posts on [server and client component composition in practice](/posts/server-client-component-composition-in-practice) and [building design components with action props using async React](/posts/building-design-components-with-action-props-using-async-react) cover the client side of this in more depth.

### Organizing the Codebase

When components are this self-contained, it becomes natural to group them by feature. A feature folder structure works well for this:

```
features/
  post/
    components/
      post.tsx                   // server component + skeleton
      feed.tsx                   // server component + skeleton
      feed-tabs.tsx              // "use client"
  user/
    components/
      user-avatar.tsx            // server component + skeleton
      user-suggestions.tsx       // server component
```

Because our components only accept minimal props like an identifier and fetch their own data, they can be picked up and composed into any page. The same `<UserSuggestions />` works on the home feed, the explore page, and the post detail page without changes. Refactoring a component to a new page doesn't touch anything outside its feature folder.

> Feature slicing is just one way to organize this. Any structure works as long as the components stay self-contained, but the reusable model maps especially well to feature folders.

Along the same lines, we can also add error handling and animations to a region by wrapping it in a React [`ErrorBoundary`](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) (in Next.js, [`catchError`](https://nextjs.org/docs/app/api-reference/functions/unstable_catchError) gives us a retry button on top of that, which I covered in [Error Handling in Next.js with catchError](/posts/error-handling-in-nextjs-with-catch-error)) or in a [`ViewTransition`](https://react.dev/reference/react/ViewTransition) to animate the content as it streams in. The page composes them around its async components.

Pulling everything from this post into one place, the home feed page might end up looking something like this:

```tsx
export default function Page() {
  return (
    <Layout>
      <Sidebar />
      <main>
        <PageHeader title="Home" />
        <ErrorBoundary title="Failed to load feed">
          <Suspense fallback={<FeedSkeleton />}>
            <ViewTransition>
              <Feed />
            </ViewTransition>
          </Suspense>
        </ErrorBoundary>
      </main>
      <ErrorBoundary title="Failed to load suggestions">
        <Suspense fallback={<TrendingTagsSkeleton />}>
          <aside>
            <TrendingTags />
            <UserSuggestions />
          </aside>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
```

Each region has its own error boundary, so a failure in one part of the page doesn't take down the rest. The `ViewTransition` around the feed animates the content into place as it streams in, so the swap from skeleton to real posts feels smooth instead of abrupt.

In a real Next.js App Router project, the layout markup and `<Sidebar>` would likely live directly in the root `layout.tsx` so they wrap every page, and the page file itself would only contain the content inside.

## A Note on Cache Components

With `cacheComponents` enabled in Next.js 16, any component that fetches dynamic data has to live behind a `Suspense` boundary. Everything outside those boundaries becomes part of the static shell that can be prerendered and served instantly. This enables [Partial Prerendering](https://nextjs.org/docs/app/getting-started/partial-prerendering): the static parts are served immediately, and the dynamic parts stream in. With [`'use cache'`](https://nextjs.org/docs/app/api-reference/directives/use-cache), we can also cache individual components or data fetches, which means some regions that previously needed a `Suspense` fallback can resolve instantly and the loading states disappear entirely.

The architecture we have been building throughout this post fits naturally into this model: components fetch their own data, pages place deliberate boundaries, and we choose what shows up immediately versus what streams. The `.then()` pattern we used on the [parameterized page](#building-a-parameterized-page) matters even more here, because awaiting `params` at the page level would pull the entire page out of the static shell and cause an error.

Building this way from the start pays off even before we turn on `cacheComponents`. Once we do, the architecture is already in place.

## Conclusion

The trip from `useEffect` to React Query to loaders to RSCs has really been about getting data fetching to the server while keeping components composable. RSCs are not the only way to get there, but they compose beautifully with React's component model, and `Suspense` gives us a way to design the loading experience on top of that.

If you are still reflexively writing `async function Page` and `await`ing five queries at the top, try the inversion. Many of us learned that habit from loaders and `getServerSideProps`, and AI coding agents have been trained on the same patterns. Push the data fetches into the components that use them, and let `Suspense` handle the orchestration. The result is a codebase that is easier to read, easier to move around in, and easier for both humans and agents to work with.

I hope this post has been helpful. Thanks to [Nadia Makarevich](https://x.com/adevnadia) for benchmarking RSC performance in her article, so you don't have to take my word for it. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
