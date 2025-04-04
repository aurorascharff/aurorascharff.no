---
author: Aurora Scharff
pubDatetime: 2025-04-04T10:22:00Z
title: Building Reusable Components with React 19 Actions
slug: building-reusable-components-with-react19-actions
featured: false
draft: false
tags:
  - React 19
  - Actions
  - useOptimistic
  - Next.js
  - App Router
  - useTransition
description: In this blog post, we will explore how to build reusable components with React 19 Actions, track transition states, use optimistic updates, and expose action properties for custom logic. 
---

## Table of contents

## React 19 Actions

Per the updated [React docs](https://react.dev/reference/react/useTransition#starttransition), Actions are functions called inside transitions. Transitions can update state and (optionally) perform side effects, and the work will be done in the background without blocking user interactions on the page. All Actions inside a transition will be batched, and the component will re-render only once when the transition is completed.

Actions are useful for handling pending states, errors, optimistic updates and sequential requests automatically. They are also created when using the `form={action}` property on a React 19 form, and when passing a function to `useActionState()`. For a summary of these APIs, refer to my [React 19 Cheatsheet](https://aurorascharff.no/react-19-cheatsheet.png) or the docs.

When using the `useTransition()` hook, you will also get a pending state, which is a boolean that indicates whether the transition is in progress. This is useful for showing loading indicators or disabling buttons while the transition is in progress.

```tsx
const [isPending, startTransition] = useTransition();

const updateNameAction = () => {
  startTransition(async () => {
      await updateName();
  })
})
```

In addition, errors thrown by functions called inside the hook version of `startTransition()` will be caught and can be handled with error boundaries.

Action functions are an alternative to regular event handling, and therefore, should be named accordingly. If not, it will be unclear to the user of that function what sort of behavior they should be expecting.

## The Use Case

Let's say we want to build a reusable select component that will set params in the URL with the values of the select. It could look something like this:

```tsx

export interface RouterSelectProps {
  name: string;
  label?: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}

export const RouterSelect = React.forwardRef<HTMLSelectElement, RouterSelectProps>(
  function Select({ name, label, value, options, setValueAction, ...props },
    ref
  ) {

return (
  <div>
    {label && <label htmlFor={name}>{label}</label>}
    <select
      ref={ref}
      id={name}
      name={name}
      value={value}
      onChange={handleChange}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
  )
}
```

And it might handle the change like this:

```tsx
const handleChange = async (
  event: React.ChangeEvent<HTMLSelectElement>
) => {
  const newValue = event.target.value;

  // Update URL
  const url = new URL(window.location.href);
  url.searchParams.set(name, newValue);

  // Simulate a delay that would occur if the route destination is doing async work
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Navigate
  router.push(url.href, { scroll: false });
};
```

It can be used by passing searchParams from the router:

```tsx
<RouterSelect
  name="lang"
  options={Object.entries(languages).map(([value, label]) => {
    return {
      value,
      label,
    };
  })}
  label="Language"
  value={searchParams.lang}
/>
```

Since we are in the Next.js App Router, when we push to the router with a delay, the value of the select is not updated until the `router.push()` is completed and the search params are updated. This leads to a bad user experience, as the user has to wait for the router push to complete before they see the new value in the select. They might get confused and think that the select is not working.

## Tracking the Pending State with Actions

Let's track the state of the push to the router by creating an Action with the `useTransition()` hook.

We wrap our push to the router in the `startNavTransition()` function, which will track the pending state of that transition. This will allow us to know when the transition is in progress and when it is completed.

```tsx
    const [isNavPending, startNavTransition] =useTransition();

    const handleChange = async (
      event: React.ChangeEvent<HTMLSelectElement>
    ) => {
      const newValue = event.target.value;
      startNavTransition(async () => {
        const url = new URL(window.location.href);
        url.searchParams.set(name, newValue);

        await new Promise((resolve) => setTimeout(resolve, 500));
        router.push(url.href, { scroll: false });
      });
    };
```

Now, we can use the `isNavPending` state to display a loading indicator while the transition is in progress, or add accessibility attributes like `aria-busy`.

```tsx
<div>
  {label && <label htmlFor={name}>{label}</label>}
  <select
    ref={ref}
    id={name}
    name={name}
    value={value}
    onChange={handleChange}
    {...props}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
  {isNavPending && 'Pending nav...'}
</div>
```

Now, the user will get feedback about their interaction with the select, and won't think that the select is not working.

However, the select is still not updating immediately.

## Adding Optimistic Updates with useOptimistic()

This is where `useOptimistic()` comes in. It allows us to update the state immediately, while still tracking the pending state of the transition. We can call it inside the transition:

```tsx
const [optimisticValue, setOptimisticValue] = useOptimistic(value);

const handleChange = async (
  event: React.ChangeEvent<HTMLSelectElement>
) => {
  const newValue = event.target.value;
  startNavTransition(async () => {
    setOptimisticValue(newValue);
    const url = new URL(window.location.href);
    url.searchParams.set(name, newValue);

    await new Promise((resolve) => setTimeout(resolve, 500));
    router.push(url.href, { scroll: false });
  });
};
```

While the transition is pending, `optimisticValue` will be a temporary client-side state that will be used to update the select immediately. Once the transition is completed, `optimisticValue` will settle to the new value from the router.

Now, our select is updating immediately, and the user will see the new value in the select while the transition is in progress.

## Exposing an Action Property

Let's say, as a user of `RouterSelect`, we want to execute additional logic when the select changes. For example, we might want to update some other state in the parent component or trigger a side effect. We can expose a function that will run on select change.

Referring to the [React docs](https://react.dev/reference/react/useTransition#exposing-action-props-from-components), we can expose an `action` property to the parent component. Again, since we are exposing an Action, we should name it accordingly, so the user of the component knows what to expect.

It could look like this:

```tsx
export interface RouterSelectProps {
  name: string;
  label?: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  setValueAction?: (value: string) => void;
}
```

And we can call this property inside the `handleChange` transition:

```tsx
const handleChange = async (
  event: React.ChangeEvent<HTMLSelectElement>
) => {
  const newValue = event.target.value;
  startNavTransition(async () => {
    setOptimisticValue(newValue);
    setValueAction?.(newValue);
    const url = new URL(window.location.href);
    url.searchParams.set(name, newValue);

    await new Promise((resolve) => setTimeout(resolve, 500));
    router.push(url.href, { scroll: false });
  });
};
```

## Using the Action Property in a Parent Component

Now, we can execute state updates through the `setValueAction` prop, and because of the naming, we know what behavior we will get.

For example, if we set a message with `useState()`:

```tsx
const [message, setMessage] = useState('');

return (
  <>
    {message}
    <RouterSelect
      setValueAction={(value) => {
        setMessage(`You selected ${value}`);
      }}
```

We know that this state update will occur once the push to the router has completed.

Further, if we now want optimistic updates, we can call `useOptimistic()`:

```tsx
const [message, setMessage] = useState('');
const [optimisticMessage, setOptimisticMessage] = useOptimistic(message);

return (
  <>
    {message}
    <RouterSelect
      setValueAction={(value) => {
        setOptimisticMessage(`You selected ${value}`);
        setMessage(`You selected ${value}`);
      }}
```

We know that this state update will occur immediately.

## Final Behavior

The final select implementation could look like this:

```tsx
'use client';
...

export interface RouterSelectProps {
  name: string;
  label?: string;
  value?: string | string[];
  options: Array<{ value: string; label: string }>;
  setValueAction?: (value: string) => void;
}

export const RouterSelect = React.forwardRef<HTMLSelectElement, RouterSelectProps>(
  function Select(
    { name, label, value, options, setValueAction, ...props },
    ref
  ) {
    const router = useRouter();
    const [isNavPending, startNavTransition] = React.useTransition();
    const [optimisticValue, setOptimisticValue] = React.useOptimistic(value);

    const handleChange = async (
      event: React.ChangeEvent<HTMLSelectElement>
    ) => {
      const newValue = event.target.value;
      startNavTransition(async () => {
        setOptimisticValue(newValue);
        setValueAction?.(newValue);
        const url = new URL(window.location.href);
        url.searchParams.set(name, newValue);

        await new Promise((resolve) => setTimeout(resolve, 500));
        router.push(url.href, { scroll: false });
      });
    };

    return (
      <div>
        {label && <label htmlFor={name}>{label}</label>}
        <select
          ref={ref}
          id={name}
          name={name}
          value={optimisticValue}
          onChange={handleChange}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isNavPending && 'Pending nav...'}
      </div>
    );
  }
);
```

And here is a demo of this final behavior:

![Router select example](@assets/routerselect.gif)

Check out this [StackBlitz](https://stackblitz.com/edit/bspkkmgm-cqbbodao?file=app%2Fpage.tsx,app%2Factions-reusable-router-select%2Frouter-select.tsx) for a working example.

## Building Complex, Reusable Components

When we are building more complex reusable components, we might run into constraints forcing us to move logic like optimistic updates to the parent.

In my case, I was playing around with this [Ariakit example](https://ariakit.org/examples/select-next-router), where the generation of the select display value has to be done outside the reusable component. That means that we cannot call `useOptimistic` inside the reusable component itself. To solve it, I can expose a `setValueAction` prop, and then use `useOptimistic()` in the parent component to update the state immediately.

Which our approach, we can maintain reusability and still allow for any custom Action logic in the parent component.

## Key Takeaways

- Actions are functions called inside transitions that can update state and perform side effects.
- `useTransition()` provides a pending state to track the progress of the transition.
- `useOptimistic()` allows for immediate state updates inside transitions.
- Exposing an action property to a reusable component allows for custom logic in the parent component.
- Using `useOptimistic()` in the parent component allows for immediate state updates while still maintaining reusability.
- The naming of actions is important to convey the expected behavior to the user of the component.

## Conclusion

In this post, we explored building reusable components with React 19 Actions, tracking transition states, using optimistic updates, and exposing action properties for custom logic.

Big thanks to [Haz](https://x.com/diegohaz) of [Ariakit](https://ariakit.org/) for the inspiration and the example of the select component. I learned a lot from his work.

I hope this post has been helpful in understanding the React 19 Actions and their uses. Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀