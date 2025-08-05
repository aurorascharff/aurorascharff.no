// og-templates/site.tsx
import { SITE } from "@config";

export default () => {
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              height: "90%",
              maxHeight: "90%",
              overflow: "hidden",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: 72,
                fontWeight: "bold",
                background: "linear-gradient(45deg, #ec4899, #8b5cf6)",
                backgroundClip: "text",
                color: "transparent",
                margin: 0,
                marginBottom: "20px",
              }}
            >
              {SITE.title}
            </p>
            <p
              style={{
                fontSize: 28,
                color: "#6b7280",
                margin: 0,
              }}
            >
              {SITE.desc}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              width: "100%",
              marginBottom: "8px",
              fontSize: 28,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                fontWeight: "bold",
                color: "#ec4899",
              }}
            >
              {new URL(SITE.website).hostname}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
