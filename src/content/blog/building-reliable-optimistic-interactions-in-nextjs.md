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

I've recently been sharing [how to build SPA-like experiences with Next.js](https://x.com/aurorascharff/status/2087171648247988705), keeping reads and writes on the server while client interactions stay responsive.

Async interactions can finish in a different order than they started. This is a common problem in interactive apps, and frameworks handle it differently. [Remix](https://v2.remix.run/docs/discussion/concurrency) cancels superseded requests, while [Solid Router](https://docs.solidjs.com/solid-router/concepts/actions) tracks pending submissions. With React, we can keep dependent changes responsive and ordered with `useActionState` and `useOptimistic`.

I use the same pattern in [Huddle](https://next16-team-chat.vercel.app/) and [Flow](https://next16-calendar.vercel.app/). In Huddle, someone might move a channel again before the previous move reaches the database. In Flow, they might create an event and immediately move or resize it.

## Table of contents

## Building the Pattern

Let's use the channel layout in Huddle as an example. People can move channels, create groups, rename them, delete them, and change their order. Any of those interactions can happen again while the previous layout is still saving.

The [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions) has a smaller version of this example using a to-do list.

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

### Queueing Saves with useActionState

We can first use `useActionState` without changing the shape of the save. The action still receives the complete next layout:

```tsx
const [groups, saveGroups, isPending] = useActionState(
  async (_previousGroups: LayoutGroup[], nextGroups: LayoutGroup[]) => {
    await saveChannelLayout(nextGroups);
    return nextGroups;
  },
  initialGroups
);

function saveChange(nextGroups: LayoutGroup[]) {
  startTransition(() => {
    saveGroups(nextGroups);
  });
}
```

The callback receives the current action state first and the value passed to `saveGroups` second. Whatever it returns becomes `groups` and the first argument for the next call. `initialGroups` is the state before anything has been saved, and `isPending` tells us when the queue is still running.

Calls to the action run in order, so an older save can no longer finish after a newer one. Since we call it from an event handler, we still wrap `saveGroups` in `startTransition`. A function passed to an Action prop, such as `<form action={...}>`, already runs in a Transition.

This fixes the race, but `groups` only updates after `saveChannelLayout` returns. The interface now waits for each save in the queue.

### Turning the Save into an Async Reducer

The first argument to our action is still unused. We can use it by sending a description of the interaction instead of calculating and sending the entire layout:

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

Now [`saveChannelLayout`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/channel-actions.ts) works like an asynchronous reducer. It receives the last saved layout and a change, calculates the next layout, saves it, and returns it:

```ts
export async function saveChannelLayout(
  groups: LayoutGroup[],
  change: LayoutChange
): Promise<LayoutGroup[]> {
  const user = await verifyAuth();
  const next = reduceLayout(groups, change);

  await reorderChannels(user.id, toLayoutPayload(next));
  updateTag(channelTags.user(user.id));

  return next;
}
```

We can pass the Server Function directly to `useActionState` and dispatch each interaction:

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

Each change now starts from the layout returned by the previous save. The queue is correct, but the interface still waits for `groups` to update.

### Updating Immediately with useOptimistic

We can add `useOptimistic` and start by applying a move in the client:

```tsx
const [optimisticGroups, addOptimistic] = useOptimistic(
  groups,
  (currentGroups, change: LayoutChange) => {
    if (change.type === "move") {
      return moveChannel(currentGroups, change);
    }
    return currentGroups;
  }
);

function runChange(change: LayoutChange) {
  startTransition(() => {
    addOptimistic(change);
    dispatch(change);
  });
}
```

Rendering `optimisticGroups` makes channel moves appear immediately while `dispatch` queues the save. But the behavior is already inconsistent: moves update immediately, while adding, renaming, deleting, and reordering groups still wait for the server. Copying those cases into the client would give us two versions of the layout logic that can fall out of sync.

### Sharing One Reducer

Instead, we can move the layout logic into a pure [`applyLayoutChange`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/utils/channel-layout-reducer.ts) function. It takes the current layout and a change, then returns the next layout:

```ts
export function applyLayoutChange(
  groups: LayoutGroup[],
  change: LayoutChange
): LayoutGroup[] {
  // Handle move, add, rename, delete, and reorder changes.
}
```

The client passes that reducer to `useOptimistic`:

```tsx
const [groups, dispatch] = useActionState(saveChannelLayout, initialGroups);
const [optimisticGroups, addOptimistic] = useOptimistic(
  groups,
  applyLayoutChange
);
```

The Server Function uses the same reducer before saving:

```ts
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

Now every change is applied the same way on both sides. The client shows it immediately, the Server Function applies it to the latest confirmed layout, and `useActionState` saves each result in order.

Although this example uses a channel layout, the pattern does not depend on channels or groups. The action describes what happened, the reducer calculates the next state, and the same reducer runs optimistically on the client and against the confirmed state on the server.

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

## When I Use a Client Data Library

The provider works well in Flow because it only coordinates changes to calendar events. Huddle has more moving parts: messages, unread state, activity, and their mutations. There, I use a client data library instead of building providers for all of that. The app has equivalent TanStack Query and SWR implementations.

You might choose a client data library earlier, depending on your app. The [Next.js client-side data fetching guide](https://nextjs.org/docs/app/guides/client-side-data-fetching) shows how to use both TanStack Query and SWR with initial data from Server Components.

## Conclusion

I wanted to share this pattern because it gives you another option for coordinating repeated mutations. It can start in one component and move into context when more of the tree needs it. For more moving parts, a client data library might fit better.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
