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
        <div className="flex flex-row items-start gap-2">
          <a
            target="_blank"
            href={link}
            className="inline-block text-lg font-medium text-skin-accent decoration-dashed underline-offset-4 hover:underline focus-visible:no-underline focus-visible:underline-offset-0"
          >
            <h2>{name}</h2>
          </a>
          {link.includes("youtube") && (
            <img
              className="pt-[6px]"
              height="30"
              width="30"
              src="/src/assets/youtube.svg"
            />
          )}
          {link.includes("spotify") && (
            <img height="30" width="30" src="/src/assets/spotify.svg" />
          )}
        </div>
      ) : (
        <h2 className="inline-block text-lg font-medium text-skin-accent">
          {name}
        </h2>
      )}
      <Datetime hideTime={true} pubDatetime={date} modDatetime={null} />
      {/* <p>{description}</p> */}
    </li>
  );
}
