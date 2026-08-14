---
author: Aurora Scharff
pubDatetime: 2026-08-13T10:00:00Z
title: Coordinating Optimistic Updates in Next.js
slug: coordinating-optimistic-updates-in-nextjs
featured: false
draft: true
tags:
  - Next.js 16
  - React 19
  - Async React
  - useActionState
  - useOptimistic
  - Server Functions
description: Learn how I combine useActionState and useOptimistic to keep rapid mutations responsive and ordered in Huddle and Flow.
---

I've recently been sharing [how to build SPA-like experiences with Next.js](https://x.com/aurorascharff/status/2087171648247988705), keeping reads and writes on the server while client interactions stay responsive. Throughout the series, I've been using two demo apps to show what these patterns look like. In [Huddle](https://next16-team-chat.vercel.app/), you can move channels and create, rename, delete, and reorder groups. In [Flow](https://next16-calendar.vercel.app/), you can create, move, resize, and delete events.

These async interactions do not always finish in the order they started. This is a common problem on the web, and frameworks solve it in different ways. [Remix](https://v2.remix.run/docs/discussion/concurrency) cancels superseded requests, while [Solid Router](https://docs.solidjs.com/solid-router/concepts/actions) tracks pending submissions. In React, we can solve this by combining `useActionState` and `useOptimistic`.

When `useOptimistic` was new, I explored [using it across the component tree](/posts/utilizing-useoptimistic-across-the-component-tree-in-nextjs). Coming from React Query, I was used to putting optimistic state in a shared client cache. Flow returns to that question with the current Action APIs.

In this post, we'll start with the optimistic update approach from the [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions), apply it to Huddle's channel sidebar, then move the update queue into context for Flow's event board. The goal is for overlapping changes to appear immediately, save in order, and roll back automatically when a write fails.

## Table of contents

## Building an Optimistic Channel Sidebar in Huddle

[Huddle](https://next16-team-chat.vercel.app/) is a Slack-like team chat app with a workspace rail, a channel sidebar, and the current channel. The workspace layout looks like this:

```tsx
// app/(workspace)/layout.tsx
<WorkspaceRail />
<ChannelSidebar>
  <WorkspaceNav />
  <SearchButton />
  <ChannelList />
</ChannelSidebar>
<main>{children}</main>
```

We are going to focus on `ChannelList`. It loads the channel groups in a Server Component and passes them to a `ChannelNav` Client Component. In the sidebar, you can move channels between groups or create, rename, delete, and reorder the groups. We want to save those changes to the database without blocking the next interaction.

### Saving the Channel Layout in a Transition

We can put the database write in a [Server Function](https://react.dev/reference/rsc/server-functions). The `"use server"` directive marks `saveChannelLayout` as a Server Function, so `ChannelNav` can import and call it from an event handler while the authentication and database code run on the server. The first version receives the complete next layout:

```ts
// channel-actions.ts
"use server";

export async function saveChannelLayout(groups: LayoutGroup[]) {
  const user = await verifyAuth();

  await reorderChannels(user.id, toLayoutPayload(groups));
  updateTag(channelTags.user(user.id));
}
```

We can call the Server Function inside a Transition:

```tsx
// channel-nav.tsx
const [isPending, startTransition] = useTransition();

function saveChange(nextGroups: LayoutGroup[]) {
  startTransition(async () => {
    await saveChannelLayout(nextGroups);
  });
}
```

The `isPending` value lets us show that a save is in progress while the controls remain interactive.

But there's a problem with this approach. If someone makes another change before the first save finishes, both requests run at the same time. The second request can finish first, then the older request writes an outdated layout over it.

The React docs describe this as [out-of-order Transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order). Actions inside a Transition do not guarantee execution order.

We could disable the controls while `isPending` is true, but that would make dragging and editing the sidebar feel slow. Instead, we can keep the sidebar interactive and put the saves in order with `useActionState`.

### Ordering Layout Saves with useActionState

The [`useActionState` hook](https://react.dev/reference/react/useActionState) creates state from the result of an Action and queues calls to that Action. Its API has this shape:

```tsx
const [state, dispatchAction, isPending] = useActionState(
  async (previousState, actionPayload) => {
    // ...run the side effect...
    return nextState;
  },
  initialState
);
```

The callback can be async and perform side effects. It receives the previous state first, then the value we pass to `dispatchAction`. React uses its return value as `state` and passes that state to the next call as `previousState`. The `isPending` value stays true while the queue is running.

Let's keep sending the complete next layout for now, and apply this API to Huddle:

```tsx
// channel-nav.tsx
export function ChannelNav({
  groups: initialGroups,
}: {
  groups: LayoutGroup[];
}) {
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

  // ...render groups...
}
```

This version ignores `_previousGroups` because it still receives a complete layout in `nextGroups`. React still waits for one call to finish before starting the next, so the ordering comes from `useActionState` itself.

Within this hook, an older request can no longer finish after a newer one. Since we call `saveGroups` from an event handler, we still wrap it in `startTransition`. When we pass a function to an Action prop, such as `<form action={...}>`, React already runs it in a Transition.

However, a queued snapshot does not automatically build on the snapshot before it. If another interaction happens while the first save is pending, the component can calculate `nextGroups` from the older layout and leave out the first change.

### Dispatching Layout Changes

The action's first argument gives us the last saved layout, so we can use it to make queued changes build on one another. Instead of having the `ChannelNav` component calculate a complete `LayoutGroup[]`, we can dispatch a `LayoutChange` describing the interaction.

The Server Function now needs to calculate the complete layout from the previous groups and that change. We can [extract the layout update into a reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer) so this state logic stays in one pure function.

The reducer receives the previous groups and a change, then returns the next layout:

```ts
// channel-layout-reducer.ts
export function channelLayoutReducer(
  groups: LayoutGroup[],
  change: LayoutChange
): LayoutGroup[] {
  switch (change.type) {
    case "move": {
      const next = groups.map(group => ({
        ...group,
        channels: group.channels.filter(
          channel => channel.id !== change.channelId
        ),
      }));
      const moved = groups
        .flatMap(group => group.channels)
        .find(channel => channel.id === change.channelId);
      const target = next.find(group => group.name === change.toGroup);

      if (!moved || !target) return groups;

      const index = Math.max(
        0,
        Math.min(change.toIndex, target.channels.length)
      );
      target.channels.splice(index, 0, moved);
      return next;
    }
    // ...handle the remaining LayoutChange types...
    default:
      return groups;
  }
}
```

The cases start from the previous groups and return the next layout without changing the input. The `move` case shows the pattern, and the linked file contains the remaining group changes.

The `saveChannelLayout` Server Function can now apply the incoming change to the last saved groups before writing the resulting layout. It returns that layout, which React passes to the next Action as its previous state:

```ts
// channel-actions.ts
"use server";

import { updateTag } from "next/cache";
import { channelTags } from "@/features/channel/channel-cache";
import { reorderChannels } from "@/features/channel/channel-queries";
import {
  channelLayoutReducer,
  type LayoutChange,
  type LayoutGroup,
  toLayoutPayload,
} from "@/features/channel/utils/channel-layout-reducer";
import { verifyAuth } from "@/features/user/user-queries";

export async function saveChannelLayout(
  groups: LayoutGroup[],
  change: LayoutChange
): Promise<LayoutGroup[]> {
  const user = await verifyAuth();
  const next = channelLayoutReducer(groups, change);

  await reorderChannels(user.id, toLayoutPayload(next));
  updateTag(channelTags.user(user.id));

  return next;
}
```

We can pass the Server Function directly to `useActionState` and dispatch the interactions:

```tsx
import { startTransition, useActionState } from "react";
import { saveChannelLayout } from "@/features/channel/channel-actions";
import type { LayoutChange } from "@/features/channel/utils/channel-layout-reducer";

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

This fixes the ordering problem. A save waits for the previous one and starts from its result.

However, the sidebar still renders `groups`, which only updates after the Server Function finishes. Moving a channel would wait for the database write before appearing in the interface. Let's show the change immediately while the queue runs.

### Showing Layout Changes with useOptimistic

The [`useOptimistic` hook](https://react.dev/reference/react/useOptimistic) lets us render temporary state while an Action is pending. We can pass it the confirmed state on its own, or provide a second function argument that calculates the optimistic state:

```tsx
const [optimisticState, addOptimistic] = useOptimistic(
  state,
  (currentState, optimisticValue) => {
    return nextState;
  }
);
```

When we call `addOptimistic(optimisticValue)` inside an Action, React passes the current optimistic state and that value to the update function. Its return value becomes `optimisticState` while the Action runs. If the confirmed `state` changes during that time, React calls the function again with the new state.

In Huddle, `groups` is the confirmed state, and `channelLayoutReducer` already accepts the two arguments `useOptimistic` provides. We can pass it directly to the hook, then dispatch the same `LayoutChange` to both hooks:

```tsx
import { startTransition, useActionState, useOptimistic } from "react";
import { saveChannelLayout } from "@/features/channel/channel-actions";
import {
  channelLayoutReducer,
  type LayoutChange,
} from "@/features/channel/utils/channel-layout-reducer";

const [groups, dispatch, isPending] = useActionState(
  saveChannelLayout,
  initialGroups
);
const [optimisticGroups, addOptimistic] = useOptimistic(
  groups,
  channelLayoutReducer
);

function runChange(change: LayoutChange) {
  startTransition(() => {
    addOptimistic(change);
    dispatch(change);
  });
}
```

Rendering `optimisticGroups` makes the sidebar change immediately. The `useOptimistic` hook applies the `LayoutChange` to what is currently on screen, while `useActionState` applies the same change to the confirmed groups when it reaches the front of the queue.

While the Transition is running, `optimisticGroups` contains the temporary layout. When it finishes, `useOptimistic` returns the confirmed `groups`. If the save succeeds, those groups contain the same change, so the sidebar stays where it is. React commits the optimistic and confirmed layouts together without a separate render to clear the temporary state.

### Rolling Back Failed Layout Changes

A save can still fail. We can catch the error inside the callback we pass to `useActionState`, show a toast, and return the previous groups:

```tsx
import { toast } from "sonner";
import { saveChannelLayout } from "@/features/channel/channel-actions";
import type {
  LayoutChange,
  LayoutGroup,
} from "@/features/channel/utils/channel-layout-reducer";

const [groups, dispatch] = useActionState(
  async (groups: LayoutGroup[], change: LayoutChange) => {
    try {
      return await saveChannelLayout(groups, change);
    } catch {
      toast.error("Could not save channel layout. Try again.");
      return groups;
    }
  },
  initialGroups
);
```

If the save fails, the callback returns the previous groups. When the Transition finishes, `useOptimistic` renders those groups again, so the sidebar moves back to the last successfully saved layout. We do not need to calculate and dispatch a reverse `LayoutChange`.

**Try it:** [move a channel between groups in Huddle](https://next16-team-chat.vercel.app/), then move it again before the first save finishes. **Code:** [`channel-nav.tsx`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx).

## Building an Optimistic Event Board in Flow

[Flow](https://next16-calendar.vercel.app/) is a calendar and booking-link app with week and month views. The part we are working on is the calendar page, which has a header and a week or month event board:

```tsx
// app/(workspace)/calendar/[date]/page.tsx
<main>
  <CalendarHeader date={date} view={calendarView} />
  {calendarView === "month" ? (
    <CalendarMonth date={date} />
  ) : (
    <CalendarWeek date={date} />
  )}
</main>
```

The week and month components fetch their events in Server Components. We want creates, moves, resizes, updates, and deletes to appear immediately and save in order. Let's start by keeping that state inside `CalendarBoard`, where the server events are already available as props.

### Queuing Event Saves in CalendarBoard

Instead of dispatching a `LayoutChange`, Flow dispatches an `EventChange` that describes what happened. The `saveEventChange` Server Function routes that change to the matching database write. We can call it from `useActionState` inside the board:

```tsx
// features/calendar/components/calendar-board.tsx
export function CalendarBoard({
  days,
  events,
}: {
  days: string[];
  events: CalendarEvent[];
}) {
  const [, dispatch, isPending] = useActionState(
    async (_: void, change: EventChange) => {
      const result = await saveEventChange(change);
      if (result.error) toast.error(result.error);
    },
    undefined
  );

  function mutate(change: EventChange) {
    startTransition(() => {
      dispatch(change);
    });
  }

  // ...render events and pass mutate to the interactions...
}
```

React queues these callbacks and waits for one to finish before starting the next. Since the callback returns nothing, the first argument remains `undefined`.

This differs from Huddle. The channel sidebar keeps its confirmed layout in `useActionState`, so the layout reducer runs in both hooks. Flow receives confirmed events from the week and month Server Components. It uses `useActionState` to order the saves and `useOptimistic` to keep track of the pending event changes.

### Applying Event Changes with useOptimistic

Flow needs to remember the changes that are still waiting to be saved. If we move an event and then resize it before the first save finishes, the optimistic UI needs to apply both changes. We can give `useOptimistic` a reducer that receives the current list and appends the new `EventChange`:

```tsx
// features/calendar/utils/pending-changes-reducer.ts
function pendingChangesReducer(
  changes: EventChange[],
  change: EventChange
): EventChange[] {
  return [...changes, change];
}

const [optimisticChanges, addOptimisticChange] = useOptimistic(
  [],
  pendingChangesReducer
);
```

After those interactions, `optimisticChanges` contains the move followed by the resize. This list does not replace the events. It records the changes that we still need to apply to the confirmed events from the Server Component.

Back in `CalendarBoard`, we can apply that list to the `events` prop and dispatch the optimistic change with the save:

```tsx
// features/calendar/components/calendar-board.tsx
export function CalendarBoard({
  days,
  events,
}: {
  days: string[];
  events: CalendarEvent[];
}) {
  const [, dispatch, isPending] = useActionState(
    async (_: void, change: EventChange) => {
      const result = await saveEventChange(change);
      if (result.error) toast.error(result.error);
    },
    undefined
  );
  const [optimisticChanges, addOptimisticChange] = useOptimistic(
    [],
    pendingChangesReducer
  );

  const optimisticEvents = applyEventChanges(events, optimisticChanges, days);

  function mutate(change: EventChange) {
    startTransition(() => {
      addOptimisticChange(change);
      dispatch(change);
    });
  }

  // ...render optimisticEvents...
}
```

The `applyEventChanges` function runs the changes in order, so another move or resize starts from the optimistic event already on screen. This works while `CalendarBoard` owns the interactions.

However, Flow also has `CalendarMonthBoard`, and the `NewEventButton` lives in the header. Those components need to read or change the same optimistic state. We can move the hooks and `mutate` into context instead of passing them through the calendar tree.

### Moving the Event Queue into Context

We can create a `CalendarEventsProvider` Client Component and wrap the calendar header and event board with it:

```tsx
// app/(workspace)/calendar/[date]/page.tsx
<CalendarEventsProvider>
  <CalendarHeader date={date} view={calendarView} />
  {calendarView === "month" ? (
    <CalendarMonth date={date} />
  ) : (
    <CalendarWeek date={date} />
  )}
</CalendarEventsProvider>
```

Inside the provider, we can put the hooks, `mutate`, and `getEvents` together. React recommends [separating state and dispatch into different contexts](https://react.dev/learn/scaling-up-with-reducer-and-context). Calendar views need `getEvents` and `isPending`, while controls only need `mutate`:

```tsx
// providers/calendar-events-provider.tsx
export function CalendarEventsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [, dispatch, isPending] = useActionState(
    async (_: void, change: EventChange) => {
      const result = await saveEventChange(change);
      if (result.error) toast.error(result.error);
    },
    undefined
  );
  const [optimisticChanges, addOptimisticChange] = useOptimistic(
    [],
    pendingChangesReducer
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
```

Controls get `mutate` through `useCalendarEventsDispatch`. For example, the event popover dispatches a delete change:

```tsx
// features/calendar/components/event-popover.tsx
const mutate = useCalendarEventsDispatch();

function remove() {
  mutate({ sourceId: event.sourceId, type: "delete" });
}
```

The boards use `useCalendarEvents` to apply the changes before rendering the server events:

```tsx
// features/calendar/components/calendar-month-board.tsx
const { getEvents } = useCalendarEvents();
const visibleEvents = getEvents(events, days).filter(
  event => !hidden.has(event.calendarId)
);
```

### Rolling Back Failed Event Changes

When a write fails, we want to show an error and restore the last server result. We can handle the toast inside the `useActionState` callback without returning event state:

```tsx
const [, dispatch] = useActionState(async (_: void, change: EventChange) => {
  const result = await saveEventChange(change);
  if (result.error) toast.error(result.error);
}, undefined);
```

If the write returns an error, the server data has not changed. The optimistic change stays visible while the queued Actions are pending. When the Transition completes, `useOptimistic` returns its base value, the empty change list, in the same commit. The `getEvents` function then applies nothing to the server events, so the event returns to its previous position.

**Try it:** [move a demo calendar event in Flow](https://next16-calendar.vercel.app/). Notice the error toast and how the event moves back to its saved position. **Code:** [`calendar-events-provider.tsx`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## When to Reach for a Client Data Library

The hooks are enough for Huddle's channel layout and Flow's calendar events. Huddle also has messages, unread state, activity, and their mutations. I use a client data library for that part of the app instead of building more providers. The app has equivalent [TanStack Query](https://github.com/aurorascharff/next16-team-chat/tree/main) and [SWR](https://github.com/aurorascharff/next16-team-chat/tree/swr) implementations.

In the SWR version, the `MessageThread` Server Component loads the messages and seeds the SWR cache under the channel key:

```tsx
// features/message/components/message-thread.tsx
export async function MessageThread({ channelId }: { channelId: string }) {
  // ...load the current user and last read time...
  const messageData = preload(messageKeys.channel(channelId), () =>
    getMessagesForUser(channelId, user.id)
  );

  return (
    <SWRConfig value={{ cacheData: { ...messageData } }}>
      <MessageList
        channelId={channelId}
        currentUserId={user.id}
        lastReadAt={lastReadAt}
      />
    </SWRConfig>
  );
}
```

The client hook reads the same key, so the first render can use the server result. SWR then polls at a ten-second interval:

```tsx
// features/message/hooks/use-messages.ts
export function useSuspenseMessages(channelId: string) {
  return useSWR<Message[]>(messageKeys.channel(channelId), fetchJson, {
    refreshInterval: 10_000,
    revalidateOnMount: false,
    suspense: true,
  });
}
```

The Server Component seeds the first value under the channel key. After hydration, the client hook reads that value and SWR takes over the polling and revalidation in the browser. The [SWR section of the Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#spas-with-swr) explains how the server result becomes fallback data for the client cache.

Components reading the same key share the cached messages. SWR can also deduplicate requests and coordinate optimistic mutations across those components.

You might choose a client data library earlier, depending on your app. The [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications) also shows the equivalent setup with TanStack Query.

## Conclusion

Huddle can use one layout reducer for confirmed and optimistic state because `ChannelNav` owns the layout. Flow keeps its confirmed events in Server Components, so `useActionState` orders the writes while `useOptimistic` collects the pending changes. Moving that queue into context lets the calendar components share it without moving the server events into a client store.

These hooks work well when an interaction has a clear owner. Huddle's messages need a shared cache that stays in sync across the app, which is where SWR or TanStack Query fits better.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
