---
author: Aurora Scharff
pubDatetime: 2026-08-13T10:00:00Z
title: Coordinating Optimistic Updates in Next.js
slug: coordinating-optimistic-updates-in-nextjs
featured: false
draft: false
tags:
  - Next.js 16
  - React 19
  - Async React
  - useActionState
  - useOptimistic
  - Server Functions
description: Learn how I combine useActionState and useOptimistic to keep rapid mutations responsive and ordered in Huddle and Flow.
---

I've recently been sharing [how to build SPA-like experiences with Next.js](https://x.com/aurorascharff/status/2087171648247988705), using [Next Beats](https://next-beats.dev/), [Drop](https://next16-social-media.vercel.app/), [Flow](https://next16-calendar.vercel.app/), and [Huddle](https://next16-team-chat.vercel.app/) as examples throughout the series. One pattern I have used in Huddle and Flow, but have not covered yet, is coordinating optimistic writes when another interaction starts before the first one finishes. This is a common problem on the web, and frameworks solve it in different ways. [Remix](https://v2.remix.run/docs/discussion/concurrency) cancels superseded requests, while [Solid Router](https://docs.solidjs.com/solid-router/concepts/actions) tracks pending submissions. In React, we can combine `useActionState` and `useOptimistic`.

In this post, we'll start with the optimistic update approach from the [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions) and apply it to Huddle's channel sidebar as an async reducer. Then we'll adapt the pattern for Flow, where Server Components continue to own the confirmed events, and move the optimistic event state into context. The goal is for overlapping changes to appear immediately, save in order, and roll back automatically when a write fails.

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

The part we are going to change is `ChannelNav`. Dragging channels and opening the group menus require event handlers, so this is a Client Component. A trimmed version renders the groups and their channel links:

```tsx
// features/channel/components/channel-nav.tsx
"use client";

export function ChannelNav({ groups }: { groups: LayoutGroup[] }) {
  // ...drag channels and create, rename, delete, or reorder groups...

  return (
    <nav aria-label="Channels">
      {groups.map(group => (
        <div key={group.name}>
          <p>{group.name}</p>
          {group.channels.map(channel => (
            <ChannelLink channel={channel} key={channel.id} />
          ))}
        </div>
      ))}
    </nav>
  );
}
```

### Saving the Channel Layout in a Transition

We can put the database write in a [Server Function](https://react.dev/reference/rsc/server-functions) by marking the file with `"use server"`:

```ts
// channel-actions.ts
"use server";

export async function saveChannelLayout(groups: LayoutGroup[]) {
  const user = await verifyAuth();

  await reorderChannels(user.id, toLayoutPayload(groups));
  updateTag(channelTags.user(user.id));
}
```

The authentication and database code stay on the server, while `ChannelNav` can import `saveChannelLayout` and call it from an event handler. This first version receives the complete next layout.

We can call `saveChannelLayout` inside a Transition:

```tsx
// channel-nav.tsx
export function ChannelNav({ groups }: { groups: LayoutGroup[] }) {
  const [isPending, startTransition] = useTransition();

  function saveChange(nextGroups: LayoutGroup[]) {
    startTransition(async () => {
      await saveChannelLayout(nextGroups);
    });
  }

  // ...render groups...
}
```

The `isPending` value lets us show that a save is in progress while the controls remain interactive.

Next.js currently [dispatches and awaits Server Actions one at a time](https://nextjs.org/docs/app/getting-started/mutating-data#invoking-server-functions), so these writes do not race in Huddle. This behavior is specific to how Next.js invokes Server Actions. If an event handler starts async work directly inside a Transition, requests can still finish out of order. The React docs describe this as [out-of-order Transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order) and point to `useActionState` for common cases.

Even with the Next.js queue, the component still calculates `nextGroups` before the save runs. If someone makes another change before the first save finishes, both complete layouts can be calculated from the same older layout. Next.js sends the second save after the first, but that second snapshot can leave out the first change and overwrite it.

We could disable the controls while `isPending` is true, but that would make dragging and editing the sidebar feel slow. Instead, we can keep the sidebar interactive and make later changes build on the result of the save before them.

### Building on the Previous Layout with useActionState

The [`useActionState` hook](https://react.dev/reference/react/useActionState) lets us update state with side effects using Actions. Its API has this shape:

```tsx
const [state, dispatchAction, isPending] = useActionState(
  async (previousState, actionPayload) => {
    // ...run the side effect...
    return nextState;
  },
  initialState
);
```

The callback can be async and perform side effects. It receives the previous state first, then the payload passed to the action dispatcher. React uses its return value as `state` and passes that state to the next call as `previousState`. The `isPending` value stays true while the queued Actions are running.

The Server Function now needs to calculate the complete layout from the previous groups and a `LayoutChange` describing the interaction. We can [extract that update into a reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer):

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

The `move` case removes the channel from its current group, inserts it into the target group, and returns the new layout. It creates new group and channel arrays before calling `splice`, so the input groups stay unchanged.

We can use the reducer inside `saveChannelLayout`:

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

The `groups` argument contains `initialGroups` for the first call and the result of the previous call after that. The Server Function applies the change to those groups, saves the resulting layout, and returns it for the next Action. A later change now builds on the last saved layout instead of the original props.

We can now pass the Server Function to `useActionState` in `ChannelNav`:

```tsx
// features/channel/components/channel-nav.tsx
import { startTransition, useActionState } from "react";
import { saveChannelLayout } from "@/features/channel/channel-actions";
import type {
  LayoutChange,
  LayoutGroup,
} from "@/features/channel/utils/channel-layout-reducer";

export function ChannelNav({
  groups: initialGroups,
}: {
  groups: LayoutGroup[];
}) {
  const [groups, dispatch, isPending] = useActionState(
    saveChannelLayout,
    initialGroups
  );

  function runChange(change: LayoutChange) {
    startTransition(() => {
      dispatch(change);
    });
  }

  // ...render groups...
}
```

The `dispatch(change)` call runs inside `startTransition` because it comes from an event handler. React already provides that Transition when an Action is passed to a prop such as `<form action={...}>`. A save now calculates its layout from the result before it, so a later change no longer overwrites an earlier one with a stale snapshot.

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

Now we can add `useOptimistic` to `ChannelNav`:

```tsx
// features/channel/components/channel-nav.tsx
import { startTransition, useActionState, useOptimistic } from "react";
import { saveChannelLayout } from "@/features/channel/channel-actions";
import {
  channelLayoutReducer,
  type LayoutChange,
  type LayoutGroup,
} from "@/features/channel/utils/channel-layout-reducer";

export function ChannelNav({
  groups: initialGroups,
}: {
  groups: LayoutGroup[];
}) {
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

  // ...render optimisticGroups...
}
```

The `groups` value remains the confirmed state. Since `channelLayoutReducer` accepts the current groups and a `LayoutChange`, we can pass it directly to `useOptimistic`. Rendering `optimisticGroups` makes the sidebar change immediately. The `addOptimistic(change)` call runs the reducer against the current optimistic groups, while `dispatch(change)` adds the same change to the Action queue. After earlier saves finish, React calls `saveChannelLayout` with the groups returned by the previous save and this change.

While the Transition is running, `optimisticGroups` contains the temporary layout. When it finishes, `useOptimistic` returns the confirmed `groups`. If the save succeeds, those groups contain the same change, so the sidebar stays where it is. React commits the optimistic and confirmed layouts together without a separate render to clear the temporary state.

### Rolling Back Failed Layout Changes

We still need to handle a failed save. The callback passed to `useActionState` gives us a place to do that:

```tsx
// features/channel/components/channel-nav.tsx
import { toast } from "sonner";
import { saveChannelLayout } from "@/features/channel/channel-actions";
import type {
  LayoutChange,
  LayoutGroup,
} from "@/features/channel/utils/channel-layout-reducer";

export function ChannelNav({
  groups: initialGroups,
}: {
  groups: LayoutGroup[];
}) {
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

  // ...add useOptimistic and render optimisticGroups as above...
}
```

The `catch` block shows the toast and returns the previous groups. When the Transition finishes, `useOptimistic` renders those groups again, so the sidebar moves back to the last successfully saved layout. We do not need to calculate and dispatch a reverse `LayoutChange`.

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

### Adding an Action Queue to CalendarBoard

Let's add the save queue to `CalendarBoard`:

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
      await saveEventChange(change);
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

The `mutate` function dispatches an `EventChange` that describes what happened. The reducer Action passes it to `saveEventChange`, which routes the change to the matching database write. React queues calls to the reducer Action and waits for one to finish before starting the next. Since the reducer Action returns nothing, its Action state remains `undefined`, and `isPending` covers the queue.

Next.js already dispatches and awaits Server Actions one at a time, so Flow does not need `useActionState` only to prevent its Server Functions from racing. Here, the hook gives `CalendarBoard` a React-level Action queue and one `isPending` value. The ordering is explicit in the component and does not depend on Next.js's current scheduling behavior.

Flow uses a variation of Huddle's pattern. The channel sidebar keeps its confirmed layout in `useActionState` because the next layout depends on the previous returned layout. Flow receives its confirmed events from the week and month Server Components instead. Its reducer Action orders the saves without owning the event data, while `useOptimistic` keeps track of the pending event changes.

### Applying Event Changes with useOptimistic

Flow needs to remember the changes that are still waiting to be saved, then apply them to the confirmed events from the Server Component. The functions for both parts live in `pending-changes-reducer.ts`:

```tsx
// features/calendar/utils/pending-changes-reducer.ts
export function pendingChangesReducer(
  changes: EventChange[],
  change: EventChange
): EventChange[] {
  return [...changes, change];
}

export function applyEventChange(events: CalendarEvent[], change: EventChange) {
  switch (change.type) {
    case "create":
      return [
        change.event,
        ...events.filter(event => event.id !== change.event.id),
      ];
    case "delete":
      return events.filter(event => event.sourceId !== change.sourceId);
    case "resize":
      return events.map(event =>
        event.sourceId === change.sourceId
          ? { ...event, duration: change.duration }
          : event
      );
    case "update":
      return events.map(event =>
        event.sourceId === change.event.sourceId
          ? { ...event, ...change.event }
          : event
      );
    case "move":
      return events.map(event =>
        event.id === change.id
          ? { ...event, day: change.day, start: change.start }
          : event
      );
  }
}

export function applyEventChanges(
  events: CalendarEvent[],
  changes: EventChange[],
  days: string[]
) {
  return changes.reduce((current, change) => {
    // Recurring creates and moves expand across the visible days.
    if (change.type === "move") {
      return moveRecurringEvent(current, change, days);
    }
    if (change.type === "create") {
      return expandOptimisticEvent(change.event, days).reduce(
        (created, event) =>
          applyEventChange(created, { event, type: "create" }),
        current
      );
    }

    return applyEventChange(current, change);
  }, events);
}
```

The `pendingChangesReducer` only appends a new `EventChange`, so the list preserves the order of the interactions. The event logic lives in `applyEventChange`. The `applyEventChanges` function reduces the pending list over the confirmed events and handles the extra expansion needed for recurring events. If we move an event and resize it before the first save finishes, the move runs first and the resize applies to that result.

We can now put both hooks together in `CalendarBoard`:

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
      await saveEventChange(change);
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

The board renders `optimisticEvents` instead of the `events` prop. The `mutate` function adds the same `EventChange` to the temporary list and the save queue inside a Transition. Another move or resize can then start from the optimistic event already on screen. This works while `CalendarBoard` owns the interactions.

However, Flow also has `CalendarMonthBoard`, and the `NewEventButton` lives in the header. Those components need to read or change the same optimistic state.

### Moving the Event Queue into Context

We can move the hooks and `mutate` into context instead of passing them through the calendar tree. First, we can wrap the calendar header and event board with a `CalendarEventsProvider` Client Component:

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

The calendar views need `getEvents` and `isPending`, while controls only need `mutate`. Following React's guide to [scaling up with reducer and context](https://react.dev/learn/scaling-up-with-reducer-and-context), we can expose state and dispatch separately while moving the hooks into the provider:

```tsx
// providers/calendar-events-provider.tsx
const CalendarEventsStateContext =
  createContext<CalendarEventsStateContextValue | null>(null);
const CalendarEventsDispatchContext =
  createContext<CalendarEventsDispatchContextValue | null>(null);

export function CalendarEventsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [, dispatch, isPending] = useActionState(
    async (_: void, change: EventChange) => {
      await saveEventChange(change);
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

The provider now owns the Action queue and the pending change list. We can update the consumers one at a time.

#### Dispatching Changes from Event Controls

The event popover only needs `mutate`, so it can read from the dispatch context instead of receiving the function through props:

```tsx
// features/calendar/components/event-popover.tsx
const mutate = useCalendarEventsDispatch();

function remove() {
  mutate({ sourceId: event.sourceId, type: "delete" });
}
```

The event controls can now dispatch changes through the shared context. The boards need the state value.

#### Applying Pending Changes in Calendar Boards

The board still receives confirmed events from its Server Component. It can read `getEvents` from the state context and apply the pending changes before rendering:

```tsx
// features/calendar/components/calendar-month-board.tsx
const { getEvents } = useCalendarEvents();
const visibleEvents = getEvents(events, days).filter(
  event => !hidden.has(event.calendarId)
);
```

The `getEvents` function applies the pending changes to the server events before the month board filters calendars that the user has hidden.

### Rolling Back Failed Event Changes

At this point, a failed save has no visible explanation. We can inspect the result inside the reducer Action and show a toast:

```tsx
// providers/calendar-events-provider.tsx
const [, dispatch] = useActionState(async (_: void, change: EventChange) => {
  const result = await saveEventChange(change);
  if (result.error) toast.error(result.error);
}, undefined);
```

If the write returns an error, the server data has not changed. The optimistic change stays visible while the queued Actions are pending. When the Transition completes, `useOptimistic` returns its base value, the empty change list, in the same commit. The `getEvents` function then applies nothing to the server events, so the event returns to its previous position.

**Try it:** [move a demo calendar event in Flow and notice the error toast and how it jumps back](https://next16-calendar.vercel.app/). **Code:** [`calendar-events-provider.tsx`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## When to Reach for a Client Data Library

The hooks are enough for Huddle's channel layout and Flow's calendar events. Huddle also has messages, unread state, activity, and their mutations. I use a client data library for that part of the app instead of building more providers. The app has equivalent [TanStack Query](https://github.com/aurorascharff/next16-team-chat/tree/main) and [SWR](https://github.com/aurorascharff/next16-team-chat/tree/swr) implementations.

In the SWR version, the server side starts in `MessageThread`:

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

The Server Component loads the messages and passes the preloaded result to `SWRConfig` under the channel key.

The corresponding client hook looks like this:

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

Since the client hook reads the same key, it starts with the server result. After hydration, SWR takes over the polling and revalidation in the browser. The [Next.js guide to client-side data fetching with SWR](https://nextjs.org/docs/app/guides/client-side-data-fetching/swr#provide-initial-data-from-a-server-component) documents how a Server Component provides the initial data before the client takes over.

Components reading the same key share the cached messages. SWR can also deduplicate requests and coordinate optimistic mutations across those components.

You might choose a client data library earlier, depending on your app. The [Next.js guide to client-side data fetching with TanStack Query](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query) shows the equivalent setup.

## Conclusion

For focused interactions like a channel layout or calendar board, these hooks can keep writes responsive without moving Server Component data into a client store. Once server state needs caching, revalidation, and polling across the app, a client data library fits better.

The coordination between Action state, optimistic state, and context still takes some wiring today. We may see more of these patterns handled natively by React and Next.js over time.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
