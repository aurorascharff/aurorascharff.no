import type { Site, SocialObjects } from "./types";

export const SITE: Site = {
  website: "https://aurorascharff.no/",
  author: "Aurora Scharff",
  desc: "Working on developer experience, docs, and education on the Next.js team at Vercel. Practical guides on React, Next.js, and modern web development.",
  title: "Aurora Scharff",
  ogImage: "dev-girl.png",
  lightAndDarkMode: true,
  postPerPage: 3,
};

export const LOCALE = {
  lang: "en", // html lang code. Set this empty and default will be "en"
  langTag: ["en-GB"], // BCP 47 Language Tags. Set this empty [] to use the environment default
} as const;

export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};

export const SOCIALS: SocialObjects = [
  {
    name: "Github",
    href: "https://github.com/aurorascharff",
    linkTitle: `${SITE.title} on GitHub`,
    active: true,
  },
  {
    name: "Bluesky",
    href: "https://bsky.app/profile/aurorascharff.no",
    linkTitle: `${SITE.title} on Bluesky`,
    active: true,
  },
  {
    name: "X",
    href: "https://x.com/aurorascharff",
    linkTitle: `${SITE.title} on X`,
    active: true,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/aurora-scharff-a86b88188/",
    linkTitle: `${SITE.title} on LinkedIn`,
    active: true,
  },
];
