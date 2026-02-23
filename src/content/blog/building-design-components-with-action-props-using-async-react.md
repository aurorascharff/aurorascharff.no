---
author: Aurora Scharff
pubDatetime: 2026-02-23T17:00:00Z
title: Building Design Components with Action Props using Async React
slug: building-design-components-with-action-props-using-async-react
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

React Conf 2025 established the concept of [Async React](https://www.youtube.com/watch?v=B_2E96URooA), introducing three layers: async design, async router, and async data. In this post, we'll put the design layer into practice by building two components from scratch (a tab list and an inline editable text field), progressively improving the UX during async work while keeping optimistic updates and loading states internal so consumers stay simple.

For an overview or refresher on the Async React primitives, check out my article [The next era of React has arrived](https://blog.logrocket.com/the-next-era-of-react/) on LogRocket. For another example, see my [previous post](/posts/building-reusable-components-with-react19-actions) where we built a reusable `Select` component with this pattern before Async React gave us the terminology.

## Table of contents

## Actions and the Action Prop Pattern

The components in this post rely on two Async React primitives:

- [`useTransition`](https://react.dev/reference/react/useTransition): runs async work as an [Action](https://react.dev/reference/react/useTransition#starttransition) (a function inside a transition) that React coordinates, keeping the UI responsive, and provides an `isPending` flag. Errors bubble to error boundaries.
- [`useOptimistic`](https://react.dev/reference/react/useOptimistic): shows temporary state that is coordinated with an async Action and reverts automatically on failure.

The [React docs on exposing action props](https://react.dev/reference/react/useTransition#exposing-action-props-from-components) describe a pattern where components accept action functions as props and run them inside transitions internally. The refreshed [`useOptimistic` docs](https://react.dev/reference/react/useOptimistic#using-optimistic-state-in-action-props) expand on this by combining optimistic state with action props.

The basic pattern looks like this:

```tsx
function DesignComponent({ value, action }) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [isPending, startTransition] = useTransition();

  function handleChange(newValue) {
    startTransition(async () => {
      setOptimistic(newValue);
      await action(newValue);
    });
  }
  // ...
}
```

The component owns the transition, the optimistic state, and the pending UI. The consumer just passes a value and an action.

In the future, component libraries can ship components with action props built in, but until then (or for your own components), we can build them ourselves.

## Example 1: TabList

Let's build a reusable tab list component. A basic version might look like this:

```tsx
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

A consumer might use this to filter content via the URL:

```tsx
import { useRouter, useSearchParams } from "next/navigation";

function FilterTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("filter") ?? "all";

  return (
    <TabList
      tabs={tabs}
      activeTab={currentTab}
      onChange={value => router.push(`/?filter=${value}`)}
    />
  );
}
```

When `onChange` triggers async work (like `router.push` in Next.js, where a Server Component re-renders with new search params), the `activeTab` won't update until the work completes. On slow networks, the user clicks a tab and nothing happens, getting no feedback that their interaction was registered.

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

Now a spinner shows while the Action is pending. Because the loading indicator lives inside the component, the feedback is localized to the interaction, which is a much better experience than a global loading bar. But the active tab still doesn't update immediately.

### Adding Optimistic Updates

This is where `useOptimistic()` comes in. It creates a temporary client-side state derived from the `activeTab` prop that we can set inside the Action before it completes:

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

Now the tab switches instantly when clicked. The `optimisticTab` holds the new value while the Action is pending, and once the `changeAction` completes and `activeTab` updates from the parent, it settles to the new source of truth.

Because everything runs inside a transition, React coordinates it into a single stable commit with no intermediate renders or flickering.

### The Final TabList

The consumer might also need a regular `onChange` for synchronous side effects outside the Action (for example, logging or local state), so the final version accepts both. The `onChange` fires synchronously before the transition starts.

Here is the final `TabList`:

```tsx
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

Let's say we wanted to filter blog posts by status in a blog admin panel, where each tab updates a search param and the page re-renders server-side with the filtered data.

Here is the consumer using the finished `TabList`:

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

Optimistic updates, the pending spinner, and rollback are all handled internally by `TabList`. The tabs switch instantly, and the post list, wrapped in `Suspense`, stays visible while the new filtered data loads in the background. You can try it out on [next16-async-react-blog](https://next16-async-react-blog.vercel.app/dashboard).

## Example 2: EditableText

Let's apply the same pattern to an inline editable text field. The user clicks to edit, types a value, and commits with Enter or a save button.

A basic version might look like this:

```tsx
type EditableTextProps = {
  value: string;
  onSave: (value: string) => void | Promise<void>;
};

export function EditableText({ value, onSave }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleCommit() {
    setIsEditing(false);
    onSave(draft);
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

A consumer might use this to persist a value asynchronously:

```tsx
import { updateName } from "@/actions";

function EditableName({ name }) {
  return (
    <EditableText
      value={name}
      onSave={async newValue => {
        await updateName(newValue);
      }}
    />
  );
}
```

When `onSave` is async, the displayed text doesn't update until it completes and the parent re-renders with the new `value` prop. On slow connections, the user saves and sees stale text with no feedback: the same problem we had with `TabList`.

### Adding Optimistic State and Pending Indicators

Just like with `TabList`, we rename the callback to `action` (signaling it runs inside a transition) and add `useTransition` and `useOptimistic`:

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

Now we get the same benefits as `TabList`: the value updates instantly, `isPending` drives a spinner, and failures revert automatically. Note that `handleCancel` resets to `optimisticValue` rather than `value`, so the draft reflects the latest pending save if one is still in flight.

### Formatting Optimistic State with displayValue

When the optimistic state lives inside the component, how can the consumer control how it's displayed? For example, the stored value might be a raw number but should render as formatted currency. One approach is a render-prop-style `displayValue` prop that receives the optimistic value:

```tsx
type EditableTextProps = {
  value: string;
  action: (value: string) => void | Promise<void>;
  onChange?: (value: string) => void;
  displayValue?: ((value: string) => React.ReactNode) | React.ReactNode;
};
```

It accepts either a function or a static `ReactNode`, so the consumer can pass a formatter or a pre-rendered element. Inside the component, we resolve it against the optimistic value:

```tsx
const resolvedDisplay = optimisticValue
  ? typeof displayValue === "function"
    ? displayValue(optimisticValue)
    : (displayValue ?? optimisticValue)
  : null;
```

Here is what it looks like from the consumer side:

```tsx
<EditableText
  value="70000"
  action={saveValue}
  displayValue={value => formatCurrency(Number(value))} // renders "$70,000"
/>
```

The component applies the formatting to whichever value is current (the confirmed prop or the optimistic update), so the display updates immediately on commit without the consumer needing access to the optimistic state.

### The Final EditableText

Like `TabList`, the final version also accepts an `onChange` callback for synchronous side effects outside the transition.

Here is the final implementation:

```tsx
import { useOptimistic, useState, useTransition } from "react";

type EditableTextProps = {
  value: string;
  displayValue?: ((value: string) => React.ReactNode) | React.ReactNode;
  onChange?: (value: string) => void;
  action: (value: string) => void | Promise<void>;
};

export function EditableText({
  value,
  displayValue,
  action,
  onChange,
}: EditableTextProps) {
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

  function handleCancel() {
    /* ... */
  }

  const resolvedDisplay = optimisticValue
    ? typeof displayValue === "function"
      ? displayValue(optimisticValue)
      : (displayValue ?? optimisticValue)
    : null;

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
      // ... save/cancel buttons
    );
  }

  return (
    <>
      <button
        onClick={() => {
          setDraft(optimisticValue);
          setIsEditing(true);
        }}
      >
        {resolvedDisplay || "Click to edit..."}
      </button>
      {isPending && <Spinner />}
    </>
  );
}
```

In a real project, you'd also extend input attributes via `React.ComponentProps<"input">`. You can see a full implementation of [`EditableText` on GitHub](https://github.com/aurorascharff/next16-chart-dashboard/blob/main/components/design/EditableText.tsx).

### Usage: RevenueGoal in a Sales Dashboard

Let's say we wanted to let users edit a revenue goal inline in a sales dashboard, where the raw number is stored as a string but displayed as formatted currency.

Here is the consumer using the finished `EditableText`:

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
      displayValue={value => formatCurrency(Number(value))}
      prefix="$"
      type="number"
      placeholder="Set a target..."
    />
  );
}
```

The consumer passes the current value, a Server Function as the `action`, and a `displayValue` formatter for currency. The rest is handled internally. You can try it out on [next16-chart-dashboard](https://next16-chart-dashboard.vercel.app/).

## Key Takeaways

- Actions coordinate multiple async operations into stable commits, avoiding intermediate renders and UI flickering.
- Optimistic state stays synchronized with the source of truth and reverts automatically when an Action fails.
- Errors thrown inside Actions bubble to the nearest error boundary, so components don't need manual error handling.
- Design components encapsulate async coordination internally using `useTransition` and `useOptimistic`, so consumers just use the `action` prop.
- Name action props with the "Action" suffix to follow Async React conventions.

## Conclusion

The action props pattern applies to any interactive component: selects, checkboxes, search inputs, toggles. Ideally, this logic should live in the component libraries we already use. Async React has already standardized much of the async routing and loading layers, and the [Async React Working Group](https://github.com/reactwg/async-react/discussions) is now working with UI frameworks to bring the same coordination to the design layer, but until then we can build our own.

I hope this post has been helpful. Please let me know if you have any questions or comments, and follow me on [Bluesky](https://bsky.app/profile/aurorascharff.no) or [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
