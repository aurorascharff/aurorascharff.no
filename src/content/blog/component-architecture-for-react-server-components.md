---
author: Aurora Scharff
pubDatetime: 2026-05-22T14:00:00Z
title: Component Architecture for React Server Components
slug: component-architecture-for-react-server-components
featured: true
draft: true
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

In this blog post, we will look at why that habit ends up producing tightly coupled components and clumsy loading states, and explore how React Server Components let us architect a page where the end result looks something like this:

```tsx
export default function HomePage() {
  return (
    <Layout>
      <PageHeader title="Home" />
      <Suspense fallback={<FeedSkeleton />}>
        <Feed />
      </Suspense>
    </Layout>
  );
}
```

No data fetching at the top. No prop drilling. The page describes the experience, and the components handle the rest.

## Table of contents

## Background

Data fetching on the server is faster than fetching on the client, for a straightforward reason. When we fetch on the client, we have to wait for the JavaScript bundle to download, parse, and execute before the first request can even fire. As the UI renders and more components mount, each one can trigger its own fetch, leading to waterfalls where requests happen in sequence rather than in parallel. The server, on the other hand, sits next to the database and can fetch in parallel with rendering, sending the result inline with the HTML. The end user gets data without paying for an extra roundtrip.

This is why loaders in frameworks like the old [Remix](https://remix.run/) (v1 and v2), the Next.js Pages Router, and more recently [React Router v7](https://reactrouter.com/start/data/data-loading) and [TanStack Router](https://tanstack.com/router) have been so popular. They put data fetching at the route boundary on the server, which is the right place for it. With TanStack Router the loader is actually optional, and a common setup is to combine it with TanStack Query, where each component still uses its own `useQuery` for data and the loader only kicks off prefetching for that data on the route. That's arguably a nicer split, because we keep component-local fetching while still getting the route-level head start.

The question is what we lose in the process, and whether RSCs let us keep the server-side wins without the trade-offs. For a deeper look at the performance side of this, Nadia Makarevich's article [React Server Components: Do They Really Improve Performance?](https://www.developerway.com/posts/react-server-components-performance) is a great companion to this post. She measures the same app across CSR, SSR with loaders, and RSCs, and shows that the real performance gains only land once we rewrite data fetching to be server-first and add deliberate Suspense boundaries.

## The Approaches

Let's look at a few common patterns for handling data on a page and what trade-offs each one brings.

### 1. Local Data Fetching

The original way to handle data in React was with `useEffect` and `useState`. Each component fetches its own data, owns its own loading flag, and lifts state up when something else needs to know:

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

This works for a single component, but the moment another part of the tree needs the same data, we have to hoist `posts` and `setPosts` up to a common ancestor and pass them down. Mutations follow the same pattern: if `Post` wants to like itself and have the count update elsewhere, the `like` handler has to live somewhere both components can reach, which is usually higher than either of them needs to be. We end up lifting state for reasons that have nothing to do with the UI structure.

React Query and similar libraries cleaned this up significantly. The data is keyed and cached centrally, so any component can ask for it without prop drilling, and mutations can invalidate or update entries from anywhere:

```tsx
function Feed() {
  const { data, isLoading } = useQuery(["feed"], fetchFeed);
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

export default function HomePage() {
  const { user, feed, suggestedUsers, trendingTags } = useLoaderData<typeof loader>();

  return (
    <Layout>
      <Sidebar user={user} />
      <Feed posts={feed.posts} currentUser={user} />
      <Aside>
        <UserSuggestions users={suggestedUsers} currentUser={user} />
        <TrendingTags tags={trendingTags} />
      </Aside>
    </Layout>
  );
}
```

The equivalent in the old Next.js Pages Router would be `getServerSideProps`, which passes the data as props to the page. Either way, the loader sits at the route boundary and the components below it receive concrete data shapes.

The same mindset is easy to recreate at the page component level in the Next.js App Router. We just make the page itself `async` and `await` everything at the top:

```tsx
// Next.js App Router, loader mindset
export default async function HomePage() {
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
      <Aside>
        <UserSuggestions users={suggestedUsers} currentUser={user} />
        <TrendingTags tags={trendingTags} />
      </Aside>
    </Layout>
  );
}
```

The framework is different, but the shape is identical. The page is still the data owner, and the components are still views that receive whatever the page chose to fetch.

This feels organized, but it has a couple of costs. The first is that components are coupled to a specific data shape. Let's say `Feed` now also wants to show whether the current user has liked each post. That means a new query, a new field on the prop, and changes in two or three places:

```tsx
// page change
const [user, feed, likes /* new */] = await Promise.all([
  getCurrentUser(),
  getFeed(/* ... */),
  getLikedPostIds(/* ... */), // new
]);

<Feed posts={feed.posts} likes={likes} currentUser={user} />;

// Feed change
function Feed({ posts, likes, currentUser }: Props) {
  // now we have to consume `likes` too
}
```

The data and the rendering live in different files, so a small piece of UI ends up touching the page and the component at once. On top of that, the page can't render anything until every fetch has resolved. If any of them are slow, everything is slow.

The coupling becomes really painful the moment we want to move things around. Let's say we have a `UserSuggestions` component that just renders whatever it receives:

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

The component itself didn't change, but every new page that wants to use it has to fetch the same data, in the same shape, and thread the same props through every wrapper above it. This is not specific to the App Router: it's the same problem in any loader-based framework. The component is essentially welded to whichever route happens to be fetching its data.

We can work around the slow-loader part with `Promise.all` or by splitting into route segments, but neither addresses the underlying coupling. What we really want is the best of both: data fetching as local as possible, so each component asks for what it needs, and loading orchestration as global as the page, so the page decides where the boundaries are and what the user sees while content loads.

### 3. Async Server Components

[React Server Components](https://react.dev/reference/rsc/server-components) can be `async`. They run on the server, can read from the database directly, and never execute in the browser. There is no API boundary, no client roundtrip, and no `useEffect`. If a component needs a piece of data, it can simply ask for it.

For the rest of this post we will use the Next.js App Router as our example, where components are server-first by default: every component is a server component unless we explicitly mark it with `"use client"`. The patterns themselves are not specific to Next.js, but the App Router is where most developers encounter RSCs today.

This is what lets us keep the local data fetching pattern from the [`useEffect` approach](#1-local-data-fetching), where each component asks for what it needs, while still running everything on the server like with [loaders](#2-route-level-loaders). The component fetches its own data, but that fetch happens during server rendering, not in a client-side `useEffect`. There is no extra roundtrip and no JavaScript dependency. The result is sent to the client as rendered HTML.

Instead of the page fetching everything and passing it down, each component fetches what it needs based on minimal props, usually just an identifier. The component is self-contained: the consumer passes the minimum it needs to know (often just an ID or a handle), and the component resolves whatever else it requires internally. Let's say we take the `UserSuggestions` component from the [loader example](#2-route-level-loaders), which had to receive `users` and `currentUser` as props from the page:

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

As a server component, it doesn't need any of those props. It can resolve the current user and fetch the suggestions itself:

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

Dropping this into any page is just one tag. No props to thread, no data to fetch upstream. The component we had to rewire across two pages earlier is now freely portable.

The same principle applies deeper in the tree. A `UserAvatar` can take just a handle and resolve everything it needs internally:

```tsx
export async function UserAvatar({ handle }: { handle: string }) {
  const user = await getUserByHandle(handle);
  return (
    <div className={user.avatarColor}>
      {user.displayName.charAt(0).toUpperCase()}
    </div>
  );
}
```

The consumer never has to know what data the avatar actually needs. And these components compose freely:

```tsx
export async function Post({ id }: { id: string }) {
  const post = await getPost(id);
  return (
    <article>
      <UserAvatar handle={post.authorHandle} />
      <PostBody body={post.body} />
      <PostActions postId={id} />
    </article>
  );
}
```

`Post` takes an ID and fetches what it needs. It composes `UserAvatar`, which in turn fetches its own data. The page that renders `<Post id={id} />` doesn't know or care about any of this. Each component is responsible for its own data, and composition works the way React has always intended.

You might be worried about duplicate fetches at this point. The same `getUserByHandle` could be called from `UserAvatar`, from a `UserRow` next to it, and from the post's author link in the header, all on the same render. React's [`cache()`](https://react.dev/reference/react/cache) function deduplicates these per request, so calling it ten times with the same argument hits the database once. This is similar to what React Query's centralized cache does on the client, but built into the server render itself. I covered this in more depth in my previous post on [Avoiding Server Component Waterfall Fetching with React 19 cache()](/posts/avoiding-server-component-waterfall-fetching-with-react-19-cache). The local-fetching pattern is only really practical because of this deduplication. Once we have it, asking for data wherever we need it is essentially free.

## Architecting with Server Components

So we have components that fetch their own data, run on the server, and compose freely. The individual pieces work. But what does the page itself look like once we commit to this? What happens to loading states, file organization, and client interactivity when the page is no longer responsible for fetching data?

### The Page as Composition

This is the part where it all comes together. Once components own their data, the page's job becomes mostly structural. It lays out which components go where, decides which ones share a loading boundary, and provides the fallback UI. The page itself doesn't even have to be `async`, because it isn't doing any data work:

```tsx
export default function HomePage() {
  return (
    <Layout>
      <Sidebar />
      <main>
        <PageHeader title="Home" />
        <Suspense fallback={<PostListSkeleton />}>
          <Feed />
        </Suspense>
      </main>
      <Aside>
        <Suspense fallback={<UserSuggestionsSkeleton />}>
          <UserSuggestions />
        </Suspense>
        <Suspense fallback={<TrendingTagsListSkeleton />}>
          <TrendingTagsList />
        </Suspense>
      </Aside>
    </Layout>
  );
}
```

This is really the heart of the pattern, and the discovery we have been working toward. The page reads almost like a description of the user experience: a sidebar in the static shell, a header that is always there, a feed that may take a moment to load, and two aside sections that stream independently. Each `Suspense` boundary is a deliberate decision about what should be visible immediately and what can stream in. The result feels much more like an SPA than a traditional server-rendered page, without us pushing all the data to the client to get there.

Notice what's gone. There is no `getCurrentUser` at the top, no waiting for the feed before rendering the header, and no prop drilling. If `UserSuggestions` decides next week that it also wants to show mutual followers per user, that change happens entirely inside the feature: a tweak to the query, a tweak to the row component, no upstream coordination. The page itself doesn't change.

This is also where the loading experience gets designed instead of being emergent. Suspense lets us say something like: "the feed and the sidebar lists stream independently, but everything inside each one appears together". That is the opposite of *popcorn UI*. The user sees structure first, and then sees each region resolve as a coherent unit. If we want the entire above-the-fold to appear at once, we put one Suspense around it. If we want the feed to stream item-by-item, we move the boundary deeper. The page makes those decisions.

The same composition model extends to other concerns the page wants to coordinate. An `ErrorBoundary` next to a `Suspense` lets us decide what happens when a region fails: instead of taking down the whole page, the failure stays inside its boundary and we render a recovery UI in place. A `ViewTransition` wrapper lets us animate one region between renders without affecting the rest. The page becomes the place where all of these concerns are described together:

```tsx
<ErrorBoundary fallback={<FeedError />}>
  <Suspense fallback={<PostListSkeleton />}>
    <ViewTransition>
      <Feed />
    </ViewTransition>
  </Suspense>
</ErrorBoundary>
```

It's the same idea as Suspense at a different layer. Composable wrappers let the page decide what happens when a region is loading, what happens when it fails, and how it animates, all without the components themselves having to know.

### Co-locating Skeletons

The fallback shape matters as much as the boundary placement. A skeleton has to match the layout of the thing it is standing in for, otherwise the page jumps when the real content arrives. The best way to keep them in sync is to export the skeleton from the same file as the component it represents:

```tsx
// features/post/components/post.tsx
export async function Post({ post }: { post: PostT }) {
  // ...
}

export function PostListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <article>
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full" />
          </article>
        </li>
      ))}
    </ul>
  );
}
```

Pages then import both from the same place:

```tsx
import { Post, PostListSkeleton } from "@/features/post/components/post";
```

This is more than just a tidy import statement. When we edit `Post` to add a new line of metadata or change the avatar size, the skeleton is right there in the same file. We can't really miss it. Drift between the loading state and the rendered state, which is the most common cause of layout jank, gets caught at the time the change is made instead of in a QA pass later.

This is also one of the reasons AI coding agents work so well with React's composition model. When components are self-contained and skeletons live in the same file, an agent can move a component to a new page, update its skeleton, or compose it into a different layout without touching anything outside the file it's working in.

The same applies to compound shapes. A `UserSuggestions` exports `UserSuggestionsSkeleton`, a `TrendingTagsList` exports `TrendingTagsListSkeleton`. The page picks which one to use as a `Suspense` fallback, and the feature is responsible for keeping the two in sync. It's composition all the way down: the page composes a loading UI out of skeletons, the same way it composes a rendered UI out of components.

### Where Things Go

Something we may have already noticed along the way is that this architecture quietly answers the question of where to put a new piece of code. Once components fetch their own data, queries, actions, and components naturally cluster together by domain, and the folder structure ends up reflecting that:

```
features/
  post/
    post-queries.ts
    post-actions.ts
    components/
      post.tsx         // <Post /> + <PostListSkeleton />
      feed.tsx         // <Feed />
      composer.tsx     // <PostComposer /> ("use client")
  user/
    user-queries.ts
    user-actions.ts
    components/
      user-avatar.tsx  // <UserAvatar /> + <UserAvatarSkeleton />
      user-suggestions.tsx
      follow-button.tsx ("use client")
```

A new query lives next to the other queries for that domain. A new action lives next to the existing actions, alongside the query whose cache it invalidates. A new component goes into `components/` and pulls from those queries directly. Anyone (human or agent) coming into the codebase can locate the right file without much hunting, and a refactor that moves a component to a new page doesn't touch anything outside its feature folder.

This isn't strict feature slicing, and we don't need a methodology to follow it. The structure falls out of the pattern: a component that owns its data wants to live near the query it calls, and the query wants to live near the action that invalidates its cache. Pages stay thin because they don't import data, they import components.

### Client Islands

The composition style holds when we need interactivity too. A common worry with RSCs is that the moment we need client behavior, we are back in client-land for the whole tree, but that's not actually the case. A `"use client"` component lives wherever JavaScript actually has to run, usually a leaf like a button, a tab switcher, or a form. It doesn't pull the rest of the tree client-side.

```tsx
"use client";

import { useRouter } from "next/navigation";

export function FeedTabs({ active }: { active: "following" | "discover" }) {
  const router = useRouter();
  return (
    <Tabs
      tabs={[
        { label: "Following", value: "following" },
        { label: "Discover", value: "discover" },
      ]}
      active={active}
      action={value => router.push(value === "following" ? "/" : "/?tab=discover")}
    />
  );
}
```

This sits next to the server-rendered feed in the same feature folder. The page renders both, and from the page's point of view there is no real distinction:

```tsx
<Suspense fallback={<TabsSkeleton />}>
  <FeedTabs active={tab} />
</Suspense>
<Suspense fallback={<PostListSkeleton />}>
  <Feed tab={tab} />
</Suspense>
```

My previous blog post on [server and client component composition in practice](/posts/server-client-component-composition-in-practice) covers this in more depth: client wrappers take server components as children, server components stay server, and our JS bundles stay small. The architecture in this post simply continues that pattern at the page level.

## A Note on Cache Components

This architecture pays off even more once we turn on `cacheComponents` in Next.js 16. With it enabled, anything that fetches dynamic data has to live behind a `Suspense` boundary, and everything outside those boundaries becomes part of the static shell that can be prerendered and served instantly. The constraint sounds aggressive, but it's exactly the discipline we have already been applying: components fetch their own data, pages place deliberate Suspense boundaries, and we choose what shows up immediately versus what streams.

The benefit is that the static shell gets larger and the dynamic regions get smaller and more intentional. We are no longer relying on convention to keep the loading experience coherent. The framework refuses to build the app unless we have decided where the boundaries are. It's the same architecture either way, but `cacheComponents` makes it the only architecture, which is what we want for a snappy, app-like feel by default. None of this is mandatory to get the benefits in this post, but it's the natural next step once we are committed to this style.

## Conclusion

The trip from `useEffect` to React Query to loaders to RSCs has really been about resolving the same tension. Components want to own their data so they can compose freely, but the page wants to own the loading experience so it doesn't fragment. Every step before RSCs forced us to pick one and give up the other. RSCs combined with Suspense finally give us both. Components ask for the data they need, share a per-request cache, and stream into deliberate boundaries that the page controls. Skeletons live next to the things they represent.

If you are still reflexively writing `async function Page` and `await`ing five queries at the top, consider trying the inversion. Push the data fetches into the components that use them, make the page non-async, and let Suspense handle the orchestration. The components get smaller, the page gets clearer, and the user gets a faster, more coherent first paint.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
