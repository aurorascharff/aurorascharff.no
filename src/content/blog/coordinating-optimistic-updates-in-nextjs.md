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
description: Several changes can happen before the first save finishes. Here is how useActionState and useOptimistic keep those changes on screen while the saves run in order.
---

I've recently been sharing [how to build SPA-like experiences with Next.js](https://x.com/aurorascharff/status/2087171648247988705) through [Next Beats](https://next-beats.dev/), [Drop](https://next16-social-media.vercel.app/), [Flow](https://next16-calendar.vercel.app/), and [Huddle](https://next16-team-chat.vercel.app/). One pattern I use in Huddle and Flow, but have not covered yet, is coordinating optimistic writes when interactions overlap. Overlapping writes are a common thing to deal with on the web, and frameworks handle them differently, like [React Router](https://reactrouter.com/explanation/race-conditions) cancelling interrupted requests and stale revalidations, or [Solid Router](https://docs.solidjs.com/solid-router/concepts/actions) tracking pending submissions. In React, we can combine `useActionState` and `useOptimistic`.

In this post, we'll look at how these hooks work together in Huddle, then scale the pattern across the component tree in Flow.

## Table of contents

## Building an Optimistic Channel Sidebar in Huddle

[Huddle](https://next16-team-chat.vercel.app/) is a Slack-like team chat app with a workspace rail, a channel sidebar, and the current channel. Here is the workspace shell:

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

Huddle's sidebar starts with `ChannelList`, which loads the saved groups in a Server Component:

```tsx
// features/channel/components/channel-list.tsx
export async function ChannelList() {
  const { groups, userId } = await getCurrentChannelLayout();

  return <ChannelNav groups={groups} key={userId} />;
}
```

Those groups become the initial state for the `ChannelNav` Client Component, where the list and its interactions live:

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

We want the channel sidebar to update immediately when someone moves a channel or edits a group, while the layout changes save in order. A few posts and docs already cover combining `useActionState` and `useOptimistic` for that:

- [The True Nature of useActionState](https://www.nikhilsnayak.dev/blog/the-true-nature-of-use-action-state) is an early exploration of using the hook as an async reducer and pairing it with `useOptimistic`.
- The [React `useActionState` docs](https://react.dev/reference/react/useActionState) now cover queued Actions and using both hooks together.
- The [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions) applies the pattern to a to-do list saved with a Server Function.

Let's apply it to Huddle.

### Saving the Channel Layout in a Transition

To save the complete layout, we can add a [Server Function](https://react.dev/reference/rsc/server-functions). It writes the group positions and the channel positions inside them, simplified here from Huddle's transaction:

```ts
// features/channel/channel-actions.ts
"use server";

export async function saveChannelLayout(groups: LayoutGroup[]) {
  const user = await verifyAuth();

  for (const [position, group] of groups.entries()) {
    await prisma.channelGroup.upsert({
      create: { name: group.name, position, userId: user.id },
      update: { position },
      where: { userId_name: { name: group.name, userId: user.id } },
    });
    // ...write the group and position for the channels inside it...
  }
  // ...invalidate the cache...
}
```

With the Server Function in place, we can call `saveChannelLayout` inside a Transition in `ChannelNav`. Wrapping the call in [`useTransition`](https://react.dev/reference/react/useTransition) sets `isPending` while the save runs, and the sidebar keeps accepting changes:

```tsx
// features/channel/components/channel-nav.tsx
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

Next.js currently [dispatches and awaits Server Actions one at a time](https://nextjs.org/docs/app/getting-started/mutating-data#invoking-server-functions), so these writes do not race in Huddle. Outside that queue, async work started directly inside a Transition can still finish out of order. The React docs describe this as [out-of-order Transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order) and point to `useActionState` for common cases.

However, `ChannelNav` calculates `nextGroups` before the save enters the queue. If someone makes another change before the first save finishes, the second `nextGroups` is built from the layout as it was before either change. Next.js still writes the requests in order, so the later one lands last and drops the earlier change from the saved layout.

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

If we dispatch several changes, React waits for one callback to finish before using its result in the next. We can await the save inside the callback, and `isPending` remains true until all the saves have finished.

To build a change on top of the previous save, `saveChannelLayout` needs the previous groups and a `LayoutChange` describing what happened. We can [extract the layout update into a reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer):

```ts
// features/channel/utils/channel-layout-reducer.ts
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

Inside the reducer, the `move` case removes a channel from its current group and inserts it into the target without changing the input. The other cases handle changes to the groups themselves. Now we can use `channelLayoutReducer` inside `saveChannelLayout` to calculate the layout we write:

```ts
// features/channel/channel-actions.ts
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
  // ...write next with the same upserts as above...

  return next;
}
```

Once the write succeeds, the returned layout becomes the state for the next queued update. Back in `ChannelNav`, let's pass `saveChannelLayout` to `useActionState`:

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
  const [groups, dispatch] = useActionState(saveChannelLayout, initialGroups);

  function runChange(change: LayoutChange) {
    startTransition(() => {
      dispatch(change);
    });
  }

  // ...render groups...
}
```

React starts a Transition automatically for Action props such as `<form action>`. Huddle dispatches changes from drag and menu handlers, so we call [`startTransition`](https://react.dev/reference/react/useTransition#starttransition) explicitly inside `runChange`. When someone makes another change, React waits for the previous save and passes its returned layout into `saveChannelLayout`. The `channelLayoutReducer` applies the new `LayoutChange` to that layout.

The saves are ordered now, but the sidebar renders `groups`, which only updates after the Server Function finishes. Moving a channel would wait for the database write before appearing in the sidebar.

### Showing Layout Changes with useOptimistic

We can use [`useOptimistic`](https://react.dev/reference/react/useOptimistic) to show temporary state while an Action is pending:

```tsx
const [optimisticState, addOptimistic] = useOptimistic(
  state,
  (currentState, optimisticValue) => {
    return nextState;
  }
);
```

The first argument is the confirmed state. When we call `addOptimistic`, React passes the current optimistic state and the new value to the update function. Its return value is shown while the Action is pending. If the confirmed state changes in the meantime, React applies the update function again on top of it.

In Huddle, the confirmed state is `groups`, and the optimistic value is a `LayoutChange`. The `channelLayoutReducer` already accepts those two values, so let's pass it to `useOptimistic` in `ChannelNav`:

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
  const [groups, dispatch] = useActionState(saveChannelLayout, initialGroups);
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

When `runChange` fires, the sidebar renders `optimisticGroups` immediately while `dispatch` saves the change. Once the save finishes, `groups` catches up to the layout already on screen.

### Rolling Back Failed Layout Changes

An optimistic change can still fail to save. We want to let the user know and return the sidebar to the last layout that did save.

We can handle both inside the callback passed to `useActionState`. If `saveChannelLayout` throws, let's show a toast and return the previous groups passed into the callback:

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
    async (previousGroups: LayoutGroup[], change: LayoutChange) => {
      try {
        return await saveChannelLayout(previousGroups, change);
      } catch {
        toast.error("Could not save channel layout. Try again.");
        return previousGroups;
      }
    },
    initialGroups
  );

  // ...add useOptimistic and render optimisticGroups as above...
}
```

While the Action is pending, `useOptimistic` keeps the changed layout on screen. Once the Action finishes, React discards that temporary state and renders the confirmed groups from `useActionState`. After an error, those are still the groups from the last successful save, so the sidebar moves back without a reverse `LayoutChange`.

### The Full `ChannelNav`

Here is the sidebar with the queue, the optimistic layout, and the rollback wired in. The drag and menu handlers go through `runChange`, and the render reads `optimisticGroups`:

```tsx
// features/channel/components/channel-nav.tsx
"use client";

import { startTransition, useActionState, useOptimistic } from "react";
import { toast } from "sonner";
import { channelLayoutReducer } from "@/features/channel/utils/channel-layout-reducer";
// ...app imports...

export function ChannelNav({
  groups: initialGroups,
}: {
  groups: LayoutGroup[];
}) {
  const [groups, dispatch] = useActionState(
    async (previousGroups: LayoutGroup[], change: LayoutChange) => {
      try {
        return await saveChannelLayout(previousGroups, change);
      } catch {
        toast.error("Could not save channel layout. Try again.");
        return previousGroups;
      }
    },
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

  return (
    <nav aria-label="Channels">
      {optimisticGroups.map(group => (
        <div key={group.name}>
          <p>{group.name}</p>
          {/* ...drag handlers and the group menu call runChange... */}
          {group.channels.map(channel => (
            <ChannelLink channel={channel} key={channel.id} />
          ))}
        </div>
      ))}
    </nav>
  );
}
```

This way, the sidebar moves the moment someone drops a channel, and the saves still run in the order the changes were made. If one of them fails, the sidebar goes back to the last layout the server confirmed.

**Try it:** [move a channel between groups in Huddle](https://next16-team-chat.vercel.app/), then move it again before the first save finishes. **Code:** [`channel-nav.tsx`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx).

## Building an Optimistic Event Board in Flow

[Flow](https://next16-calendar.vercel.app/) is a calendar and booking-link app with week and month views. The page composes the header and the selected view:

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

For the week view, `CalendarWeek` fetches the events and calendars in a Server Component:

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

From there, the `CalendarBoard` Client Component renders the week grid. We want creates, updates, deletes, moves, and resizes on this grid to appear immediately while the writes save in order.

### Adding an Action Queue to CalendarBoard

Someone can move an event, then resize it before the first save finishes. To order both writes, let's represent the interactions as `EventChange` values, and let one Server Function run the matching write:

```ts
// features/calendar/calendar-actions.ts
"use server";

export async function saveEventChange(change: EventChange) {
  switch (change.type) {
    case "move":
      return moveEvent({
        day: change.day,
        sourceId: change.sourceId,
        start: change.start,
      });
    // ...create, update, resize, and delete...
  }
}

async function moveEvent({ day, sourceId, start }: MoveEventInput) {
  await verifyAuth();
  const event = await findEvent(sourceId);
  if (event?.demo) {
    return { error: "Create your own calendar to make changes." };
  }
  // ...check that the event exists and belongs to the user...

  const updated = await prisma.calendarEvent.update({
    data: { day: new Date(`${day}T00:00:00.000Z`), start },
    where: { id: sourceId },
  });
  // ...invalidate the cache...

  return { data: updated };
}
```

The cases return either an error or the updated row, and the rollback later checks for that error. Unlike Huddle, we do not need the result of the previous save to handle the next change, so the Action state can be `void`:

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

To show a change before the save finishes, `useOptimistic` needs an update function that calculates the next events. Saving Huddle's sidebar means writing the whole layout, so the server already calculated it with `channelLayoutReducer` and we could pass that straight in. A calendar event is a single row that Flow updates on its own, so there is nothing to reuse. Let's write the reducer for the client instead, taking the events from the server and one `EventChange` and returning the next event list:

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

With the reducer ready, we can pass it to `useOptimistic` in `CalendarBoard` and add the change alongside the dispatch:

```tsx
// features/calendar/components/calendar-board.tsx
export function CalendarBoard({ days, events }: CalendarBoardProps) {
  // ...the Action queue from above...
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

Rapid moves and resizes now build on what is already on screen. For the week view alone, `CalendarBoard` can own this state.

However, the month view renders its own `CalendarMonthBoard`, and the header renders a `NewEventButton`. The month board needs to read the same optimistic state, and the create dialog behind the button needs to add to it.

### Sharing Event Changes with Context

Server Components sit between the header and boards, so passing `mutate` through props would require converting them to Client Components.

Rather than lifting the calendar into one large Client Component, we can place `CalendarEventsProvider` around the header and selected view. I wrote about [this provider approach](/posts/utilizing-useoptimistic-across-the-component-tree-in-nextjs) back when React 19 was still in canary, while I was working out how to get the optimistic updates across the app that I was used to from React Query. Client Components below the provider can read the context even with Server Components between them:

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

The Action queue can move into the provider unchanged because `saveEventChange` only needs an `EventChange`. The optimistic state is harder. An update function always runs against a base state, and `eventChangeReducer` moves, resizes, and deletes events that are already in the list, so its base has to be the events themselves. Those arrive below the provider, in `CalendarWeek` and `CalendarMonth`, and the two views fetch different ranges.

So let's keep the changes instead of the events. A list of changes starts empty and only gets appended to, so the provider can hold it with no server data, and the boards can apply the list to whatever events they received:

```tsx
// providers/calendar-events-provider.tsx
"use client";

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

  // ...provide pendingChanges, isPending, and mutate through context...
}
```

The queue and `mutate` are the same as in `CalendarBoard`. If someone moves an event and then resizes it, `pendingChanges` contains the move followed by the resize, and a hook can replay both over the events a board received from the server:

```tsx
// features/calendar/hooks/use-optimistic-events.ts
"use client";

import { useCalendarEvents } from "@/providers/calendar-events-provider";
import { eventChangeReducer } from "../utils/event-change-reducer";

// Simplified without recurring events
export function useOptimisticEvents(events: CalendarEvent[]) {
  const { pendingChanges } = useCalendarEvents();

  return pendingChanges.reduce(eventChangeReducer, events);
}
```

Flow's version also takes the visible `days`, so it can expand recurring events before the reduce.

### Rolling Back Failed Event Changes

By the time the server rejects a write, the event has already moved to its optimistic position. Flow's demo events return an error when someone tries to change them. We want to show that error and return the event to its saved position.

Let's check the result from `saveEventChange` inside the queue callback and show the error in a toast:

```tsx
// providers/calendar-events-provider.tsx
export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const [, dispatch, isPending] = useActionState(
    async (_: void, change: EventChange) => {
      const result = await saveEventChange(change);
      if (result.error) {
        toast.error(result.error);
      }
    },
    undefined
  );

  // ...pending changes, mutate, and the contexts...
}
```

If the write fails, the server events remain unchanged. The temporary position stays visible until the Transition finishes, then the board returns to those events and the event moves back. We do not need to calculate a reverse change.

### The Full `CalendarEventsProvider`

For the context itself, let's follow React's guide to [scaling up with reducer and context](https://react.dev/learn/scaling-up-with-reducer-and-context) and separate state from dispatch, so a component that only sends changes does not re-render when the pending changes do.

Here is the provider with both contexts and the hooks that read them:

```tsx
// providers/calendar-events-provider.tsx
"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useOptimistic,
  type ReactNode,
} from "react";
import { toast } from "sonner";
// ...app imports...

type CalendarEventsStateContextValue = {
  isPending: boolean;
  pendingChanges: EventChange[];
};

type CalendarEventsDispatchContextValue = (change: EventChange) => void;

const CalendarEventsStateContext =
  createContext<CalendarEventsStateContextValue | null>(null);
const CalendarEventsDispatchContext =
  createContext<CalendarEventsDispatchContextValue | null>(null);

export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const [, dispatch, isPending] = useActionState(
    async (_: void, change: EventChange) => {
      const result = await saveEventChange(change);
      if (result.error) {
        toast.error(result.error);
      }
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

  const contextValue = { isPending, pendingChanges };

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

Both contexts are in place now, so the Client Components under the provider can call `useOptimisticEvents` to render and `mutate` to change an event.

### Applying Pending Changes in the Calendar Boards

Let's call `useOptimisticEvents` before passing the events from `CalendarWeek` into `useCalendarBoard`, the hook that owns the grid's drag, resize, and selection state:

```tsx
// features/calendar/components/calendar-board.tsx
"use client";

import { useOptimisticEvents } from "../hooks/use-optimistic-events";
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
  const optimisticEvents = useOptimisticEvents(events);
  const { interactions, visibleEvents } = useCalendarBoard({
    calendars,
    days,
    events: optimisticEvents,
  });

  // ...render visibleEvents with interactions in the calendar grid...
}
```

The board never touches `pendingChanges` itself. It asks for the events with the changes already applied. The month view's `CalendarMonthBoard` calls the same hook before grouping events into days.

### Updating and Deleting Events from the Popover

The board also renders `EventPopover` for the selected event, which puts the popover under the provider too. Instead of passing `mutate` down through the board, the popover can read the dispatch context directly:

```tsx
// features/calendar/components/event-popover.tsx
"use client";

import { useCalendarEventsDispatch } from "@/providers/calendar-events-provider";
// ...app imports...

export function EventPopover({ event, onClose }: EventPopoverProps) {
  const mutate = useCalendarEventsDispatch();

  function remove() {
    mutate({ sourceId: event.sourceId, type: "delete" });
  }

  // ...render the details, the edit form, and a delete button...
}
```

Calling `remove` hides the event while `saveEventChange` runs. The edit form sends an `update` change through the same `mutate` function.

This way, the provider keeps the temporary changes and the save queue in one place. The boards still receive their confirmed events from Server Components, and a failed write returns to those events after showing the toast.

**Try it:** [move a demo calendar event in Flow](https://next16-calendar.vercel.app/) and watch it return to its saved position after the error toast. **Code:** [`calendar-events-provider.tsx`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## When to Reach for a Client Data Library

For Huddle's channel layout and Flow's calendar events, the confirmed data stays in Server Components and the optimistic state disappears when the Action finishes. We only have the server data to keep in sync.

Huddle's messages need polling and optimistic updates across several components, so I use a client data library there. The app has equivalent [TanStack Query](https://github.com/aurorascharff/next16-team-chat/tree/main) and [SWR](https://github.com/aurorascharff/next16-team-chat/tree/swr) implementations.

In the SWR version, `MessageThread` still loads the messages on the server and seeds the SWR cache with them:

```tsx
// features/message/components/message-thread.tsx
export async function MessageThread({ channelId }: { channelId: string }) {
  // ...load the current user...
  const messageData = preload(messageKeys.channel(channelId), () =>
    getMessagesForUser(channelId, user.id)
  );

  return (
    <SWRConfig value={{ cacheData: { ...messageData } }}>
      <MessageList channelId={channelId} currentUserId={user.id} />
    </SWRConfig>
  );
}
```

The client hook reads that same key, so it starts from the server data and takes over the polling:

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

That leaves us with two caches to coordinate, so a mutation has to invalidate the Next.js cache in the Server Function and update the relevant SWR keys in the browser.

I reach for a library when the data changes on its own, like messages arriving while you read them. A channel layout only changes when someone drags it, so `useActionState` and `useOptimistic` are enough. Next.js has guides for the same handoff with [SWR](https://nextjs.org/docs/app/guides/client-side-data-fetching/swr#provide-initial-data-from-a-server-component) and with [TanStack Query](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query).

## Conclusion

What I like about this pattern is that Server Components continue to own the data. We only add enough client state to coordinate the interaction, then let the server result take over when the Action finishes.

Putting the reducer, the Action queue, and the optimistic state together is still a fair amount of wiring, and it has the same fundamental pieces in Huddle and Flow. Maybe we'll see these patterns built into React or Next.js in the future.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
