import { useState } from "react";

export default function CertVisual() {
  const [open, setOpen] = useState(false);

  const openContent = (
    <>
      <img
        src="/assets/cert1.svg"
        alt="Certificate background"
        draggable={false}
        className={`w-112 relative z-0 mx-auto h-auto transition-all duration-150 ease-linear group-hover:-rotate-2 3xl:w-full ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      />
      <img
        src="/assets/cert3.svg"
        alt="Certificate decorative element"
        draggable={false}
        className={`absolute -right-5 top-4 h-auto w-40 transition-all duration-150 ease-linear group-hover:rotate-6 group-hover:scale-105 sm:-right-10 sm:w-64 ${open ? "visible opacity-100" : "invisible opacity-0"}`}
      />
    </>
  );

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-40 m-8 hidden items-center justify-end bg-right-top bg-no-repeat sm:mb-14 sm:mr-16 2xl:flex">
      <div className="hero relative z-10 rounded-lg">
        <button
          onClick={() => setOpen(!open)}
          className="pointer-events-auto absolute -top-10 left-14 z-50 h-auto w-16 translate-x-[400px] translate-y-[280px] sm:w-20"
        >
          <img
            src="/assets/cert2.svg"
            alt="Certificate badge"
            draggable={false}
            className="transition-all duration-150 ease-linear hover:-rotate-3 hover:scale-110"
          />
        </button>
        {open ? (
          <a
            href="https://certificates.dev/react"
            target="_blank"
            className="group pointer-events-auto"
            rel="noopener noreferrer"
          >
            {openContent}
          </a>
        ) : (
          <div className="group">{openContent}</div>
        )}
      </div>
    </div>
  );
}
