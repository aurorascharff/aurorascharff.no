export default function BuyMeACoffee() {
  return (
    <a
      href="https://www.buymeacoffee.com/aurorascharff"
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 text-skin-accent decoration-dashed underline-offset-4 hover:underline"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="!fill-transparent"
      >
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <line x1="6" x2="6" y1="2" y2="4" />
        <line x1="10" x2="10" y1="2" y2="4" />
        <line x1="14" x2="14" y1="2" y2="4" />
      </svg>
      <span>Buy me a coffee</span>
    </a>
  );
}
