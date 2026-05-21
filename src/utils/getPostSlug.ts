import type { CollectionEntry } from "astro:content";

export default function getPostSlug(post: CollectionEntry<"blog">) {
  const slug = post.data.slug?.trim();

  return slug ? slug : post.id;
}
