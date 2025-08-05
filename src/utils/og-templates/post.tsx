// og-templates/post.tsx
import { SITE } from "@config";
import type { CollectionEntry } from "astro:content";

export default (post: CollectionEntry<"blog">) => {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fce7f3 0%, #f3e8ff 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-1px",
          right: "-1px",
          border: "4px solid #ec4899",
          background: "rgba(236, 72, 153, 0.1)",
          opacity: "0.9",
          borderRadius: "4px",
          display: "flex",
          justifyContent: "center",
          margin: "2.5rem",
          width: "88%",
          height: "80%",
        }}
      />

      <div
        style={{
          border: "4px solid #ec4899",
          background: "rgba(255, 255, 255, 0.9)",
          borderRadius: "4px",
          display: "flex",
          justifyContent: "center",
          margin: "2rem",
          width: "88%",
          height: "80%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            margin: "20px",
            width: "90%",
            height: "90%",
          }}
        >
          <p
            style={{
              fontSize: 60,
              fontWeight: "bold",
              maxHeight: "84%",
              overflow: "hidden",
              color: "#1f2937",
              margin: 0,
            }}
          >
            {post.data.title}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
              marginBottom: "8px",
              fontSize: 28,
            }}
          >
            <span style={{ color: "#6b7280" }}>
              by{" "}
              <span
                style={{
                  color: "transparent",
                }}
              >
                "
              </span>
              <span
                style={{
                  overflow: "hidden",
                  fontWeight: "bold",
                  color: "#ec4899",
                }}
              >
                {post.data.author}
              </span>
            </span>

            <span style={{ color: "#6b7280" }}>
              {post.data.pubDatetime.toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
