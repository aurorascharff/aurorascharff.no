---
author: Aurora Scharff
pubDatetime: 2026-08-13T10:00:00Z
title: Building Reliable Optimistic Interactions in Next.js
slug: building-reliable-optimistic-interactions-in-nextjs
featured: false
draft: true
tags:
  - Next.js 16
  - React 19
  - Async React
  - useActionState
  - useOptimistic
  - Server Functions
description: Learn how I combine useActionState, useOptimistic, and a shared reducer to keep rapid mutations responsive and ordered in Huddle and Flow.
---

I've recently been sharing [Building SPA-like experiences with Next.js](https://x.com/aurorascharff/status/2087171648247988705), a series about keeping reads and writes on the server while client interactions stay responsive.

This post expands on a mutation pattern I use in [Huddle](https://next16-team-chat.vercel.app/) and [Flow](https://next16-calendar.vercel.app/). It handles interactions where someone changes the same state again before the previous write finishes. In Huddle, that might mean moving a channel again before the previous move reaches the database. In Flow, it might mean creating an event and immediately moving or resizing it.

The interface needs to follow every change right away, while the server still saves them in order. I combine `useActionState`, `useOptimistic`, and a shared reducer to do both. The [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions) shows the pattern with a small to-do list. Rather than repeat that example here, let's see how it works in these two apps.

## Table of contents

## Building the Pattern

Let's use the channel layout in Huddle as an example. People can move channels, create groups, rename them, delete them, and change their order. Any of those interactions can happen again while the previous layout is still saving.

### Starting with a Transition

We can start by saving each new layout in a Transition:

```tsx
const [isPending, startTransition] = useTransition();

function saveChange(nextGroups: LayoutGroup[]) {
  startTransition(async () => {
    await saveChannelLayout(nextGroups);
  });
}
```

The Transition keeps the interface responsive while the Server Function runs, and `isPending` lets us show that a save is in progress.

This works until someone changes the layout again before the first save finishes. Both requests run at the same time, so the second save can finish first. When the older request finishes, it writes an outdated layout over the newer one.

We could disable the controls while `isPending` is true, but that would make dragging and editing the sidebar feel slow. Instead, we need each save to start from the result of the previous one.

### Queueing Changes with useActionState

`useActionState` can queue the saves for us. Rather than dispatching a complete layout, we can dispatch a description of what changed:

```ts
export type LayoutChange =
  | {
      type: "move";
      channelId: string;
      toGroup: string;
      toIndex: number;
    }
  | { type: "addGroup"; name: string }
  | { type: "renameGroup"; from: string; to: string }
  | { type: "deleteGroup"; name: string }
  | {
      type: "moveGroup";
      name: string;
      direction: "up" | "down";
    };
```

We can update `saveChannelLayout` to receive the previous layout as its first argument, apply the change, and return the saved result. Then we pass it to `useActionState`:

```tsx
const [groups, dispatch, isPending] = useActionState(
  saveChannelLayout,
  initialGroups
);

function runChange(change: LayoutChange) {
  startTransition(() => {
    dispatch(change);
  });
}
```

`useActionState` passes the state returned by each call into the next one. If another change is dispatched while a save is pending, it waits and then receives the latest confirmed layout. The saves no longer race each other.

Since these changes start in event handlers, we need to wrap `dispatch` in `startTransition`. A function passed to an Action prop, such as `<form action={...}>`, already runs in a transition.

We have fixed the order of the saves, but the rendered `groups` only update when the Server Function returns. Rapid changes now wait in the queue, so the interface still falls behind the interaction.

### Applying Changes with useOptimistic

`useOptimistic` can show each queued change immediately, but it needs a synchronous function that can apply a `LayoutChange` to the current groups. The Server Function already contains that update logic, so we can move it into a pure [`applyLayoutChange`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/utils/channel-layout-reducer.ts) reducer with the shape `(groups: LayoutGroup[], change: LayoutChange) => LayoutGroup[]`.

The individual cases are specific to Huddle. The reducer itself only needs the current state and a change, so the client and server can both call it.

Now we can pass `groups` and `applyLayoutChange` to `useOptimistic`, then apply the optimistic change before dispatching the save:

```tsx
const [groups, dispatch] = useActionState(saveChannelLayout, initialGroups);
const [optimisticGroups, addOptimistic] = useOptimistic(
  groups,
  applyLayoutChange
);

function runChange(change: LayoutChange) {
  startTransition(() => {
    addOptimistic(change);
    dispatch(change);
  });
}
```

The sidebar renders `optimisticGroups`, so each change appears immediately while `dispatch` adds it to the save queue. When a save finishes, `groups` advances to the confirmed state and React reapplies any pending changes on top of it.

Finally, the [`saveChannelLayout`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/channel-actions.ts) Server Function can use the same reducer before writing the result:

```ts
// features/channel/channel-actions.ts
"use server";

export async function saveChannelLayout(
  groups: LayoutGroup[],
  change: LayoutChange
): Promise<LayoutGroup[]> {
  const user = await verifyAuth();
  const next = applyLayoutChange(groups, change);

  await reorderChannels(user.id, toLayoutPayload(next));
  updateTag(channelTags.user(user.id));

  return next;
}
```

Although this example uses a channel layout, none of the hook setup depends on channels or groups. `groups` is the confirmed state, `LayoutChange` describes an update, and `applyLayoutChange` calculates the next state. The same reducer runs optimistically on the client and against the confirmed state on the server.

The queue belongs to this instance of `ChannelNav`. It orders changes made in this interaction, but writes from another tab, device, or session still need concurrency rules in the data layer.

**Try it:** [move a channel between groups in Huddle](https://next16-team-chat.vercel.app/), then move it again before the first save finishes. **Code:** [`channel-nav.tsx`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx).

## Scaling the Pattern Across the Calendar

Huddle keeps the interaction inside `ChannelNav`. [Flow](https://next16-calendar.vercel.app/) is split across the tree: Server Components fetch events, calendar views render them, and controls elsewhere create, move, resize, and delete them. I moved the queue into context so those pieces could share it without moving the events themselves into client state.

React's [scaling a reducer with context](https://react.dev/learn/scaling-up-with-reducer-and-context) guide separates the current state from the dispatch function. I used the same approach in my earlier post on [using `useOptimistic` across the component tree](/posts/utilizing-useoptimistic-across-the-component-tree-in-nextjs). Here the provider owns the `useActionState` queue as well.

The [`CalendarEventsProvider`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx) also uses `useActionState` and `useOptimistic`, but its state is not the event list. The events still come from Server Components. The provider only holds the changes that have not been reflected in that server data yet:

```tsx
// providers/calendar-events-provider.tsx
"use client";

import {
  addPendingChange,
  applyEventChanges,
  noPendingChanges,
  type EventChange,
} from "@/features/calendar/utils/event-optimistic-reducer";

// ...React imports, the context types, and the CalendarEvent type...

const CalendarEventsStateContext =
  createContext<CalendarEventsStateContextValue | null>(null);
const CalendarEventsDispatchContext =
  createContext<CalendarEventsDispatchContextValue | null>(null);

// ...saveChange calls the right Server Function and shows a toast...
export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const [changes, dispatch, isPending] = useActionState(
    saveChange,
    noPendingChanges
  );
  const [optimisticChanges, addOptimisticChange] = useOptimistic(
    changes,
    addPendingChange
  );

  const mutate = useCallback(
    (change: EventChange) => {
      startTransition(() => {
        addOptimisticChange(change);
        dispatch(change);
      });
    },
    [addOptimisticChange, dispatch]
  );
  const getEvents = useCallback(
    (events: CalendarEvent[], days: string[]) =>
      applyEventChanges(events, optimisticChanges, days),
    [optimisticChanges]
  );
  const contextValue = useMemo(
    () => ({ getEvents, isPending }),
    [getEvents, isPending]
  );

  return (
    <CalendarEventsStateContext.Provider value={contextValue}>
      <CalendarEventsDispatchContext.Provider value={mutate}>
        {children}
      </CalendarEventsDispatchContext.Provider>
    </CalendarEventsStateContext.Provider>
  );
}

export function useCalendarEvents() {
  const context = useContext(CalendarEventsStateContext);
  if (!context) {
    throw new Error(
      "useCalendarEvents must be used within CalendarEventsProvider"
    );
  }
  return context;
}

// ...useCalendarEventsDispatch reads the dispatch context the same way...
```

The optimistic reducer appends each change to the list. The queued function saves one change and returns an empty list, letting the optimistic overlay clear as revalidated events arrive from the server.

Calendar views call `useCalendarEvents()` and apply whatever is still pending to the events they received from the server. Mutation controls call `useCalendarEventsDispatch()` to start a change. I keep those in separate contexts so a control that only dispatches does not re-render for every optimistic update.

**Try it:** [create an event in Flow](https://next16-calendar.vercel.app/), then move or resize it before the first save finishes. **Code:** [`calendar-events-provider.tsx`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## Choosing Between Context and a Server-State Library

In Flow, the provider shares the event mutation queue. Controls dispatch into it, calendar views render against it, and the event list still comes from Server Components. That is narrow enough that I do not need to turn the provider into a browser cache.

The trade-off changes when Client Components coordinate several kinds of server state. Once a custom provider needs cache identities, request deduplication, and revalidation, it is becoming a server-state library. TanStack Query and SWR already own those concerns.

Huddle has more client-side server state. On its main branch I use TanStack Query for the messages, unread state, activity, and their mutations, and I keep an SWR branch of the same app. The [Next.js client-side data fetching guide](https://nextjs.org/docs/app/guides/client-side-data-fetching) covers both, including how they can take initial data from Server Components and keep managing it in the browser.

My dividing line is ownership. I reach for context when one interaction model needs to be shared within a subtree. When the browser owns several resources with separate revalidation and mutation behavior, I use a client data-fetching library.

## Conclusion

Most mutations do not need all of this. I reach for the pattern when someone can change the same state again before the first write finishes, and when those changes depend on one another.

What I like about it is that the interface and the server do not need separate stories. A pure reducer describes each change once. `useOptimistic` applies it to what the person sees, and `useActionState` applies it to the confirmed result in order. The hooks can stay in one component, as they do in Huddle, or move into a provider when the interaction stretches across the tree, as it does in Flow.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
