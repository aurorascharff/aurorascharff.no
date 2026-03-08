import type { ReactNode } from "react";

interface Props {
  label?: string;
  children: ReactNode;
}

export default function DemoContainer({
  label = "Interactive Demo",
  children,
}: Props) {
  return (
    <>
      <style>{`
        .demo-isolate {
          all: revert;
          display: block;
          box-sizing: border-box;
          margin: 1.5rem 0;
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid rgba(var(--color-border));
          background: rgba(var(--color-card));
          color: rgba(var(--color-text-base));
          font-family: system-ui, sans-serif;
          font-size: 1rem;
          line-height: 1.5;
        }
        .demo-isolate * {
          all: revert;
        }
        .demo-isolate .demo-label {
          all: unset;
          display: block;
          margin-bottom: 0.75rem;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(var(--color-text-base), 0.5);
        }
        .demo-isolate .active {
          font-weight: bold;
        }
        .demo-isolate .pending {
          opacity: 0.5;
        }
        .demo-isolate .demo-spinner {
          all: unset;
          display: inline-block;
          width: 0.85em;
          height: 0.85em;
          border: 2px solid rgba(var(--color-border));
          border-top-color: rgba(var(--color-accent));
          border-radius: 50%;
          animation: demo-spin 0.6s linear infinite;
          vertical-align: middle;
          margin-left: 0.4em;
        }
        @keyframes demo-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="not-prose demo-isolate">
        <span className="demo-label">{label}</span>
        {children}
      </div>
    </>
  );
}
