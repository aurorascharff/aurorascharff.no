import type { CollectionEntry } from "astro:content";

export default (post: CollectionEntry<"blog">) => {
  return (
    <div
      style={{
        background: "rgb(23, 23, 26)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          border: "4px solid rgb(235, 155, 185)",
          background: "rgb(23, 23, 26)",
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
              color: "rgb(250, 250, 252)",
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
            <span style={{ color: "rgb(160, 160, 165)" }}>
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
                  color: "rgb(235, 155, 185)",
                }}
              >
                {post.data.author}
              </span>
            </span>

            <span style={{ color: "rgb(160, 160, 165)" }}>
              {post.data.pubDatetime.toLocaleDateString("en-GB", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
