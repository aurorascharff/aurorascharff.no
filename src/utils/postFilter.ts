import type { CollectionEntry } from "astro:content";

/** Non-draft posts only. Scheduled `pubDatetime` is not enforced: static output is fixed at build time, so “future” posts would never appear without a rebuild anyway. */
const postFilter = ({ data }: CollectionEntry<"blog">) => !data.draft;

export default postFilter;
