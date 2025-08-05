// og-templates/site.tsx
export default function siteOgImage(theme: any) {
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
      {/* Decorative background elements */}
      <div
        style={{
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          bottom: "0",
          background: `radial-gradient(circle at 20% 80%, ${theme.primary}20 0%, transparent 50%), 
                       radial-gradient(circle at 80% 20%, ${theme.secondary}20 0%, transparent 50%)`,
          display: "flex",
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <h1
          style={{
            fontSize: "72px",
            fontWeight: 600,
            background: `linear-gradient(45deg, ${theme.primary}, ${theme.secondary})`,
            backgroundClip: "text",
            color: "transparent",
            marginBottom: "20px",
          }}
        >
          Your Site Name
        </h1>

        <p
          style={{
            fontSize: "32px",
            color: theme.textLight,
            marginBottom: "40px",
          }}
        >
          Next.js & React Development
        </p>

        <div
          style={{
            display: "flex",
            gap: "20px",
          }}
        >
          <div
            style={{
              padding: "12px 24px",
              background: theme.primary,
              color: "white",
              borderRadius: "25px",
              fontSize: "20px",
              fontWeight: 600,
            }}
          >
            ☕ Buy me a coffee
          </div>
        </div>
      </div>
    </div>
  );
}
