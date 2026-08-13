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

I used the same pattern for two different interfaces: the reorganizable channel groups in [Huddle](https://next16-team-chat.vercel.app/) and event mutations in [Flow](https://next16-calendar.vercel.app/). In this post, I'll start with how React documents the pattern and the to-do version I wrote for the Next.js SPA guide, apply it to Huddle, and then scale it across the calendar component tree with a provider.

## Table of contents

## Building the Pattern Step by Step

The React docs show [how to combine `useActionState` with `useOptimistic`](https://react.dev/reference/react/useActionState#using-with-useoptimistic). Their example updates a quantity optimistically and dispatches the async reducer Action in the same transition.

I used the same combination in the [mutating data section of the Next.js SPA guide](https://nextjs.org/docs/app/guides/single-page-applications#mutating-data-with-server-actions). The guide adapts it to a to-do list where a shared reducer calculates the optimistic UI and the value saved by a Server Action. We can build that version one piece at a time.

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

This works when the mutation stands on its own. The component stays responsive, and `isPending` stays true until the async Action finishes.

The problem appears when the next change depends on the result of the first one. A transition marks work as non-blocking and tracks whether it is pending, but the transition primitive does not define how the results of custom async Actions should be ordered. When those Actions make requests directly, an earlier request can resolve after a later request and update the interface with an older result. The React docs show this under [out-of-order transition updates](https://react.dev/reference/react/useTransition#my-state-updates-in-transitions-are-out-of-order).

We could disable the whole interaction until the request finishes, but that makes a sortable list or quantity stepper frustrating to use. For updates that build on the previous result, we can make that order part of the state model.

### Queueing Dependent Mutations with useActionState

The [`useActionState`](https://react.dev/reference/react/useActionState) hook stores the value returned by an Action and passes it to the next dispatched call. Its reducer Action receives the previous state and a payload, performs side effects, and returns the next state:

```tsx
// app/todo-list.tsx
"use client";

import { startTransition, useActionState } from "react";
import { todosReducer } from "./actions";
import type { Todo, TodoAction } from "./reducer";

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

Calling `dispatch` several times does not start several reducer Actions in parallel. React queues the calls and executes them sequentially. The next call receives the state returned by the previous one, so a toggle followed by a delete is calculated in that order.

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

Next.js also [queues Server Actions](https://nextjs.org/docs/app/guides/backend-for-frontend#server-actions) on the client. The additional guarantee from `useActionState` is that React waits for one reducer Action to return and passes its result to the next call. That makes the dependency between the writes explicit in our state model.

The queue belongs to this `useActionState` instance. Writes from other browser sessions still need the usual concurrency rules in the data layer. If the reducer Action throws, React skips the remaining queued calls and sends the error to the nearest Error Boundary. Expected errors should be returned as state instead, which we will do in the Flow example.

The mutations are ordered now, but the rendered `todos` value only changes when an Action finishes. Rapid interactions sit in the queue, so the interface still feels behind the person using it.

### Showing Changes Immediately with useOptimistic

The [`useOptimistic`](https://react.dev/reference/react/useOptimistic) hook lets us render a temporary value while an Action is pending. The first version can calculate a replacement list from the value rendered by the component:

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

The optimistic setter and the queued dispatch run in the same transition. The list updates immediately while the Server Action waits for its turn.

Event handlers need the explicit `startTransition` wrapper above. A function passed to an Action prop such as `<form action={...}>` already runs inside a transition.

This version calculates the replacement list from `optimisticTodos` captured by the current render. That works while the base list stays the same. If new server data arrives while the Action is pending, the replacement can be based on an older list. We need a way to describe the change without calculating the next list in the event handler.

### Rebasing Optimistic Updates with a Reducer

A reducer lets us pass the action itself to `useOptimistic`. React can then calculate the result from the current optimistic state:

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

The to-do list supports several changes, so we can describe them with an action union and keep the update logic in a pure reducer:

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

The first argument to `applyAction` is the current optimistic state, similar to the updater form of `useState`. If we dispatch a toggle and then a delete while both Server Actions are pending, React applies the second action to the optimistic result of the first.

The reducer also handles a base state update during the transition. When `todos` changes while optimistic actions are still pending, React runs the reducer again with the new `todos` value. The pending changes are layered on top of the latest server state rather than a list captured before the requests started. This rebasing behavior is why the React docs recommend the [reducer form of `useOptimistic`](https://react.dev/reference/react/useOptimistic#choosing-between-updaters-and-reducers) for lists and other state with several action types.

The same pure function runs in two places. The optimistic reducer uses it to predict the UI, and the Server Function uses it to calculate the value to persist. That gives both paths the same rules for add, toggle, edit, and delete.

**Try it:** [Next.js SPA mutations example](https://next-spa-patterns.labs.vercel.dev/mutations). **Code:** [app/mutations](https://github.com/vercel-labs/next-spa-patterns/tree/main/app/mutations).

The SPA example gives us the complete pattern in one Client Component. Now we can apply it to an interface where several changes affect the same ordered layout.

## Using the Pattern for Group Reordering

In Huddle, people can add, rename, delete, and reorder custom channel groups. They can also drag channels within a group or into another group. Several of those changes can happen before the first database write finishes.

**Try it:** Open [Huddle](https://next16-team-chat.vercel.app/) and move a channel between groups. Move it again, then reorder a group. The sidebar applies the changes immediately while it saves the layouts in order.

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

A drag updates `optimisticGroups` as soon as the channel is dropped. If another change follows, the reducer applies it to that optimistic layout. The queued reducer Actions run in order and return the confirmed layout after each write.

The two hooks use the same action in different ways. The optimistic reducer applies it to the layout currently on screen. The async reducer receives the last confirmed layout, saves the next one, and returns it for the following queued Action.

This way, the Huddle sidebar remains interactive while its custom groups are saved, and the optimistic and persisted paths share the same layout rules.

**Code:** [channel-nav.tsx](https://github.com/aurorascharff/next16-team-chat/blob/main/features/channel/components/channel-nav.tsx).

## Scaling the Pattern Across the Calendar

The Huddle sidebar keeps the queue and the rendered layout in one Client Component. In Flow, Server Components fetch the events, calendar views render them, and controls elsewhere in the tree can change them. I moved the same queue into context so those components can share it.

This follows the composition in React's [scaling a reducer with context](https://react.dev/learn/scaling-up-with-reducer-and-context) guide. I used the same idea in my earlier post about [using `useOptimistic` across the component tree](/posts/utilizing-useoptimistic-across-the-component-tree-in-nextjs). The difference here is that the provider also owns the `useActionState` queue.

The [`CalendarEventsProvider`](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx) contains the same hook combination as `ChannelNav`. The relevant part is small:

```tsx
// providers/calendar-events-provider.tsx
const [state, dispatch] = useActionState(
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

const getEvents = (events: CalendarEvent[], days: string[]) =>
  applyEventActions(events, optimisticState.actions, days);
```

Mutation controls call `mutate(action)`. Calendar views call `getEvents` with the events they received from the server. That function applies the pending optimistic actions to the server data before the view renders it.

That is the whole extension of the Huddle pattern. The server still owns the event data, while context gives the controls and views access to the same optimistic queue.

**Try it:** [Flow](https://next16-calendar.vercel.app/). **Code:** [calendar-events-provider.tsx](https://github.com/aurorascharff/next16-calendar/blob/main/providers/calendar-events-provider.tsx).

## Choosing the Smallest Pattern

The hooks solve separate parts of an interaction. We can add them as the use case grows:

| Need                                                          | API or pattern                      |
| ------------------------------------------------------------- | ----------------------------------- |
| Keep the UI responsive and track pending async work           | `useTransition`                     |
| Run dependent reducer Actions in dispatch order               | `useActionState`                    |
| Render a temporary value before the Action completes          | `useOptimistic`                     |
| Reapply pending changes when the base state changes           | The reducer form of `useOptimistic` |
| Share optimistic state and mutation controls across a subtree | Context                             |

A standalone delete button might only need a transition. A counter whose next write depends on the previous result can use `useActionState`. A reorderable list benefits from queued Actions plus a `useOptimistic` reducer. Context becomes useful when the components that start mutations and the components that render their result are spread across the tree.

## Conclusion

The important part of this pattern is keeping three concerns separate. `useActionState` orders the reducer Actions dispatched through one hook, `useOptimistic` renders pending changes, and a pure reducer defines how an action transforms client state. When that state needs to reach several components, a provider can expose the optimistic view and dispatcher without moving the server-fetched data into a client store.

The to-do list in the Next.js SPA guide is a compact version of the pattern. Huddle uses it for a reorderable sidebar, and Flow carries the same approach across a calendar where several components can create or change events.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
