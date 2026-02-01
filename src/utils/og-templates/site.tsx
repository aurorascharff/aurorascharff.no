// og-templates/site.tsx
import { SITE } from "@config";

export default () => {
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
                color: "rgb(235, 155, 185)",
                margin: 0,
                marginBottom: "20px",
              }}
            >
              {SITE.title}
            </p>
            <p
              style={{
                fontSize: 28,
                color: "rgb(180, 170, 175)",
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
                color: "rgb(235, 155, 185)",
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
