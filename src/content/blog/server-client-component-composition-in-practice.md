---
author: Aurora Scharff
pubDatetime: 2025-08-05T10:22:00Z
title: Server and Client Component Composition in Practice
slug: server-client-component-composition-in-practice
featured: true
draft: false
tags:
  - React Server Components
  - Next.js
  - App Router
  - React 19
  - performance
  - composition
  - Suspense
description: In this blog post, I will show you how to compose client and server components effectively in React. We will explore patterns for keeping responsibilities clear, optimizing performance, and creating reusable components.
---

React Server Components offer significant benefits by keeping data fetching on the server and reducing client-side JavaScript. However, many developers accidentally lose these benefits by converting server components into client components just to add simple interactions like dismiss buttons or animations.

In this blog post, I will show you how to compose client and server components effectively. We will explore patterns for keeping responsibilities clear, optimizing performance, and creating reusable components. We will also look at how to use Suspense strategically with server components to create smooth and performant user experiences.

## Table of contents

## What are React Server Components?

Let's start with a quick recap of what React Server Components are.

[React Server Components (RSCs)](https://react.dev/reference/rsc/server-components) render on the server and send only the rendered output to the client. Unlike traditional SSR, they never execute in the browser.

```jsx
// This runs on the server only
async function ServerComponent() {
  const data = await fetch('https://api.example.com/data');
  return <div>{data.title}</div>;
}
```

Server components have the following benefits:

- **Zero Bundle Impact**: Server Components don't add to your JavaScript bundle
- **Direct Backend Access**: Access databases and server resources without API endpoints  
- **Better Performance**: Data fetching and rendering happen on the server

Okay, let's get into the meat of this post.

## The Essential Pattern

Let's say we have simple server component that fetches some data.

```jsx
async function ServerComponent() {
  const data = await getData();
  return <div>{data}</div>;
}
```

It's clear what this component does and what it's responsible for.

Let's now say we want to add a way to dismiss this element from the UI with state. A simple task. One way to do this is to add "use client" to the component, and then use state to manage the visibility. We can then pass down the data as a prop:

```jsx
'use client';

function ServerComponentTurnedClient({ data }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div>
      {data}
      <button onClick={() => setVisible(false)}>Dismiss</button>
    </div>
  );
}
```

Or, use an API like `useSuspenseQuery` for data fetching on the client:

```jsx
'use client';

function ServerComponentTurnedClient() {
  const { data } = useSuspenseQuery({
    queryKey: ['data'],
    queryFn: getData,
  });
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div>
      {data}
      <button onClick={() => setVisible(false)}>Dismiss</button>
    </div>
  );
}
```

Or utilize other APIs like [`use`](https://react.dev/reference/react/use), or reach for [other ways to solve data fetching i Next.js](https://www.trevorlasn.com/blog/fetching-data-for-complex-next-and-react-apps). This is not the focus of this post, so I won't go into detail on those.

Do you notice the problem? Our `ServerComponentTurnedClient` component is now a client component, and handles more responsibilities than just data fetching. It also handles state management and UI rendering.

Here is the essential pattern we need to follow to avoid this problem. Instead of turning the `ServerComponent` into a client component, we can pass it down as a child to a client component wrapper that handles the state and UI rendering.

```jsx
'use client';

function ClientWrapper({ children }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div>
      {children}
      <button onClick={() => setVisible(false)}>Dismiss</button>
    </div>
  );
}
```

Then we can use it like this:

```jsx
function Page() {
  return (
    <ClientWrapper>
      <ServerComponent />
    </ClientWrapper>
  );
}
```

This way, the `ServerComponent` remains a server component, responsible only for data fetching, while the client component handles the state and UI rendering. This keeps the responsibilities clear and keep the compositional benefits of server components whole also minimizing the amount of client-side JavaScript we need to send to the browser. Both these components are now freely composable and can be used in different contexts.

## Example 1: A Motion Wrapper

Let's start with a simple example. We can utilize this pattern for [Motion](https://motion.dev/) animations, where we want to animate the children of a component without affecting the server component's data fetching. Instead of turning the server component into a client component just for an animation, we can wrap it in a client component that handles the animations:

```tsx
// MotionWrappers.tsx
'use client';

import { motion, HTMLMotionProps } from 'framer-motion'

export function MotionDiv(props: HTMLMotionProps<'div'>) {
  return <motion.div {...props}>{props.children}</motion.div>
}
```

Then we can use it in our server component:

```jsx
import { MotionDiv } from './MotionWrappers';

async function ServerComponent() {
  const data = await getData();
  return (
    <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {data}
    </MotionDiv>
  );
}
```

## Example 2: A "Show More" Component

Let's say we have simple component that renders a list of product categories.

```jsx
async function CategoryList() {
  const categories = await getCategories();
  return (
    <ul>
      {categories.map((category) => (
        <li key={category.id}>{category.name}</li>
      ))}
    </ul>
  );
}
```

Turns out we are getting a lot of categories, and we only want to show a few at first, and then let the user toggle more.

Instead of converting the `CategoryList` to a client component, we can create a use a reusable `ShowMore` client component to handle the "Show More" logic, while the `CategoryList` remains a server component. This keeps data fetching on the server and UI state on the client.

We have to get a little creative here, because we want to toggle a specific number of items. Lets use the [`React.Children`](https://react.dev/reference/react/Children) API to handle this.

For a refresher on this API, check out my blog post [React Children and cloneElement: Component Patterns from the Docs](https://certificates.dev/blog/react-children-and-cloneelement-component-patterns-from-the-docs) at certificates.dev. On this platform you can also start your path to [becoming a Certified React Developer](https://certificates.dev/react) with the React Certification, for which I am the lead. It is a great way to deepen your knowledge of React and get certified at the same time!

We can create a `ShowMore` component that takes children and an initial number of items to show, and handles the "Show More" logic:

```jsx
// components/ui/ShowMore.jsx
'use client';

export default function ShowMore({ children, initial = 5 }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? children : Children.toArray(children).slice(0, initial);
  const remaining = Children.count(children) - initial;

  return (
    <div>
      <div>{items}</div>
      {remaining > 0 && (
        <div>
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show Less' : `Show More (${remaining})`}
          </button>
        </div>
      )}
    </div>
  );
}
```

Then we can use it like this in our `CategoryList` component:

```jsx
import ShowMore from '../components/ui/ShowMore';

async function CategoryList() {
  const categories = await getCategories();
  return (
    <ShowMore initial={5}>
      {categories.map((category) => (
        <div key={category.id}>{category.name}</div>
      ))}
    </ShowMore>
  );
}
```

This way, server and client responsibilities stay separate and your code stays clean. The `ShowMore` component can be a reusable UI component that you can use in other parts of your application, and the `CategoryList` component remains focused on data fetching. Keep in mind that this is a simplified example, and you might want to handle edge cases like empty categories in a real-world application.

## Example 3: An Automatic Scroller

Let's say we have a chat box server component that fetches messages from the server and renders them:

```jsx
async function Chat() {
  const messages = await getMessages();
  return (
    <div className="chat-container">
      {messages.map((message) => (
        <div key={message.id}>{message.text}</div>
      ))}
    </div>
  );
}
```

Now, what if we want to automatically scroll to the bottom of the chat when new messages are added? We can do this converting the chat component to a client component, and use i.e, a custom hook `useAutoScroll` that returns a `ref`, but that means our component is now responsible for both data fetching and UI rendering again. We would have to modify our data fetching and it would redundantly hydrate the messages on the client side.

We can instead create a reusable `AutoScroller` component that handles this logic:

```jsx
// components/ui/AutoScroller.jsx
'use client';

export default function AutoScroller({ children, className }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mutationObserver = new MutationObserver(() => {
      if (ref.current) {
        ref.current.scroll({ behavior: 'smooth', top: ref.current.scrollHeight });
      }
    });

    if (ref.current) {
      mutationObserver.observe(ref.current, {
        childList: true,
        subtree: true,
      });
    }
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
```

Then we can use it in our chat component:

```jsx
import AutoScroller from '../components/ui/AutoScroller';

async function Chat() {
  const messages = await getMessages();
  return (
    <AutoScroller className="chat-container">
      {messages.map((message) => (
        <div key={message.id}>{message.text}</div>
      ))}
    </AutoScroller>
  );
}
```

## Example 4: A Product Carousel

Let's say we have a component that fetches some data from the server and renders `ProductCard` components:

```jsx
// product/ProductCards.jsx
async function ProductCards() {
  const cardData = await getCardData();
  return (
    <div className="carousel">
      {cardData.map((card) => (
        <ProductCard key={card.id} title={card.title} image={card.image} />
      ))}
    </div>
  );
}

function ProductCard({ title, image }) {
  // ... 
}
```

Let's add a carousel effect to this using our composition patterns. We can create a reusable `ProductCarousel` component that handles the logic and UI rendering:

```jsx
// product/ProductCarousel.jsx
'use client';

function ProductCarousel({ children }) {
  const items = Children.toArray(children);
  const [i, setI] = useState(0);

  return (
    <div>
      <button onClick={() => setI(i === 0 ? items.length - 1 : i - 1)}>Prev</button>
      <div>{items[i]}</div>
      <button onClick={() => setI(i === items.length - 1 ? 0 : i + 1)}>Next</button>
    </div>
  );
}

export default ProductCarousel;
```

Again we utilized the `Children` API to handle the items in the carousel. Again, this is a simplified example to illustrate the pattern.

We can use it in the `ProductCards` component. It remains a server component that fetches the data, rendering server `ProductCard` children:

```jsx
// product/ProductCards.jsx
import ProductCarousel from './ProductCarousel';

async function ProductCards() {
  const cardData = await getCardData();

  return (
    <ProductCarousel>
      {cardData.map((card) => (
        <ProductCard key={card.id} title={card.title} image={card.image} />
      ))}
    </ProductCarousel>
  );
}
```

This keeps the data fetching on the server and the carousel logic/UI on the client, maintaining clear separation of concerns.

Those are some examples of how to compose client and server components effectively. By keeping data fetching on the server and UI state on the client, we can create reusable components that are easy to maintain and optimize for performance. Keep this in mind the next time you encounter the need for a client-side interaction. See if you can solve the problem with composition instead of turning the server component into a client component.

Let's move on to some server component composition patterns.

## Example 5: A Personalized Banner

Let's say we have a personalized banner component that informs the user of discount information.

```jsx
// Banner.jsx
async function PersonalizedBanner() {
  const user = await getCurrentUser();
  const discount = await getDiscountData(user.id);
  return <div className="banner">Welcome back, {user.name}! You currently have {discount}% off your next purchase.</div>;
}
```

Naturally, when executing an asynchronous call in a server component, we would wrap the component in Suspense and provide a fallback UI. It could look like this:

```jsx
export default function Page() {
  return (
    <Suspense fallback={<BannerSkeleton />}>
      <PersonalizedBanner />
    </Suspense>
  );
}
```

This is important to unblock the rendering of the page while the data is being fetched. This fallback would work, as long as it uses the same dimensions as the final content. Otherwise, we might get CLS (Cumulative Layout Shift). However, the fallback doesn't provide any meaningful information to the user. Maybe there's a better alternative.

Let's create a generic `GeneralBanner` component that can be used for different purposes, and then compose it with the personalized data.

```jsx
// Banner.jsx
function GeneralBanner() {
  return (
    <div className="banner">
      Sign up today for our newsletter and get 10% off your next purchase!
      <Link href="/signup">
        Sign up
      </Link>
    </div>
  );
}
```

Let's return this generic banner in the `PersonalizedBanner` component if the user is not logged in:

```jsx
// Banner.jsx
async function PersonalizedBanner() {
  const user = await getCurrentUser();
  if (!user) {
    return <GeneralBanner />;
  }

  const discount = await getDiscountData(user.id);
  return <div className="banner">Welcome back, {user.name}! You currently have {discount}% off your next purchase.</div>;
}
```

We can now compose these components together in our page:

```jsx
export default function Page() {
  return (
    <Suspense fallback={<GeneralBanner />}>
      <PersonalizedBanner />
    </Suspense>
  );
}
```

While the asynchronous call is running, the `GeneralBanner` will be shown, and once the data is fetched, the personalized banner will be rendered. Unless the user is not logged in, in which case the `GeneralBanner` will be shown instead.

Let's wrap this with a banner container with our pattern from before. It will handle the styling and dismiss functionality, while the `PersonalizedBanner` and `GeneralBanner` handle the content.

```jsx
// BannerContainer.jsx
'use client';

function BannerContainer({ children }: BannerContainerProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="banner">
      {children}
      <button onClick={() => setVisible(false)}>Dismiss</button>
    </div>
  );
}
```

Let's export the `DiscountBanner` component as the default export, which will use the `BannerContainer` to wrap the `PersonalizedBanner`:

```jsx
// Banner.jsx
export default function DiscountBanner() {
  return (
    <BannerContainer>
      <Suspense fallback={<GeneralBanner />}>
        <PersonalizedBanner />
      </Suspense>
    </BannerContainer>
  );
}
```

Then we can use the `DiscountBanner` component in our page:

```jsx
// page.jsx
import DiscountBanner from './DiscountBanner';

export default function Page() {
  return (
    <div className="page">
      <DiscountBanner />
      {/* Other content */}
    </div>
  );
}
```

Beautiful!

Let's look at final example of how to compose server components with Suspense.

## Example 6: A Product Page

Let's now say we have reusable `Product` component that fetches product data from the server and renders it:

```jsx
async function Product({ productId }) {
  const product = await getProductData(productId);
  return (
    <div className="product">
      <h2>{product.name}</h2>
      <p>{product.description}</p>
      <p>Price: ${product.price}</p>
    </div>
  );
}
```

In a modal view, this component is sufficient. However, if we want to use it in a single product page, we might want to add some additional information, such as details about the product, or actions like saving the product to a wishlist.

We can create a `ProductDetails` component that fetches additional data about the product and renders it:

```jsx
async function ProductDetails({ productId }) {
  const productDetails = await getProductDetails(productId);
  return (
    <div className="product-details">
      <h3>Details</h3>
      <p>{productDetails.details}</p>   
      <form action={saveToWishlist.bind(null, productId)}>
        <button type="submit">Save to Wishlist</button>
      </form>
    </div>
  );
}
```

The additional product info should be rendered inside the `Product` component's styling and layout. We can do this by exposing the `details` prop from the `Product` component, which can then be used to render additional information:

```jsx
async function Product({ productId, details }) {
  const product = await getProduct(productId);
  return (
    <div className="product">
      <h2>{product.name}</h2>
      <p>{product.description}</p>
      <p>Price: ${product.price}</p>
      {details}
    </div>
  );
}
```

We can now use the standard `Product` component in a modal view:

```jsx
// app/(.)product/[productId]/page.jsx
export default function ProductModal({ params }) {
  return (
    <div className="product-modal">
      <Product productId={params.productId} />
    </div>
  );
}
```

Or compose both components together in our product page:

```jsx
// app/product/[productId]/page.jsx
export default function ProductPage({ params }) {
  return (
    <div className="product-page">
      <Product productId={params.productId} details={
        <ProductDetails productId={params.productId} />
      }>
      </Product>
    </div>
  );
}
```

And wrap with Suspense to unblock the rendering of the page while the data is being fetched:

```jsx
// app/product/[productId]/page.jsx
export default function ProductPage({ params }) {
  return (
    <div className="product-page">
      <Suspense fallback={<ProductSkeleton />}>
        <Product productId={params.productId} details={
          <Suspense fallback={<ProductDetailsSkeleton />}>
            <ProductDetails productId={params.id} />
          </Suspense>
        }>
        </Product>
      </Suspense>
    </div>
  );
}
```

Combine it with the [preload pattern](https://aurorascharff.no/posts/avoiding-server-component-waterfall-fetching-with-react-19-cache/) to preload the product data, and you have a fully functional product page that leverages server component composition effectively and is optimized for performance.

There we have it! Let's summarize the key takeaways from this post.

## Key Takeaways

- Use composition to avoid converting server components to client components—keep data fetching on the server and UI state on the client when possible
- Pass server components as `children` to client wrappers for maximum reusability and clear separation of concerns
- Use Suspense with meaningful fallbacks to improve user experience during data loading
- Build reusable UI patterns that work across different contexts and maintain clean component boundaries

## Conclusion

In this post, we explored how to compose client and server components effectively. We looked at several examples of how to keep responsibilities clear, optimize performance, and create reusable components. By following the essential pattern of separating data fetching from UI rendering, we can create components that are easy to maintain and optimize for performance.

For further reading on this topic, I recommend checking out the [Twofold Framework blog post on composable streaming with Suspense](https://twofoldframework.com/blog/composable-streaming-with-suspense) by [Ryan Toronto](https://x.com/ryantotweets). It provides a deeper dive into how to compose server components with Suspense with more advanced examples.

I hope this post has been helpful in understanding server component composition better. Please let me know if you have any questions or comments, and follow me on [X](https://x.com/aurorascharff) for more updates. Happy coding! 🚀
