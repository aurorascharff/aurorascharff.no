export default function CertVisual() {
  return (
    <div className="fixed bottom-0 right-0 z-40 m-8 flex items-center justify-end bg-right-top bg-no-repeat sm:mb-14 sm:mr-16 ">
      <div className="hero group relative z-10 rounded-lg">
        {/* Always visible badge - acts as the trigger on mobile */}
        <div className="absolute -top-10 left-14 z-50 h-auto w-16 translate-x-[400px] translate-y-[280px] sm:w-20">
          <img
            src="/assets/cert2.svg"
            alt="Certificate badge"
            className="transition-all duration-150 ease-linear group-hover:-rotate-3 group-hover:scale-110"
          />
        </div>
        <a
          href="https://certificates.dev/react"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <img
            src="/assets/cert1.svg"
            alt="Certificate background"
            className="w-112 relative z-0 mx-auto h-auto transition-all duration-150 ease-linear group-hover:-rotate-2 3xl:w-full"
          />
          <img
            src="/assets/cert3.svg"
            alt="Certificate decorative element"
            className="absolute -right-5 top-4 h-auto w-40 opacity-0 transition-all duration-150 ease-linear group-hover:rotate-6 group-hover:scale-105 group-hover:opacity-100 sm:-right-10 sm:w-64"
          />
        </a>
      </div>
    </div>
  );
}
