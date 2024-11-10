import { useEffect, useState } from "react";

export default function BuyMeACoffee() {
  const [theme, setTheme] = useState("");

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    setTheme(currentTheme || "");

    const observer = new MutationObserver(() => {
      const updatedTheme = document.documentElement.getAttribute("data-theme");
      setTheme(updatedTheme || "");
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-12 w-48">
      {theme ? (
        <a href="https://www.buymeacoffee.com/aurorascharff" target="_blank">
          <img
            className="h-12 w-48 rounded-lg"
            src={
              theme === "dark"
                ? "/assets/buymeacoffee-dark.png"
                : "/assets/buymeacoffee-light.png"
            }
            alt="buy me a coffee"
          />
        </a>
      ) : null}
    </div>
  );
}
