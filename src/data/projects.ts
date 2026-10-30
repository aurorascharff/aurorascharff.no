export type ProjectLink = {
  label: string;
  href: string;
};

export type Project = {
  id: string;
  name: string;
  summary: string;
  description: string;
  image: string;
  imageAlt: string;
  demo: string;
  source: string;
  related: ProjectLink[];
};

export const projects: Project[] = [
  {
    id: "nextbeats",
    name: "NextBeats",
    summary:
      "A music player demo for instant navigations with Cache Components and Partial Prefetching.",
    description:
      "A music player built on Next.js 16 to show instant navigations. Queries are cached with 'use cache', long track lists prefetch on hover instead of all at once, and Server Functions like favoriting a track invalidate only the tags they change.",
    image: "/assets/projects/nextbeats.jpg",
    imageAlt:
      "NextBeats music player with album artwork, track lists, and a persistent player",
    demo: "https://next-beats.dev",
    source: "https://github.com/nextjs/next-beats",
    related: [
      {
        label: "Coordinating Optimistic Updates in Next.js",
        href: "/posts/coordinating-optimistic-updates-in-nextjs/",
      },
    ],
  },
  {
    id: "stamp",
    name: "Stamp",
    summary:
      "A Gmail-style mail client where thread headers prefetch and message bodies wait for the visit.",
    description:
      "A Gmail-style inbox built to work through the navigation() API. Each thread's header arrives with its row's prefetch, while the message bodies wait for the actual navigation, so prefetching an inbox stays cheap and later visits still hit the cache.",
    image: "/assets/projects/stamp.jpg",
    imageAlt:
      "Stamp mail client with mailbox navigation and an inbox of demo messages",
    demo: "https://next16-mail.vercel.app",
    source: "https://github.com/aurorascharff/next16-mail",
    related: [
      {
        label: "Component Architecture for React Server Components",
        href: "/posts/component-architecture-for-react-server-components/",
      },
    ],
  },
  {
    id: "commerce",
    name: "Next.js Commerce",
    summary:
      "A storefront mixing cached product data with a personalized cart, from my Next.js Conf 2025 talk.",
    description:
      "The demo from my Next.js Conf 2025 talk, kept up to date with the latest Next.js. Shared product data is cached, the cart and saved products use 'use cache: private', and ensureStatic guarantees static output at the stage each route needs it.",
    image: "/assets/projects/commerce.jpg",
    imageAlt: "Next.js Commerce demo displaying a grid of products",
    demo: "https://next16-commerce.vercel.app",
    source: "https://github.com/aurorascharff/next16-commerce",
    related: [
      {
        label: "Composition, Caching, and Architecture in Modern Next.js",
        href: "https://www.youtube.com/watch?v=iRGc8KQDyQ8",
      },
      {
        label: "The Precompute Pattern",
        href: "/posts/the-precompute-pattern-encoding-dynamic-data-into-urls-in-nextjs/",
      },
    ],
  },
];
