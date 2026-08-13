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

Client Components can call Server Functions directly, but coordinating repeated mutations takes more than an async event handler. A transition keeps the interface responsive while work runs. If several updates depend on one another, we also need to preserve their order and show the result before the server responds.

I used the same pattern for two different interfaces: the reorganizable channel groups in [Huddle](https://next16-team-chat.vercel.app/) and event mutations in [Flow](https://next16-calendar.vercel.app/). In this post, I'll build up the pattern with the to-do list from the [Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications), apply it to Huddle, and then scale it across the calendar component tree with a provider.

## Table of contents

## Why a Transition Is Not Enough

Let's say a Client Component calls a Server Function when someone deletes an item. We can use a transition to keep the rest of the interface interactive and show a pending state while the request runs:

```tsx
// app/delete-todo.tsx
"use client";

import { useTransition } from "react";
import { deleteTodo } from "./actions";

export function DeleteTodo({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => deleteTodo(id))}
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
```

This works when the mutation stands on its own. The component stays responsive, and `isPending` covers the async work inside the Action.

The problem appears when someone can make another change before the first one finishes. Actions started inside transitions do not guarantee that requests finish in the same order they started. An earlier request can resolve after a later request, leaving client state based on the wrong response. The React docs call this out under [out-of-order transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order).

We could disable the whole interaction until the request finishes, but that makes a sortable list or quantity stepper frustrating to use. For updates that build on the result of the previous update, we can queue the work instead.

## Queueing Mutations with useActionState

The [`useActionState`](https://react.dev/reference/react/useActionState) hook stores the value returned by an Action and passes it to the next dispatched call. Its reducer Action receives the previous state and a payload, performs side effects, and returns the next state:

```tsx
// app/todo-list.tsx
"use client";

import { useActionState } from "react";
import { todosReducer } from "./actions";

export function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, dispatch, isPending] = useActionState(
    todosReducer,
    initialTodos
  );

  // ...
}
```

Calling `dispatch` several times does not start several reducer Actions in parallel. React queues the calls and executes them sequentially. The next call receives the state returned by the previous one, so a toggle followed by a delete is applied in that order.

The reducer Action can be a Server Function. The to-do example in the Next.js SPA guide calculates the next list, saves it, and returns it:

```ts
// app/actions.ts
"use server";

import { db } from "./db";
import { applyAction, type Todo, type TodoAction } from "./reducer";

export async function todosReducer(
  todos: Todo[],
  action: TodoAction
): Promise<Todo[]> {
  const next = applyAction(todos, action);
  await db.saveTodos(next);
  return next;
}
```

The queue prevents responses from this `useActionState` instance from overtaking one another. Database writes from other users still need the usual concurrency rules in the data layer. Here, we are solving the ordering of actions dispatched by this interface.

The mutations are ordered now, but the rendered `todos` value only changes when an Action finishes. Rapid interactions sit in the queue, so the interface still feels behind the person using it.

## Showing Changes Immediately with useOptimistic

The [`useOptimistic`](https://react.dev/reference/react/useOptimistic) hook lets us render a temporary value while an Action is pending. We can combine it with `useActionState` so the UI updates now while the mutation waits for its turn in the queue:

```tsx
// app/todo-list.tsx
"use client";

import { startTransition, useActionState, useOptimistic } from "react";
import { todosReducer } from "./actions";
import { applyAction, type Todo, type TodoAction } from "./reducer";

export function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, dispatch, isPending] = useActionState(
    todosReducer,
    initialTodos
  );
  const [optimisticTodos, addOptimistic] = useOptimistic(todos, applyAction);

  function runAction(action: TodoAction) {
    startTransition(() => {
      addOptimistic(action);
      dispatch(action);
    });
  }

  return (
    <>
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id}>
            <input
              checked={todo.done}
              onChange={() => runAction({ type: "toggle", id: todo.id })}
              type="checkbox"
            />
            {todo.text}
            <button onClick={() => runAction({ type: "delete", id: todo.id })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {isPending && <p>Syncing to server…</p>}
    </>
  );
}
```

Both calls belong to the same transition. `addOptimistic` changes the rendered list on the current frame, while `dispatch` adds the Server Action to the queue. As queued Actions complete, `todos` becomes the new base state and React reapplies any optimistic actions that are still pending. When the queue finishes, the optimistic state settles onto the confirmed `todos` value.

Event handlers need the explicit `startTransition` wrapper above. A function passed to an Action prop such as `<form action={...}>` already runs inside a transition.

We could pass a replacement list to `useOptimistic`, but that list would be calculated from whatever happened to render when the event handler ran. A reducer makes the update relative to the current optimistic state.

## Layering Optimistic Updates with a Reducer

A to-do list supports several changes, so we can describe them with an action union and keep the update logic in a pure reducer:

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

The first argument to `applyAction` is the current state, similar to the updater form of `useState`. If we dispatch a toggle and then a delete while both Server Actions are pending, React applies the second action to the optimistic result of the first.

The reducer also handles a base state update during the transition. When `todos` changes while optimistic actions are still pending, React runs the reducer again with the new `todos` value. The pending changes are layered on top of the latest server state rather than a list captured before the requests started. This rebasing behavior is why the React docs recommend the [reducer form of `useOptimistic`](https://react.dev/reference/react/useOptimistic#choosing-between-updaters-and-reducers) for lists and other state with several action types.

The same pure function runs in two places. `useOptimistic` uses it to predict the UI, and the Server Function uses it to calculate the value to persist. That gives both paths the same rules for add, toggle, edit, and delete.

**Try it:** [Next.js SPA mutations example](https://next-spa-patterns.labs.vercel.dev/mutations). **Code:** [app/mutations](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/mutations).

Now we can use the pattern for a list that has more involved actions than a to-do list.

## Reorganizing the Huddle Sidebar

In Huddle, people can add, rename, delete, and reorder custom channel groups. They can also drag channels within a group or into another group. Several of those changes can happen before the first database write finishes.

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

The [`ChannelNav`](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx) component connects the queued state and optimistic state:

```tsx
// features/channel/components/channel-nav.tsx
"use client";

import { startTransition, useActionState, useOptimistic } from "react";
import { channelLayoutReducer } from "@/features/channel/channel-actions";
import {
  applyLayoutAction,
  type LayoutAction,
  type LayoutGroup,
} from "@/features/channel/utils/channel-layout-reducer";

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

A drag updates `optimisticGroups` as soon as the channel is dropped. If another change follows, the reducer applies it to that optimistic layout. The Server Functions run in order and return the confirmed layout after each write.

This way, the Huddle sidebar remains interactive while its custom groups are saved, and the optimistic and persisted paths share the same layout rules.

**Try it:** [Huddle](https://next16-team-chat.vercel.app/). **Code:** [channel-nav.tsx](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx).

The sidebar keeps the state and all the controls in one Client Component. The Flow calendar has mutation controls and event views in several parts of the tree, so the next step is making the same action queue available to all of them.

## Scaling Optimistic State with Reducer and Context

One of the first posts I wrote covered [using `useOptimistic` across the component tree](/posts/utilizing-useoptimistic-across-the-component-tree-in-nextjs) when the hook was still in React Canary. The core idea was to put the optimistic state and its dispatcher in context. Flow develops that idea with the current reducer APIs and a `useActionState` queue.

This follows the same composition described in React's guides for [`useReducer`](https://react.dev/reference/react/useReducer) and [scaling a reducer with context](https://react.dev/learn/scaling-up-with-reducer-and-context). Context does not replace the reducer. It makes the state and dispatcher available to components below the provider without passing them through intermediate components.

The calendar has more than one mutation source. Creating an event starts in a dialog, dragging and resizing happen in the calendar board hook, and editing or deleting happens in an event popover. The week and month boards both need to render those changes. A saving indicator in the header also needs the pending state.

Instead of storing a second copy of all calendar events in the provider, Flow stores the pending `EventAction` values:

```ts
// features/calendar/utils/event-optimistic-reducer.ts
export type EventMutationState = {
  actions: EventAction[];
  notification: {
    message: string;
    type: "error" | "success";
  } | null;
};

export const initialEventMutationState: EventMutationState = {
  actions: [],
  notification: null,
};

export function applyOptimisticEventAction(
  state: EventMutationState,
  action: EventAction
): EventMutationState {
  return {
    actions: [...state.actions, action],
    notification: null,
  };
}

export function applyEventActions(
  events: CalendarEvent[],
  actions: EventAction[],
  days: string[]
) {
  return actions.reduce((current, action) => {
    if (action.type === "move") {
      return moveRecurringEvent(current, action, days);
    }
    if (action.type !== "create") {
      return applyEventAction(current, action);
    }

    return expandOptimisticEvent(action.event, days).reduce(
      (created, event) => applyEventAction(created, { event, type: "create" }),
      current
    );
  }, events);
}
```

The action list can be applied to whichever server-rendered event list a board receives. When a fresh list arrives, the pending actions are reduced over that new base. It also lets the recurrence logic use the days in the current week or month instead of tying the provider to one route's event data.

The [`CalendarEventsProvider`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx) combines the queue, optimistic reducer, and context:

```tsx
// providers/calendar-events-provider.tsx
"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useOptimistic,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { calendarEventsReducer } from "@/features/calendar/calendar-actions";
import type { CalendarEvent } from "@/features/calendar/types/calendar";
import {
  applyEventActions,
  applyOptimisticEventAction,
  initialEventMutationState,
} from "@/features/calendar/utils/event-optimistic-reducer";
import type {
  EventAction,
  EventMutationState,
} from "@/features/calendar/utils/event-optimistic-reducer";

type CalendarEventsContextValue = {
  getEvents: (events: CalendarEvent[], days: string[]) => CalendarEvent[];
  isPending: boolean;
  mutate: (action: EventAction) => void;
};

const CalendarEventsContext = createContext<CalendarEventsContextValue | null>(
  null
);

async function reduceCalendarEvents(
  state: EventMutationState,
  action: EventAction
) {
  const next = await calendarEventsReducer(state, action);

  if (next.notification?.type === "error") {
    toast.error(next.notification.message);
  } else if (next.notification) {
    toast.success(next.notification.message);
  }

  return next;
}

export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch, isPending] = useActionState(
    reduceCalendarEvents,
    initialEventMutationState
  );
  const [optimisticState, applyOptimisticAction] = useOptimistic(
    state,
    applyOptimisticEventAction
  );

  function mutate(action: EventAction) {
    startTransition(() => {
      applyOptimisticAction(action);
      dispatch(action);
    });
  }

  return (
    <CalendarEventsContext.Provider
      value={{
        getEvents: (events, days) =>
          applyEventActions(events, optimisticState.actions, days),
        isPending,
        mutate,
      }}
    >
      {children}
    </CalendarEventsContext.Provider>
  );
}
```

The provider exposes three things. Mutation controls call `mutate(action)`, boards call `getEvents(events, days)`, and the saving indicator reads `isPending`.

For example, the week board applies the optimistic actions to its server data before passing the events into its interaction hook:

```tsx
// features/calendar/components/calendar-board.tsx
"use client";

import { useCalendarEvents } from "@/providers/calendar-events-provider";

export function CalendarBoard({ calendars, days, events }: Props) {
  const { getEvents } = useCalendarEvents();
  const eventDays = [...days, shiftDay(days.at(-1)!, 1)];

  const {
    // ...
    visibleEvents,
  } = useCalendarBoard({
    calendars,
    days,
    events: getEvents(events, eventDays),
  });

  // ...
}
```

The drag handler can dispatch a move from deeper in the tree without owning the event list:

```tsx
// features/calendar/hooks/use-calendar-board.ts
import { useCalendarEvents } from "@/providers/calendar-events-provider";

export function useCalendarBoard({
  calendars,
  days,
  events,
}: {
  calendars: Calendar[];
  days: string[];
  events: CalendarEvent[];
}) {
  const { mutate } = useCalendarEvents();

  function handleMoveUp(pointerEvent: React.PointerEvent<HTMLElement>) {
    // ...resolve the final drag target...
    const start = minutesToTime(target.startMin);
    const { day, id } = target;
    const sourceId = origin.sourceId;

    void mutate({ day, id, sourceId, start, type: "move" });
  }

  // ...
}
```

The event moves immediately in the board. The Server Function saves the action when it reaches the front of the queue, invalidates the affected cache tags, and returns an empty pending action list. If a known error comes back, the provider shows a toast and the optimistic change falls away because it was never added to the confirmed server data.

This way, Flow coordinates creates, moves, resizes, edits, and deletes through one queue while the week view, month view, dialogs, popovers, and saving indicator use the same optimistic state.

**Try it:** [Flow](https://next16-calendar.vercel.app/). **Code:** [calendar-events-provider.tsx](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## Choosing the Smallest Pattern

The hooks solve separate parts of an interaction. We can add them as the use case grows:

| Need                                                          | API or pattern                      |
| ------------------------------------------------------------- | ----------------------------------- |
| Keep the UI responsive and track pending async work           | `useTransition`                     |
| Apply dependent Actions in dispatch order                     | `useActionState`                    |
| Render a temporary value before the Action completes          | `useOptimistic`                     |
| Reapply pending changes when the base state changes           | The reducer form of `useOptimistic` |
| Share optimistic state and mutation controls across a subtree | Context                             |

A standalone delete button might only need a transition. A counter whose next write depends on the previous result can use `useActionState`. A reorderable list benefits from queued Actions plus a `useOptimistic` reducer. Context becomes useful when the components that start mutations and the components that render their result are spread across the tree.

## Conclusion

The important part of this pattern is keeping three concerns separate. `useActionState` orders the side effects, `useOptimistic` renders pending changes, and a pure reducer defines how an action transforms state. When that state needs to reach several components, a provider can expose the optimistic view and dispatcher without moving the server-fetched data into a client store.

The to-do list in the Next.js SPA guide is a compact version of the pattern. Huddle uses it for a reorderable sidebar, and Flow carries the same approach across a calendar where several components can create or change events.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
