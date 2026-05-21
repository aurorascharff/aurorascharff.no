import type { CollectionEntry } from "astro:content";

export default function getPostSlug(post: CollectionEntry<"blog">) {
  return post.data.slug ?? post.id;
}
