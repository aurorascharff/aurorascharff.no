import type { CollectionEntry } from "astro:content";

export default (post: CollectionEntry<"blog">) => {
  return (
    <div
      style={{
        background: "rgb(25, 22, 28)",
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
          background: "rgb(25, 22, 28)",
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
              color: "rgb(252, 248, 250)",
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
            <span style={{ color: "rgb(180, 170, 175)" }}>
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

            <span style={{ color: "rgb(180, 170, 175)" }}>
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
