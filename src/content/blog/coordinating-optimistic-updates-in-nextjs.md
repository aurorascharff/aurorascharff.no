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

We want the channel sidebar to update immediately when someone moves a channel or edits a group, while the layout changes save in order. The [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions) documents the same pattern with a to-do list. We can build it around Huddle's channel layout, starting with the Server Function that saves it.

### Saving the Channel Layout in a Transition

Let's save the layout in a [Server Function](https://react.dev/reference/rsc/server-functions):

```ts
// channel-actions.ts
"use server";

export async function saveChannelLayout(groups: LayoutGroup[]) {
  await verifyAuth();
  // ...save groups and invalidate the cache...
}
```

This keeps the authentication and database write on the server.

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

Next.js currently [dispatches and awaits Server Actions one at a time](https://nextjs.org/docs/app/getting-started/mutating-data#invoking-server-functions), so these writes do not race in Huddle. Outside that Next.js queue, async work started directly inside a Transition can still finish out of order. The React docs describe this as [out-of-order Transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order) and point to `useActionState` for common cases.

However, `ChannelNav` calculates `nextGroups` before the save enters the queue. Two quick changes can start from the same layout. The second snapshot can leave out the first change, even though Next.js sends the saves in order.

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

The callback receives the previous state first and the dispatched value second. It can be async and perform side effects. React uses its return value as the state for the next call, while `isPending` stays true until the queue finishes.

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

The reducer calculates a new layout without changing the input. The `move` case removes a channel from its current group and inserts it into the target group.

The Server Function takes the previous groups and the change:

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

The Server Function now builds from the last saved layout. After saving the change, it returns that layout for the next Action.

Back in `ChannelNav`, `saveChannelLayout` becomes the Action passed to `useActionState`:

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

Huddle calls `runChange` from drag and menu event handlers. React requires a manual call to the `useActionState` dispatcher to run [inside an Action](https://react.dev/reference/react/useActionState#caveats), which is why `dispatch(change)` is wrapped in `startTransition` above.

The groups returned by one save become the first argument for the next queued call to `saveChannelLayout`. A later `LayoutChange` is calculated from the layout produced by the earlier save.

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

Calling `addOptimistic(optimisticValue)` inside an Action runs the update function with the current optimistic state. React renders its result until the Action finishes. If the confirmed state changes first, React runs the function again with that state.

To show the layout immediately, let's pass `channelLayoutReducer` to `useOptimistic` in `ChannelNav`:

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

The sidebar now moves immediately. Huddle uses `channelLayoutReducer` for both the temporary layout and the saved layout. When the save succeeds, the confirmed layout matches what is already on screen.

### Rolling Back Failed Layout Changes

We still need to handle a failed save. The callback passed to `useActionState` gives us a place to do that:

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

While the Action is pending, `useOptimistic` renders the layout calculated by `channelLayoutReducer` as temporary state. If the save fails, the callback returns the previous `groups` unchanged. React discards the optimistic layout when the Action finishes and renders those groups again, so the sidebar moves back without a reverse `LayoutChange`.

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

The `CalendarBoard` Client Component handles creating, moving, resizing, and selecting events in the week view.

In Flow, we want creates, updates, deletes, moves, and resizes to appear immediately while the writes save in order. Each interaction becomes an `EventChange`. The server can save that change, and the board can apply it temporarily to the events it already has.

### Adding an Action Queue to CalendarBoard

Someone can move an event, then resize it before the first save finishes. The `saveEventChange` function accepts one self-contained `EventChange`, so the next save only needs its own change. The Action state can be `void`, while `useActionState` queues the calls and gives the board one `isPending` value:

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

This orders the saves, but `CalendarBoard` still renders the `events` it received from `CalendarWeek`. A move or resize would not appear until those events update. We want to show the change while the save is running too.

### Applying Event Changes with useOptimistic

To show a change before the save finishes, we'll pass the `events` prop to `useOptimistic` as the confirmed state and apply each temporary `EventChange` on top. The update function handles creates, updates, deletes, moves, and resizes. It also receives the visible days so recurring creates and moves can expand across the board:

```tsx
// features/calendar/utils/event-change-reducers.ts
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
          eventChangeReducer(created, { event, type: "create" }),
        current
      );
    }

    return eventChangeReducer(current, change);
  }, events);
}
```

With that update function, `CalendarBoard` can apply optimistic changes to its server events:

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
    (currentEvents, change: EventChange) =>
      applyEventChanges(currentEvents, [change], days)
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

The board renders the updated events while the save runs. Another move or resize starts from what is already on screen. For the week view alone, `CalendarBoard` can own this state.

However, Flow also has `CalendarMonthBoard`, and the `NewEventButton` lives in the header. Those components need to read or change the same optimistic state.

### Sharing Event Changes with Context

Server Components sit between the header and boards, so we cannot pass `mutate` between them. Passing the callback through props would require converting those Server Components to Client Components.

Let's keep `CalendarHeader`, `CalendarWeek`, and `CalendarMonth` as Server Components by wrapping them with a `CalendarEventsProvider`:

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

We can move the Action queue into the provider unchanged, but `useOptimistic` needs a different base. The provider sits above `CalendarWeek` and `CalendarMonth`, so it does not receive their events or visible days.

Instead of moving the server data into client context, we can keep the pending `EventChange` values as temporary optimistic state. This needs a second reducer with a different state shape. `eventChangeReducer` updates `CalendarEvent[]`, while `pendingChangesReducer` appends each change to an `EventChange[]`. If we move an event and then resize it, the array contains the move followed by the resize. The week or month board applies both changes to the server events it received. When the saves finish, the temporary array disappears and the board renders the server events again.

Following React's guide to [scaling up with reducer and context](https://react.dev/learn/scaling-up-with-reducer-and-context), we'll keep state and dispatch in separate contexts. Putting those pieces together, the full provider looks like this:

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
  const [optimisticChanges, addOptimisticChange] = useOptimistic(
    [],
    pendingChangesReducer
  );

  function mutate(change: EventChange) {
    startTransition(() => {
      addOptimisticChange(change);
      dispatch(change);
    });
  }

  function getEvents(events: CalendarEvent[], days: string[]) {
    return applyEventChanges(events, optimisticChanges, days);
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

Any Client Component below the provider can now call `mutate` through `useCalendarEventsDispatch`. The boards can read `getEvents` and `isPending` through `useCalendarEvents`. Let's add those hooks where the calendar handles interactions.

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

To edit or delete the selected event, `EventPopover` reads `mutate` from the dispatch context:

```tsx
// features/calendar/components/event-popover.tsx
const mutate = useCalendarEventsDispatch();

function remove() {
  mutate({ sourceId: event.sourceId, type: "delete" });
}
```

Edits and deletes now use the same optimistic state as moves and resizes. Next, the boards need to read that state.

#### Applying Pending Changes in Calendar Boards

`CalendarBoard` still receives confirmed events from `CalendarWeek`. Now we can add `useCalendarEvents` to the component and pass the optimistic events into `useCalendarBoard`:

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

The board keeps the events from `CalendarWeek` as its confirmed input. Before `useCalendarBoard` calculates the visible events and interactions, `getEvents` applies the changes currently held by the provider. The week grid runs from 06:00 to 06:00, so `eventDays` includes the following calendar day too. `CalendarMonthBoard` follows the same pattern before grouping events into days.

### Rolling Back Failed Event Changes

A save can still fail. Let's handle the result from `saveEventChange` inside the callback passed to `useActionState`:

```tsx
// providers/calendar-events-provider.tsx
const [, dispatch] = useActionState(async (_: void, change: EventChange) => {
  const result = await saveEventChange(change);
  if (result.error) toast.error(result.error);
}, undefined);
```

If the write fails, the server events remain unchanged. The temporary position stays visible until the Transition finishes, then the board returns to those events and the event moves back. We do not need to calculate a reverse change.

**Try it:** [move a demo calendar event in Flow and notice the error toast and how it jumps back](https://next16-calendar.vercel.app/). **Code:** [`calendar-events-provider.tsx`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## When to Reach for a Client Data Library

The hooks are enough for Huddle's channel layout and Flow's calendar events. Messages are different because the message list, unread state, activity, and their mutations need to stay in sync across components. Components reading the same cache key should share the messages, revalidate them, and coordinate optimistic mutations. I use a client data library for that part of Huddle instead of building more providers. The app has equivalent [TanStack Query](https://github.com/aurorascharff/next16-team-chat/tree/main) and [SWR](https://github.com/aurorascharff/next16-team-chat/tree/swr) implementations.

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

For focused interactions like a channel layout or calendar board, these hooks can keep writes responsive without moving Server Component data into a client store. Once server state needs caching, revalidation, and polling across the app, a client data library fits better. The hooks still require some wiring between Action state, optimistic state, and context, and there is room for this pattern to become more direct in React and Next.js.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
