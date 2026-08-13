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
description: Learn how to combine transitions, useActionState, useOptimistic, reducers, and context to keep optimistic interactions ordered and reliable in Next.js Client Components.
---

Async interactions can finish in a different order from the one they started. This is a common problem in interactive web apps, whether a mutation uses `fetch`, a framework Action, or a Server Function. If someone moves an item twice before the first save finishes, the interface should respond to both moves and the final saved state should reflect the order in which they were made.

Frameworks solve this in different ways. [Remix follows browser behavior](https://v2.remix.run/docs/discussion/concurrency) by cancelling superseded requests and discarding stale revalidations. [Solid Router tracks submissions](https://docs.solidjs.com/solid-router/concepts/actions), including their pending inputs, so they can be reflected optimistically before queries revalidate. React's Action APIs let us queue dependent changes with `useActionState` and layer their pending result over confirmed state with `useOptimistic`. I use that pattern for the reorganizable channel groups in [Huddle](https://next16-team-chat.vercel.app/) and event mutations in [Flow](https://next16-calendar.vercel.app/). In this post, I'll build it up from the to-do example in the [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions), apply it to Huddle, and then move it into a provider for Flow.

## Table of contents

## Building the Pattern Step by Step

The React docs show [how to combine `useActionState` with `useOptimistic`](https://react.dev/reference/react/useActionState#using-with-useoptimistic). The [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions) applies the same combination to a to-do list. Let's build that version from the first mutation and add the next piece when the interaction needs it.

### Keeping a Mutation Responsive with a Transition

Let's say a Client Component calls a Server Function when someone deletes an item. We can use a transition to keep the rest of the interface interactive and show a pending state while the request runs:

```tsx
// app/delete-post.tsx
"use client";

import { useTransition } from "react";
import { deletePost } from "./actions";

export function DeletePost({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => deletePost(id))}
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
```

For this button, the transition keeps the page responsive and gives us a pending state for the request. If Actions started through the same `startTransition` overlap, `isPending` stays true until the work finishes, so a shared saving indicator does not flicker as requests settle.

The problem appears when the next change depends on the result of the first one. A transition does not define how the results of custom async Actions should be ordered. When those Actions make requests directly, an earlier request can resolve after a later request and update the interface with an older result. The React docs show this under [out-of-order transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order).

We could disable the whole interaction until the request finishes, but that makes a sortable list or quantity stepper frustrating to use. For updates that build on the previous result, we can make that order part of the state model.

### Queueing Dependent Mutations with useActionState

Now let's say the list can change again before the first request finishes. The [`useActionState`](https://react.dev/reference/react/useActionState) hook gives the next reducer Action the state returned by the previous one:

```tsx
// app/todo-list.tsx
"use client";

import { startTransition, useActionState } from "react";

// The reducer Action and types are omitted.

export function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, dispatch, isPending] = useActionState(
    todosReducer,
    initialTodos
  );

  function runAction(action: TodoAction) {
    startTransition(() => dispatch(action));
  }

  // Render todos and use isPending for the saving indicator.
}
```

React runs reducer Actions dispatched through this hook one at a time. If someone toggles a to-do and then deletes it, the delete receives the list returned by the toggle. The reducer Action can be a Server Function that calculates the next list, saves it, and returns it:

```ts
// app/actions.ts
"use server";

// The database client, pure reducer, and types are omitted.

export async function todosReducer(
  todos: Todo[],
  action: TodoAction
): Promise<Todo[]> {
  const next = applyAction(todos, action);
  await db.saveTodos(next);
  return next;
}
```

The queue belongs to this `useActionState` instance. Writes from other browser sessions still need concurrency rules in the data layer.

The mutations are ordered now, but the rendered `todos` value only changes when an Action finishes. Rapid interactions sit in the queue, so the interface still feels behind the person using it.

### Showing Changes Immediately with useOptimistic

The [`useOptimistic`](https://react.dev/reference/react/useOptimistic) hook lets us render a temporary value while an Action is pending. The first version can calculate a replacement list from the value rendered by the component:

```tsx
// app/todo-list.tsx
"use client";

// Imports, the reducer Action, pure reducer, and types are omitted.

export function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, dispatch, isPending] = useActionState(
    todosReducer,
    initialTodos
  );
  const [optimisticTodos, setOptimisticTodos] = useOptimistic(todos);

  function runAction(action: TodoAction) {
    startTransition(() => {
      setOptimisticTodos(applyAction(optimisticTodos, action));
      dispatch(action);
    });
  }

  // Render optimisticTodos and use isPending for the saving indicator.
}
```

The optimistic setter and queued dispatch run in the same transition, so the list changes while the Server Action waits for its turn.

Event handlers need the explicit `startTransition` wrapper above. A function passed to an Action prop such as `<form action={...}>` already runs inside a transition.

This version passes a complete replacement list calculated from `optimisticTodos` in the current render. Two quick interactions can start from the same list, which lets the second replacement hide the first. An updater function can build on the pending state, but it still sees the base value from when the Transition started. For a list that can receive new server data while changes are pending, we want React to run the pending changes again on top of that data.

### Rebasing Optimistic Updates with a Reducer

A reducer lets us pass the action itself to `useOptimistic` instead of calculating the list in the event handler. React receives both the latest base state and the pending actions, so it can run the update again when either changes:

```tsx
// app/todo-list.tsx
const [optimisticTodos, addOptimistic] = useOptimistic(todos, applyAction);

function runAction(action: TodoAction) {
  startTransition(() => {
    addOptimistic(action);
    dispatch(action);
  });
}
```

The event handler can pass a `TodoAction`, while a pure reducer owns the rules for adding, toggling, editing, and deleting:

```ts
// app/reducer.ts
export type Todo = {
  id: string;
  text: string;
  done: boolean;
};

export type TodoAction =
  | { type: "add"; id: string; text: string }
  | { type: "toggle"; id: string }
  | { type: "edit"; id: string; text: string }
  | { type: "delete"; id: string };

export function applyAction(todos: Todo[], action: TodoAction): Todo[] {
  switch (action.type) {
    case "add":
      return [...todos, { id: action.id, text: action.text, done: false }];
    case "toggle":
      return todos.map(todo =>
        todo.id === action.id ? { ...todo, done: !todo.done } : todo
      );
    case "edit":
      return todos.map(todo =>
        todo.id === action.id ? { ...todo, text: action.text } : todo
      );
    case "delete":
      return todos.filter(todo => todo.id !== action.id);
  }
}
```

The reducer receives the current optimistic list, so a delete can build on a pending toggle. If `todos` changes during the Transition, React starts with the new list and runs the pending actions again. This is why the React docs recommend the [reducer form of `useOptimistic`](https://react.dev/reference/react/useOptimistic#choosing-between-updaters-and-reducers) when the base state can change.

The Server Function can call the same pure reducer to calculate what it saves. The optimistic list and confirmed list now follow the same update rules.

Open the SPA example and add, toggle, or delete several to-dos without waiting for the previous change to finish. The list updates as you interact with it while the Actions run in order.

**Try it:** [**Next.js SPA example**](https://next-spa-patterns.labs.vercel.dev/mutations). **Code:** [**app/mutations**](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/mutations).

The SPA example gives us the complete pattern in one Client Component. Now we can apply it to an interface where several changes affect the same ordered layout.

## Using the Pattern for Group Reordering

In [Huddle](https://next16-team-chat.vercel.app/), people can add, rename, delete, and reorder custom channel groups. They can also drag channels within a group or into another group. Several of those changes can happen before the first database write finishes.

Open Huddle and move a channel between groups. Move it again, then reorder a group. The sidebar applies the changes immediately while it saves the layouts in order.

### Modeling Group Changes as Actions

The sidebar represents the changes with one `LayoutAction` union. The pure [`applyLayoutAction`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/utils/channel-layout-reducer.ts) reducer handles all of them:

```ts
// features/channel/utils/channel-layout-reducer.ts
export type LayoutAction =
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

export function applyLayoutAction(
  groups: LayoutGroup[],
  action: LayoutAction
): LayoutGroup[] {
  switch (action.type) {
    case "move": {
      const next = groups.map(group => ({
        ...group,
        channels: group.channels.filter(
          channel => channel.id !== action.channelId
        ),
      }));
      const moved = groups
        .flatMap(group => group.channels)
        .find(channel => channel.id === action.channelId);
      if (!moved) return groups;

      const target = next.find(group => group.name === action.toGroup);
      if (!target) return groups;

      const index = Math.max(
        0,
        Math.min(action.toIndex, target.channels.length)
      );
      target.channels.splice(index, 0, moved);
      return next;
    }
    // ...addGroup, renameGroup, deleteGroup, and moveGroup...
  }
}
```

### Saving the Confirmed Layout

The [`channelLayoutReducer`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/channel-actions.ts) Server Function applies the same reducer to the last confirmed state before it writes the complete layout:

```ts
// features/channel/channel-actions.ts
"use server";

export async function channelLayoutReducer(
  groups: LayoutGroup[],
  action: LayoutAction
): Promise<LayoutGroup[]> {
  const user = await verifyAuth();
  const next = applyLayoutAction(groups, action);

  await reorderChannels(user.id, toLayoutPayload(next));
  updateTag(channelTags.user(user.id));

  return next;
}
```

### Combining Queued and Optimistic State

The [`ChannelNav`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx) component connects the queued state and optimistic state:

```tsx
// features/channel/components/channel-nav.tsx
"use client";

// Imports, the reducer Action, pure reducer, and types are omitted.

type Props = {
  groups: LayoutGroup[];
};

export function ChannelNav({ groups: initialGroups }: Props) {
  const [groups, dispatch] = useActionState(
    channelLayoutReducer,
    initialGroups
  );
  const [optimisticGroups, addOptimistic] = useOptimistic(
    groups,
    applyLayoutAction
  );

  function runAction(action: LayoutAction) {
    startTransition(() => {
      addOptimistic(action);
      dispatch(action);
    });
  }

  // Drag, add, rename, delete, and move handlers call runAction.
  // The sidebar renders optimisticGroups.
}
```

The `runAction` function sends the same `LayoutAction` to both hooks. The optimistic reducer applies it to the layout on screen, while the async reducer applies it to the last confirmed layout and returns the saved result to the next queued Action. A second drag can render immediately without changing the order in which the layouts are saved.

**Try it:** [**Huddle**](https://next16-team-chat.vercel.app/). **Code:** [**channel-nav.tsx**](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx).

## Scaling the Pattern Across the Calendar

The Huddle sidebar keeps the queue and the rendered layout in one Client Component. In [Flow](https://next16-calendar.vercel.app/), Server Components fetch the events, calendar views render them, and controls elsewhere in the tree can change them. I moved the same queue into context so those components can share it.

This follows the composition in React's [scaling a reducer with context](https://react.dev/learn/scaling-up-with-reducer-and-context) guide. The guide keeps the reducer in a provider and uses two contexts, one for the current state and one for dispatch. I used the same idea in my earlier post about [using `useOptimistic` across the component tree](/posts/utilizing-useoptimistic-across-the-component-tree-in-nextjs). The difference here is that the provider also owns the `useActionState` queue.

The [`CalendarEventsProvider`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx) contains the same hook combination as `ChannelNav`. The relevant part is small:

```tsx
// providers/calendar-events-provider.tsx
"use client";

// Imports, the context type, reducer helpers, and Server Action are omitted.

const CalendarEventsStateContext =
  createContext<CalendarEventsStateContextValue | null>(null);
const CalendarEventsDispatchContext =
  createContext<CalendarEventsDispatchContextValue | null>(null);

// reduceCalendarEvents calls the Server Function and handles notifications.
export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch, isPending] = useActionState(
    reduceCalendarEvents,
    initialEventMutationState
  );
  const [optimisticState, applyOptimisticAction] = useOptimistic(
    state,
    applyOptimisticEventAction
  );

  const mutate = useCallback(
    (action: EventAction) => {
      startTransition(() => {
        applyOptimisticAction(action);
        dispatch(action);
      });
    },
    [applyOptimisticAction, dispatch]
  );
  const getEvents = useCallback(
    (events: CalendarEvent[], days: string[]) =>
      applyEventActions(events, optimisticState.actions, days),
    [optimisticState.actions]
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

Calendar views call `useCalendarEvents()` to apply pending actions to the events they received from the server. Mutation controls call `useCalendarEventsDispatch()` to start an action. Keeping the values in separate contexts means a control that only dispatches does not subscribe to optimistic state changes. The server still owns the event data, while the provider shares the queue across the calendar.

Create an event in Flow, then move or resize it again before the first save finishes. The calendar follows the interaction while the provider keeps the writes in the same queue.

**Try it:** [**Flow**](https://next16-calendar.vercel.app/). **Code:** [**calendar-events-provider.tsx**](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## Choosing Between Context and a Server-State Library

Flow has one shared optimistic concern. The calendar controls and views need access to the same event mutation queue, while the event list still comes from Server Components. A provider is enough because the event queue does not need to become a general browser cache.

The tradeoff changes when Client Components coordinate several kinds of server state. Recreating shared cache identities, request deduplication, revalidation, and optimistic mutations through custom providers means maintaining a server-state layer inside the app. Libraries such as TanStack Query and SWR already own those concerns.

Huddle coordinates more client-side server state. I use TanStack Query on the main branch to coordinate messages, unread state, activity, and their mutations. I also keep an SWR branch of the same app. The [Next.js client-side data fetching guide](https://nextjs.org/docs/app/guides/client-side-data-fetching) covers both libraries, including how they can receive initial data from Server Components and continue managing it in the browser.

I reach for context when one state model needs to be shared within a subtree. When the browser has to coordinate several resources with separate revalidation and mutation behavior, I use a client data-fetching library.

## Conclusion

You do not need this full setup for most mutations. I would use it when someone can change the same state again before the first write finishes. Describe those changes as actions in a pure reducer, pass them to both `useOptimistic` and `useActionState`, and keep the hooks in the component that owns the interaction. Move them into a provider when other parts of the tree need to render or dispatch against the same optimistic state.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
