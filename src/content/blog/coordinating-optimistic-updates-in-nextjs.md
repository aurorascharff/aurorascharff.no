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

I've recently been sharing [how to build SPA-like experiences with Next.js](https://x.com/aurorascharff/status/2087171648247988705) through [Next Beats](https://next-beats.dev/), [Drop](https://next16-social-media.vercel.app/), [Flow](https://next16-calendar.vercel.app/), and [Huddle](https://next16-team-chat.vercel.app/). One pattern I use in Huddle and Flow, but have not covered yet, is coordinating optimistic writes when interactions overlap. Frameworks solve this differently. [React Router](https://reactrouter.com/explanation/race-conditions) cancels interrupted requests and stale revalidations, while [Solid Router](https://docs.solidjs.com/solid-router/concepts/actions) tracks pending submissions. In React, we can combine `useActionState` and `useOptimistic`.

In this post, we'll look at how these hooks work together in Huddle, then scale the pattern across the component tree in Flow.

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

The `ChannelList` Server Component inside the sidebar loads the saved groups and passes them to `ChannelNav`:

```tsx
// features/channel/components/channel-list.tsx
export async function ChannelList() {
  const { groups, userId } = await getCurrentChannelLayout();

  return <ChannelNav groups={groups} key={userId} />;
}
```

The `ChannelNav` Client Component renders those groups and handles the interactions:

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

We want the channel sidebar to update immediately when someone moves a channel or edits a group, while the layout changes save in order. A few references are useful here:

- [The True Nature of useActionState](https://www.nikhilsnayak.dev/blog/the-true-nature-of-use-action-state) is an early exploration of using the hook as an async reducer and pairing it with `useOptimistic`.
- The [React `useActionState` docs](https://react.dev/reference/react/useActionState) now cover queued Actions and using both hooks together.
- The [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions) applies the pattern to a to-do list saved with a Server Function.

Let's apply it to Huddle.

### Saving the Channel Layout in a Transition

To save the complete layout, we can add a [Server Function](https://react.dev/reference/rsc/server-functions):

```ts
// channel-actions.ts
"use server";

export async function saveChannelLayout(groups: LayoutGroup[]) {
  await verifyAuth();
  // ...save groups and invalidate the cache...
}
```

With the Server Function in place, we can call `saveChannelLayout` inside a Transition in `ChannelNav`. The `useTransition` hook gives us an `isPending` state while the sidebar keeps accepting changes:

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

Next.js currently [dispatches and awaits Server Actions one at a time](https://nextjs.org/docs/app/getting-started/mutating-data#invoking-server-functions), so these writes do not race in Huddle. Outside that Next.js queue, async work started directly inside a Transition can still finish out of order. The React docs describe this as [out-of-order Transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order) and point to `useActionState` for common cases.

However, `ChannelNav` calculates `nextGroups` before the save enters the queue. Two quick changes can start from the same layout. The second snapshot can leave out the first change, even though Next.js sends the saves in order.

We could disable the controls while `isPending` is true, but that would make dragging and editing the sidebar feel slow. Instead, we can keep the sidebar interactive and make later changes build on the result of the save before them.

### Building on the Previous Layout with useActionState

The [`useActionState` hook](https://react.dev/reference/react/useActionState) stores the result of an Action and queues calls made through its dispatcher:

```tsx
const [state, dispatchAction, isPending] = useActionState(
  async (previousState, actionPayload) => {
    // ...run the side effect...
    return nextState;
  },
  initialState
);
```

React passes the state returned by one queued Action into the next. The callback can be async, and `isPending` stays true while the queue is running.

To build a change on top of the previous save, `saveChannelLayout` needs the previous groups and a `LayoutChange` describing what happened. We can [extract the layout update into a reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer):

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
    case "addGroup": {
      // ...return the layout with the new group, keeping Channels last...
    }
    case "renameGroup": {
      // ...validate the name and return the renamed group...
    }
    case "deleteGroup": {
      // ...return the layout with its channels moved to Channels...
    }
    case "moveGroup": {
      // ...return the layout with the group moved up or down...
    }
    default:
      return groups;
  }
}
```

The `move` case removes a channel from its current group and inserts it into the target without changing the input, while the other cases handle changes to the groups themselves. We can use the same reducer inside `saveChannelLayout` before writing the next layout:

```ts
// channel-actions.ts
"use server";

import {
  channelLayoutReducer,
  type LayoutChange,
  type LayoutGroup,
} from "@/features/channel/utils/channel-layout-reducer";
// ...database, cache, and auth imports...

export async function saveChannelLayout(
  groups: LayoutGroup[],
  change: LayoutChange
): Promise<LayoutGroup[]> {
  await verifyAuth();
  const next = channelLayoutReducer(groups, change);
  // ...save next and invalidate the cache...

  return next;
}
```

After the write succeeds, the returned layout becomes the state for the next queued update. Now `ChannelNav` can pass `saveChannelLayout` to `useActionState`:

```tsx
// features/channel/components/channel-nav.tsx
"use client";

import { startTransition, useActionState } from "react";
// ...app imports...

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

React starts a Transition automatically for Action props such as `<form action>`. Huddle dispatches changes from drag and menu handlers, so `runChange` uses [`startTransition`](https://react.dev/reference/react/useActionState#caveats) explicitly.

A second `LayoutChange` is calculated from the saved layout that already includes the first. The writes are ordered, but the sidebar still renders `groups`, which only updates after the Server Function finishes. Moving a channel would wait for the database write before appearing in the interface.

### Showing Layout Changes with useOptimistic

The [`useOptimistic` hook](https://react.dev/reference/react/useOptimistic) lets us render temporary state while an Action is pending. With an update function, React can calculate each optimistic state from the current one:

```tsx
const [optimisticState, addOptimistic] = useOptimistic(
  state,
  (currentState, optimisticValue) => {
    return nextState;
  }
);
```

If the confirmed state changes while the Action is pending, React applies the update function again on top of the new state.

Since `channelLayoutReducer` calculates a layout from the current groups and a change, we can also use it as the update function for `useOptimistic` in `ChannelNav`:

```tsx
// features/channel/components/channel-nav.tsx
"use client";

import { startTransition, useActionState, useOptimistic } from "react";
// ...app imports...

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

Huddle uses `channelLayoutReducer` for both the temporary layout and the saved layout. When the save succeeds, the confirmed layout matches what is already on screen.

### Rolling Back Failed Layout Changes

We can handle a failed save inside the callback passed to `useActionState`. If `saveChannelLayout` throws, we show a toast and return the previous groups:

```tsx
// features/channel/components/channel-nav.tsx
"use client";

import { toast } from "sonner";
// ...app imports...

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

While the Action is pending, `useOptimistic` keeps the changed layout on screen. Once the Action finishes, React discards that temporary state and renders the confirmed groups from `useActionState`. After an error, those are still the groups from the last successful save, so the sidebar moves back without a reverse `LayoutChange`.

**Try it:** [move a channel between groups in Huddle](https://next16-team-chat.vercel.app/), then move it again before the first save finishes. **Code:** [`channel-nav.tsx`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx).

## Building an Optimistic Event Board in Flow

[Flow](https://next16-calendar.vercel.app/) is a calendar and booking-link app with week and month views. Its calendar page renders the header and the selected view:

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

The `CalendarWeek` Server Component fetches the events and passes them to `CalendarBoard`:

```tsx
// features/calendar/components/calendar-week.tsx
export async function CalendarWeek({ date }: { date: string }) {
  const [week, calendars] = await Promise.all([
    getCalendarWeek(date),
    getCalendars(),
  ]);

  return (
    <CalendarBoard
      calendars={calendars}
      days={week.days}
      events={week.events}
    />
  );
}
```

The `CalendarBoard` Client Component renders the week grid and handles its interactions.

In Flow, we want creates, updates, deletes, moves, and resizes to appear immediately while the writes save in order.

### Adding an Action Queue to CalendarBoard

Someone can move an event, then resize it before the first save finishes. To order both writes, let's represent the interactions as `EventChange` values. Unlike Huddle, we do not need the result of the previous save to handle the next change, so the Action state can be `void`. `useActionState` still gives us one `isPending` value while the saves run:

```tsx
// features/calendar/components/calendar-board.tsx
"use client";

import { startTransition, useActionState } from "react";
// ...app imports...

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

However, `CalendarBoard` still renders the `events` it received from `CalendarWeek`. A move or resize would not appear until those events update. We want to show the change while the save is running too.

### Applying Event Changes with useOptimistic

To show a change before the save finishes, let's add a reducer that applies one `EventChange` to the events from the server:

```tsx
// features/calendar/utils/event-change-reducer.ts
export function eventChangeReducer(
  events: CalendarEvent[],
  change: EventChange
) {
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
```

Now `CalendarBoard` can pass `eventChangeReducer` to `useOptimistic`:

```tsx
// features/calendar/components/calendar-board.tsx
"use client";

import { startTransition, useActionState, useOptimistic } from "react";
// ...app imports...

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
  const [optimisticEvents, addOptimisticChange] = useOptimistic(
    events,
    eventChangeReducer
  );

  function mutate(change: EventChange) {
    startTransition(() => {
      addOptimisticChange(change);
      dispatch(change);
    });
  }

  // ...render optimisticEvents...
}
```

Another move or resize now starts from what is already on screen. For the week view alone, `CalendarBoard` can own this state.

However, Flow also has `CalendarMonthBoard`, and the `NewEventButton` lives in the header. Those components need to read or change the same optimistic state.

### Sharing Event Changes with Context

Server Components sit between the header and boards, so we cannot pass `mutate` between them. Passing the callback through props would require converting those Server Components to Client Components.

Rather than lifting the calendar into one large Client Component, we can place `CalendarEventsProvider` around the header and selected view. Client Components below the provider can read the context even with Server Components between them:

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

The Action queue can move into the provider unchanged because it does not depend on the board's event list. But what should we do with the optimistic state? The provider does not receive the events or visible days from `CalendarWeek` and `CalendarMonth`, so it cannot keep a `CalendarEvent[]`.

Instead, let's keep the `EventChange` values made while the saves are running. If someone moves and then resizes an event, both changes stay in that list, so a board can apply them in order to the events it received from the server. When the Actions finish, React drops the list and the boards render those server events again.

Flow also supports recurring events. We can keep that handling next to the provider and use `eventChangeReducer` as we replay the pending changes:

```tsx
// providers/calendar-events-provider.tsx
function applyEventChanges(
  events: CalendarEvent[],
  changes: EventChange[],
  days: string[]
) {
  return changes.reduce((current, change) => {
    // Recurring creates and moves expand across the visible days.
    if (change.type === "move") {
      return moveRecurringEvent(current, change, days);
    }
    if (change.type !== "create") {
      return eventChangeReducer(current, change);
    }

    return expandOptimisticEvent(change.event, days).reduce(
      (created, event) =>
        eventChangeReducer(created, { event, type: "create" }),
      current
    );
  }, events);
}
```

With that logic next to the state it reads, we can put the Action queue and pending changes into the full provider. React's guide to [scaling up with reducer and context](https://react.dev/learn/scaling-up-with-reducer-and-context) separates state and dispatch. Let's follow the same structure:

```tsx
// providers/calendar-events-provider.tsx
"use client";

// ...imports...

type CalendarEventsStateContextValue = {
  getEvents: (events: CalendarEvent[], days: string[]) => CalendarEvent[];
  isPending: boolean;
};

type CalendarEventsDispatchContextValue = (change: EventChange) => void;

const CalendarEventsStateContext =
  createContext<CalendarEventsStateContextValue | null>(null);
const CalendarEventsDispatchContext =
  createContext<CalendarEventsDispatchContextValue | null>(null);

export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const [, dispatch, isPending] = useActionState(
    async (_: void, change: EventChange) => {
      await saveEventChange(change);
    },
    undefined
  );
  const [pendingChanges, addOptimisticChange] = useOptimistic<
    EventChange[],
    EventChange
  >([], (changes, change) => [...changes, change]);

  function mutate(change: EventChange) {
    startTransition(() => {
      addOptimisticChange(change);
      dispatch(change);
    });
  }

  function getEvents(events: CalendarEvent[], days: string[]) {
    return applyEventChanges(events, pendingChanges, days);
  }

  const contextValue = { getEvents, isPending };

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

export function useCalendarEventsDispatch() {
  const context = useContext(CalendarEventsDispatchContext);
  if (!context) {
    throw new Error(
      "useCalendarEventsDispatch must be used within CalendarEventsProvider"
    );
  }
  return context;
}
```

The provider keeps the pending changes and exposes `getEvents` alongside the dispatcher. The week and month views continue to receive their confirmed events from Server Components.

#### Updating and Deleting Events from the Popover

Both `CalendarBoard` and `CalendarMonthBoard` render `EventPopover` when the user selects an event:

```tsx
// features/calendar/components/calendar-board.tsx
return (
  <>
    {/* ...event board... */}
    {selectedEvent ? (
      <EventPopover
        anchorRect={selectedEvent.anchorRect}
        calendar={calendars.find(
          calendar => calendar.id === selectedEvent.event.calendarId
        )}
        event={selectedEvent.event}
        onClose={() => setSelectedEvent(null)}
      />
    ) : null}
  </>
);
```

Now `EventPopover` can read `mutate` from the dispatch context when someone edits or deletes the selected event:

```tsx
// features/calendar/components/event-popover.tsx
const mutate = useCalendarEventsDispatch();

function remove() {
  mutate({ sourceId: event.sourceId, type: "delete" });
}
```

Edits and deletes now join moves and resizes in the same Action queue.

#### Applying Pending Changes in Calendar Boards

The events from `CalendarWeek` remain the board's confirmed input. We can apply the pending changes inside `CalendarBoard` before passing the events into `useCalendarBoard`:

```tsx
// features/calendar/components/calendar-board.tsx
"use client";

import { useCalendarEvents } from "@/providers/calendar-events-provider";
// ...app imports...

export function CalendarBoard({
  calendars,
  days,
  events,
}: {
  calendars: Calendar[];
  days: string[];
  events: CalendarEvent[];
}) {
  const { getEvents } = useCalendarEvents();
  const eventDays = [...days, shiftDay(days.at(-1)!, 1)];
  const {
    interactions,
    selectedEvent,
    setSelectedEvent,
    visibleEvents,
    // ...board state...
  } = useCalendarBoard({
    calendars,
    days,
    events: getEvents(events, eventDays),
  });

  return (
    <>
      {/* ...render visibleEvents with interactions in the calendar grid... */}
      {selectedEvent ? (
        <EventPopover
          anchorRect={selectedEvent.anchorRect}
          calendar={calendars.find(
            calendar => calendar.id === selectedEvent.event.calendarId
          )}
          event={selectedEvent.event}
          onClose={() => setSelectedEvent(null)}
        />
      ) : null}
    </>
  );
}
```

The week grid runs from 06:00 to 06:00, so `eventDays` includes the following calendar day too. `CalendarMonthBoard` applies its pending changes in the same way before grouping events into days.

### Rolling Back Failed Event Changes

We still need to handle a failed write. Let's check the result from `saveEventChange` inside the `useActionState` callback and show the toast there:

```tsx
// providers/calendar-events-provider.tsx
const [, dispatch] = useActionState(async (_: void, change: EventChange) => {
  const result = await saveEventChange(change);
  if (result.error) toast.error(result.error);
}, undefined);
```

If the write fails, the server events remain unchanged. The temporary position stays visible until the Transition finishes, then the board returns to those events and the event moves back. We do not need to calculate a reverse change.

**Try it:** [move a demo calendar event in Flow](https://next16-calendar.vercel.app/) and watch it return to its saved position after the error toast. **Code:** [`calendar-events-provider.tsx`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## When to Reach for a Client Data Library

These hooks fit Huddle's channel layout and Flow's calendar events because the optimistic state belongs to one focused feature. Huddle's messages also need caching, polling, and revalidation across components, so I use a client data library there instead of adding more providers. The app has equivalent [TanStack Query](https://github.com/aurorascharff/next16-team-chat/tree/main) and [SWR](https://github.com/aurorascharff/next16-team-chat/tree/swr) implementations.

In the SWR version, `MessageThread` loads the current messages on the server and seeds the client cache:

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

The client reads the same channel key:

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

The hook starts with the result from `MessageThread`. After hydration, SWR takes over the polling and revalidation in the browser. To read more about this handoff, see the [Next.js guide to client-side data fetching with SWR](https://nextjs.org/docs/app/guides/client-side-data-fetching/swr#provide-initial-data-from-a-server-component).

You might choose a client data library earlier, depending on your app. To read more about this setup with TanStack Query, see the [Next.js guide to client-side data fetching](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query).

## Conclusion

What I like about this pattern is that Server Components continue to own the data. We only add enough client state to coordinate the interaction, then let the server result take over when the Action finishes. For broader server-state concerns such as polling and shared caches, I still reach for a client data library. Sharing the pattern across the component tree currently requires some wiring between Action state, optimistic state, and context. React and Next.js may make that coordination more direct over time.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
