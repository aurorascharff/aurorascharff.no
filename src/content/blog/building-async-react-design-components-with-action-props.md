---
author: Aurora Scharff
pubDatetime: 2026-02-23T08:00:00Z
title: Building Async React Design Components with Action Props
slug: building-async-react-design-components-with-action-props
featured: true
draft: false
tags:
  - Async React
  - Actions
  - React 19
  - Next.js
  - App Router
  - Component Libraries
description: Learn how to build reusable design components that expose action props and internally manage optimistic updates, loading states, and automatic rollback, so consumers just pass a value and an action.
---

In a [previous post](/posts/building-reusable-components-with-react19-actions), we built a reusable select component with an action prop. Since then, React Conf 2025 established the concept of Async React, giving us proper terminology for these patterns. In this post, we'll take it further and build "design components": self-contained components that encapsulate all async coordination internally, including optimistic updates, localized loading indicators, and automatic rollback on failure.

For an overview or refresher on Async React, check out my article [The next era of React has arrived](https://blog.logrocket.com/the-next-era-of-react/) on LogRocket.

## Table of contents

## Actions and the Action Prop Pattern

Per the [React docs](https://react.dev/reference/react/useTransition#starttransition), Actions are functions called inside transitions that React coordinates. To build the pattern in this post, we'll use two Async React primitives:

- [`useTransition`](https://react.dev/reference/react/useTransition): wraps async work into an Action, keeping the UI responsive, and provides an `isPending` flag.
- [`useOptimistic`](https://react.dev/reference/react/useOptimistic): shows temporary state for the duration of an Action that reverts automatically on failure.

Together, they give us a declarative, consistent coordination system for async work: optimistic updates, pending indicators, and automatic rollback. Errors in Actions also bubble to error boundaries, so unexpected failures are handled for free.

The [React docs on exposing action props](https://react.dev/reference/react/useTransition#exposing-action-props-from-components) describe a pattern where components accept action functions as props and run them inside transitions internally, combining both primitives so consumers just pass a value and an action. The new [`useOptimistic` docs](https://react.dev/reference/react/useOptimistic#using-optimistic-state-in-action-props) expand on this with examples of using optimistic state inside action props.

In the future, component libraries and design systems should ship components with action props built in, but until then, we can build them ourselves.

## Example 1: TabList

Let's build a reusable tab list component. A basic version might look like this:

```tsx
"use client";

type TabListProps = {
  tabs: { label: string; value: string }[];
  activeTab: string;
  onChange: (value: string) => void;
};

export function TabList({ tabs, activeTab, onChange }: TabListProps) {
  return (
    <div>
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={tab.value === activeTab ? "active" : ""}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

A consumer might use this to filter posts by status:

```tsx
function PostTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("filter") ?? "all";

  return (
    <TabList
      tabs={tabs}
      activeTab={currentTab}
      onChange={value => {
        router.push(`/dashboard?filter=${value}`);
      }}
    />
  );
}
```

In the Next.js App Router, `router.push()` can trigger async work if a server component uses the new search params for data fetching. The `activeTab` won't update until the navigation completes, so on slow networks the user clicks a tab and nothing happens. From a UX perspective, this is a problem: the user gets no feedback and might think the component is broken.

### Tracking the Pending State

Let's add a `changeAction` prop and track the pending state with `useTransition()`. The "Action" suffix signals that the function runs inside a transition. It accepts both sync and async functions (`void | Promise<void>`), so the consumer can pass either without needing their own `startTransition` wrapper:

```tsx
type TabListProps = {
  tabs: { label: string; value: string }[];
  activeTab: string;
  changeAction: (value: string) => void | Promise<void>;
};

export function TabList({ tabs, activeTab, changeAction }: TabListProps) {
  const [isPending, startTransition] = useTransition();

  function handleTabChange(value: string) {
    startTransition(async () => {
      await changeAction(value);
    });
  }

  return (
    <div>
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => handleTabChange(tab.value)}
          className={tab.value === activeTab ? "active" : ""}
        >
          {tab.label}
        </button>
      ))}
      {isPending && <Spinner />}
    </div>
  );
}
```

Now a spinner shows while the Action is pending. Because the loading indicator lives inside the component, the feedback is localized to the interaction. But the active tab still doesn't update immediately.

### Adding Optimistic Updates

This is where `useOptimistic()` comes in. It creates a temporary client-side state derived from the `activeTab` prop that we can update immediately inside the Action:

```tsx
export function TabList({ tabs, activeTab, changeAction }: TabListProps) {
  const [optimisticTab, setOptimisticTab] = useOptimistic(activeTab);
  const [isPending, startTransition] = useTransition();

  function handleTabChange(value: string) {
    startTransition(async () => {
      setOptimisticTab(value);
      await changeAction(value);
    });
  }

  return (
    <div>
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => handleTabChange(tab.value)}
          className={tab.value === optimisticTab ? "active" : ""}
        >
          {tab.label}
        </button>
      ))}
      {isPending && <Spinner />}
    </div>
  );
}
```

Now the tab switches instantly when clicked, giving the user immediate confirmation that their interaction was registered. The `optimisticTab` holds the new value while the Action is pending, and once the `changeAction` completes and `activeTab` updates from the parent, it settles to the new source of truth.

Because everything runs inside a transition, React coordinates it all into a single stable commit, avoiding intermediate renders and UI flickering. The consumer doesn't need to manage any loading or optimistic state (better DX), and the design component owns both the UI and the async behavior (better UX).

### Adding a Regular onChange

The consumer might also need a regular `onChange` for synchronous side effects outside the Action, so we can accept both:

```tsx
function handleTabChange(value: string) {
  onChange?.(value);
  startTransition(async () => {
    setOptimisticTab(value);
    await changeAction?.(value);
  });
}
```

### The Final TabList

Here is the final implementation with both props:

```tsx
"use client";

import { useOptimistic, useTransition } from "react";

type TabListProps = {
  tabs: { label: string; value: string }[];
  activeTab: string;
  changeAction?: (value: string) => void | Promise<void>;
  onChange?: (value: string) => void;
};

export function TabList({
  tabs,
  activeTab,
  changeAction,
  onChange,
}: TabListProps) {
  const [optimisticTab, setOptimisticTab] = useOptimistic(activeTab);
  const [isPending, startTransition] = useTransition();

  function handleTabChange(value: string) {
    onChange?.(value);
    startTransition(async () => {
      setOptimisticTab(value);
      await changeAction?.(value);
    });
  }

  return (
    <div>
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => handleTabChange(tab.value)}
          className={tab.value === optimisticTab ? "active" : ""}
        >
          {tab.label}
        </button>
      ))}
      {isPending && <Spinner />}
    </div>
  );
}
```

In a real project, you'd use proper tab primitives for accessibility and styling. You can see a full implementation of [`TabList` on GitHub](https://github.com/aurorascharff/next16-async-react-blog/blob/main/components/design/TabList.tsx).

### Usage: PostTabs in a Blog Dashboard

Here is an example of how to use `TabList` in practice. The consumer reads the search params and passes a `changeAction` that pushes to the router:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TabList } from "@/components/design/TabList";

const tabs = [
  { label: "All", value: "all" },
  { label: "Published", value: "published" },
  { label: "Drafts", value: "drafts" },
  { label: "Archived", value: "archived" },
];

export function PostTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("filter") ?? "all";

  return (
    <TabList
      tabs={tabs}
      activeTab={currentTab}
      changeAction={value => router.push(`/dashboard?filter=${value}`)}
    />
  );
}
```

The tabs switch instantly via the optimistic update, and the post list, wrapped in `Suspense`, stays visible while the new filtered data loads in the background. You can try it out on [next16-async-react-blog](https://next16-async-react-blog.vercel.app/dashboard).

## Example 2: EditableText

Let's apply the same pattern to an inline editable text field. The user clicks to edit, types a value, and commits with Enter or a save button.

A basic version might look like this:

```tsx
"use client";

type EditableTextProps = {
  value: string;
  action: (value: string) => void | Promise<void>;
};

export function EditableText({ value, action }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleCommit() {
    setIsEditing(false);
    action(draft);
  }

  function handleCancel() {
    setDraft(value);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") handleCommit();
          if (e.key === "Escape") handleCancel();
        }}
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setIsEditing(true);
      }}
    >
      {value || "Click to edit..."}
    </button>
  );
}
```

When `action` is async (like a Server Function saving to a database), the displayed value doesn't update until the Action completes and the parent re-renders with the new `value` prop.

### Adding Optimistic State and Pending Indicators

Just like with `TabList`, we add `useTransition` and `useOptimistic`:

```tsx
export function EditableText({ value, action }: EditableTextProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleCommit() {
    setIsEditing(false);
    if (draft === optimisticValue) return;
    startTransition(async () => {
      setOptimisticValue(draft);
      await action(draft);
    });
  }

  function handleCancel() {
    setDraft(optimisticValue);
    setIsEditing(false);
  }
  ...
}
```

Now we get the same benefits as `TabList`: the value updates instantly, `isPending` drives a spinner, and failures revert automatically. Because the `action` runs inside a transition, errors bubble to the nearest error boundary. Note that `handleCancel` resets to `optimisticValue` rather than `value`, so the draft reflects the latest pending save if one is still in flight.

### The renderDisplay Prop

Since the optimistic state lives inside the component, how does the consumer control how it's displayed? For example, a revenue goal stores a raw number like `70000`, but should display as `$70,000`. One approach that worked well for me is a `renderDisplay` prop that receives the optimistic value:

```tsx
type EditableTextProps = {
  value: string;
  action: (value: string) => void | Promise<void>;
  onChange?: (value: string) => void;
  renderDisplay?:
    | ((optimisticValue: string) => React.ReactNode)
    | React.ReactNode;
};
```

It accepts either a function or a static `ReactNode`, so the consumer can pass a formatter or a pre-rendered element:

```tsx
const displayValue = optimisticValue
  ? typeof renderDisplay === "function"
    ? renderDisplay(optimisticValue)
    : (renderDisplay ?? optimisticValue)
  : null;
```

The component applies the formatting to the optimistic value internally, so the display updates immediately on commit without the consumer needing access to the optimistic state. Like `TabList`, we also accept an `onChange` callback that fires synchronously on commit alongside `action`, for side effects outside the transition.

### The Final EditableText

Here is the final implementation with editing UI, save/cancel buttons, and keyboard handling:

```tsx
"use client";

import { useOptimistic, useState, useTransition } from "react";

type EditableTextProps = {
  value: string;
  renderDisplay?: ((optimisticValue: string) => React.ReactNode) | React.ReactNode;
  onChange?: (value: string) => void;
  action: (value: string) => void | Promise<void>;
};

export function EditableText({ value, renderDisplay, action, onChange }: EditableTextProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleCommit() {
    setIsEditing(false);
    if (draft === optimisticValue) return;
    onChange?.(draft);
    startTransition(async () => {
      setOptimisticValue(draft);
      await action(draft);
    });
  }

  function handleCancel() { /* ... */ }

  const displayValue = optimisticValue
    ? typeof renderDisplay === "function"
      ? renderDisplay(optimisticValue)
      : (renderDisplay ?? optimisticValue)
    : null;

  if (isEditing) {
    return (
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleCommit();
          if (e.key === 'Escape') handleCancel();
        }}
        autoFocus
      />
      // ... save/cancel buttons
    );
  }

  return (
    <button onClick={() => { setDraft(optimisticValue); setIsEditing(true); }}>
      {displayValue || 'Click to edit...'}
    </button>
    {isPending && <Spinner />}
  );
}
```

In a real project, you'd add proper styling and input prefix handling. You can see a full implementation of [`EditableText` on GitHub](https://github.com/aurorascharff/next16-chart-dashboard/blob/main/components/design/EditableText.tsx).

### Usage: RevenueGoal in a Chart Dashboard

Here is an example of how to use `EditableText` in practice:

```tsx
"use client";

import { use } from "react";
import { saveRevenueGoal } from "@/data/actions/preferences";
import { formatCurrency } from "@/lib/utils";
import { EditableText } from "./design/EditableText";

export function RevenueGoal({
  goalPromise,
}: {
  goalPromise: Promise<number | null>;
}) {
  const goal = use(goalPromise);

  return (
    <EditableText
      value={goal?.toString() ?? ""}
      action={saveRevenueGoal}
      renderDisplay={value => formatCurrency(Number(value))}
      prefix="$"
      type="number"
      placeholder="Set a target..."
    />
  );
}
```

The consumer passes the current value, a Server Function as the `action`, and a `renderDisplay` formatter for currency. Optimistic updates, the pending spinner, and rollback are all handled internally by `EditableText`. You can try it out on [next16-chart-dashboard](https://next16-chart-dashboard.vercel.app/).

## Key Takeaways

- Design components encapsulate async coordination internally using `useTransition` and `useOptimistic`, so consumers just use the `action` prop.
- Optimistic state stays synchronized with the source of truth and reverts automatically when an Action fails, with errors bubbling to error boundaries.
- Actions coordinate multiple async operations into stable commits, avoiding intermediate renders and UI flickering.
- Render props allow consumers to customize how internal state is displayed without moving that state outside the component.
- Name action props with the "Action" suffix to follow Async React conventions.

## Conclusion

The action props pattern applies to any interactive component: selects, checkboxes, search inputs, toggles. Ideally, this logic should live in the component libraries we already use. The React docs now establish this as a first-class pattern, and the [Async React Working Group](https://github.com/reactwg/async-react/discussions) is working with routers, data libraries, and design systems to standardize it, but until then we can build our own.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
