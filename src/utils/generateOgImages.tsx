import satori, { type SatoriOptions } from "satori";
import { Resvg } from "@resvg/resvg-js";
import { type CollectionEntry } from "astro:content";
import postOgImage from "./og-templates/post";
import siteOgImage from "./og-templates/site";

const fetchFonts = async () => {
  // Regular Font
  const fontFileRegular = await fetch(
    "https://www.1001fonts.com/download/font/ibm-plex-mono.regular.ttf"
  );
  const fontRegular: ArrayBuffer = await fontFileRegular.arrayBuffer();

  // Bold Font
  const fontFileBold = await fetch(
    "https://www.1001fonts.com/download/font/ibm-plex-mono.bold.ttf"
  );
  const fontBold: ArrayBuffer = await fontFileBold.arrayBuffer();

  return { fontRegular, fontBold };
};

const { fontRegular, fontBold } = await fetchFonts();

// Updated theme colors
const theme = {
  background: "linear-gradient(135deg, #fce7f3 0%, #f3e8ff 100%)",
  primary: "#ec4899", // Pink-500
  secondary: "#8b5cf6", // Violet-500
  accent: "#06b6d4", // Cyan-500
  text: "#1f2937", // Gray-800
  textLight: "#6b7280", // Gray-500
};

const options: SatoriOptions = {
  width: 1200,
  height: 630,
  embedFont: true,
  fonts: [
    {
      name: "IBM Plex Mono",
      data: fontRegular,
      weight: 400,
      style: "normal",
    },
    {
      name: "IBM Plex Mono",
      data: fontBold,
      weight: 600,
      style: "normal",
    },
  ],
};

function svgBufferToPngBuffer(svg: string) {
  const resvg = new Resvg(svg);
  const pngData = resvg.render();
  return pngData.asPng();
}

export async function generateOgImageForPost(post: CollectionEntry<"blog">) {
  const svg = await satori(postOgImage(post, theme), options);
  return svgBufferToPngBuffer(svg);
}

export async function generateOgImageForSite() {
  const svg = await satori(siteOgImage(theme), options);
  return svgBufferToPngBuffer(svg);
}
