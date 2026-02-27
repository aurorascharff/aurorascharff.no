import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import getSortedEvents from "@utils/getSortedEvents";
import { SITE } from "@config";

export async function GET() {
  const events = await getCollection("speaking");
  const sortedEvents = getSortedEvents(events).filter(
    event => event.data.completed
  );
  return rss({
    title: `${SITE.title} - Speaking`,
    description: "Speaking appearances by Aurora Scharff",
    site: SITE.website,
    items: sortedEvents.map(({ data }) => ({
      link: data.link ?? data.websiteLink ?? "speaking/",
      title: `${data.name} @ ${data.organizer}`,
      description: [data.description, data.address].filter(Boolean).join(" | "),
      pubDate: new Date(data.date),
    })),
  });
}
