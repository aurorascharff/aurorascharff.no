import type { CollectionEntry } from "astro:content";

export default (post: CollectionEntry<"blog">) => {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgb(250, 252, 252) 0%, rgb(241, 186, 212) 100%)",
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
          border: "4px solid rgb(227, 169, 198)",
          background: "rgba(234, 206, 219, 0.3)",
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
          border: "4px solid rgb(227, 169, 198)",
          background: "rgba(250, 252, 252, 0.95)",
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
              color: "rgb(34, 46, 54)",
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
                  color: "rgb(211, 0, 106)",
                }}
              >
                {post.data.author}
              </span>
            </span>

            <span style={{ color: "#6b7280" }}>
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
