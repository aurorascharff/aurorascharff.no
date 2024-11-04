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
        <a
          href={websiteLink}
          target="_blank"
          className="text-lg font-medium hover:underline"
        >
          {websiteLink.replace(/(https?:\/\/)?(www\.)?/, "")}
        </a>
      )}
      {link ? (
        <div className="flex flex-row items-center gap-2">
          <a
            target="_blank"
            href={link}
            className="inline-block text-lg font-medium text-skin-accent decoration-dashed underline-offset-4 hover:underline focus-visible:no-underline focus-visible:underline-offset-0"
          >
            <h2 className="inline">{name}</h2>
            {link.includes("youtube") && (
              <span className="ml-2 inline-block pt-[2px]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="800"
                  width="1200"
                  viewBox="-35.20005 -41.33325 305.0671 247.9995"
                >
                  <path
                    d="M229.763 25.817c-2.699-10.162-10.65-18.165-20.748-20.881C190.716 0 117.333 0 117.333 0S43.951 0 25.651 4.936C15.553 7.652 7.6 15.655 4.903 25.817 0 44.236 0 82.667 0 82.667s0 38.429 4.903 56.85C7.6 149.68 15.553 157.681 25.65 160.4c18.3 4.934 91.682 4.934 91.682 4.934s73.383 0 91.682-4.934c10.098-2.718 18.049-10.72 20.748-20.882 4.904-18.421 4.904-56.85 4.904-56.85s0-38.431-4.904-56.85"
                    fill="red"
                  />
                  <path
                    d="M93.333 117.559l61.333-34.89-61.333-34.894z"
                    fill="#fff"
                  />
                </svg>
              </span>
            )}
            {link.includes("spotify") && (
              <span className="ml-2 inline-block pt-[2px]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="800"
                  width="800"
                  viewBox="-33.4974 -55.829 290.3108 334.974"
                >
                  <path
                    d="M177.707 98.987c-35.992-21.375-95.36-23.34-129.719-12.912-5.519 1.674-11.353-1.44-13.024-6.958-1.672-5.521 1.439-11.352 6.96-13.029 39.443-11.972 105.008-9.66 146.443 14.936 4.964 2.947 6.59 9.356 3.649 14.31-2.944 4.963-9.359 6.6-14.31 3.653m-1.178 31.658c-2.525 4.098-7.883 5.383-11.975 2.867-30.005-18.444-75.762-23.788-111.262-13.012-4.603 1.39-9.466-1.204-10.864-5.8a8.717 8.717 0 015.805-10.856c40.553-12.307 90.968-6.347 125.432 14.833 4.092 2.52 5.38 7.88 2.864 11.968m-13.663 30.404a6.954 6.954 0 01-9.569 2.316c-26.22-16.025-59.223-19.644-98.09-10.766a6.955 6.955 0 01-8.331-5.232 6.95 6.95 0 015.233-8.334c42.533-9.722 79.017-5.538 108.448 12.446a6.96 6.96 0 012.31 9.57M111.656 0C49.992 0 0 49.99 0 111.656c0 61.672 49.992 111.66 111.657 111.66 61.668 0 111.659-49.988 111.659-111.66C223.316 49.991 173.326 0 111.657 0"
                    fill="#1ed660"
                  />
                </svg>
              </span>
            )}
          </a>
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
