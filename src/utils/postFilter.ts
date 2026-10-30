import type { CollectionEntry } from "astro:content";

/** Drafts are visible in local development and excluded from production builds. Scheduled `pubDatetime` is not enforced: static output is fixed at build time, so “future” posts would never appear without a rebuild anyway. */
const postFilter = ({ data }: CollectionEntry<"blog">) =>
  import.meta.env.DEV || !data.draft;

export default postFilter;
