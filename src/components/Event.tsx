import Datetime from "./Datetime";
import type { CollectionEntry } from "astro:content";

export interface Props {
  frontmatter: CollectionEntry<"speaking">["data"];
}

export default function Event({ frontmatter }: Props) {
  const { name, link, websiteLink, date, description, organizer } = frontmatter;

  return (
    <li className="my-6 flex flex-col gap-[1px]">
      <h3 className="text-lg font-medium">{organizer}</h3>
      {websiteLink && (
        <a href={websiteLink} className="text-lg font-medium hover:underline">
          {websiteLink}
        </a>
      )}
      {link ? (
        <a
          target="_blank"
          href={link}
          className="inline-block text-lg font-medium text-skin-accent decoration-dashed underline-offset-4 hover:underline focus-visible:no-underline focus-visible:underline-offset-0"
        >
          <h2>{name}</h2>
        </a>
      ) : (
        <h2 className="inline-block text-lg font-medium text-skin-accent">
          {name}
        </h2>
      )}
      <Datetime hideTime={true} datetime={date} />
      {/* <p>{description}</p> */}
    </li>
  );
}
