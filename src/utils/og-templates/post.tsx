// og-templates/post.tsx
import { type CollectionEntry } from "astro:content";

export default function postOgImage(post: CollectionEntry<"blog">, theme: any) {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: theme.background,
        fontFamily: "IBM Plex Mono",
        position: "relative",
        border: `8px solid ${theme.primary}`,
        boxSizing: "border-box",
      }}
    >
      {/* Decorative elements */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          width: "100px",
          height: "100px",
          borderRadius: "50%",
          background: theme.primary,
          opacity: 0.1,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "40px",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          background: theme.secondary,
          opacity: 0.2,
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
          textAlign: "center",
          maxWidth: "900px",
        }}
      >
        <h1
          style={{
            fontSize: "48px",
            fontWeight: 600,
            color: theme.text,
            marginBottom: "40px",
            lineHeight: 1.2,
          }}
        >
          {post.data.title}
        </h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "30px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              fontSize: "24px",
              color: theme.text,
              fontWeight: 600,
            }}
          >
            By {post.data.author}
          </div>

          <div
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: theme.textLight,
            }}
          />

          <div
            style={{
              fontSize: "20px",
              color: theme.textLight,
            }}
          >
            {post.data.pubDatetime.toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
