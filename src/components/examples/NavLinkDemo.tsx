import { useState, type ReactNode } from "react";
import DemoContainer from "./DemoContainer";

type RenderProps = { isActive: boolean };
type Renderable<T> = T | ((props: RenderProps) => T);

function resolve<T>(value: Renderable<T> | undefined, props: RenderProps) {
  return typeof value === "function"
    ? (value as (p: RenderProps) => T)(props)
    : value;
}

function NavLink({
  href,
  pathname,
  exact,
  className,
  children,
  onSelect,
}: {
  href: string;
  pathname: string;
  exact?: boolean;
  className?: Renderable<string | undefined>;
  children?: Renderable<ReactNode>;
  onSelect: (href: string) => void;
}) {
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  const props = { isActive };
  const resolved = resolve(className, props);
  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={["nav-item", resolved].filter(Boolean).join(" ")}
      onClick={e => {
        e.preventDefault();
        onSelect(href);
      }}
    >
      {resolve(children, props)}
    </a>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return <span aria-hidden>{filled ? "★" : "☆"}</span>;
}

export default function NavLinkDemo() {
  const [pathname, setPathname] = useState("/");
  return (
    <DemoContainer>
      <style>{`
        .demo-isolate .nav-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .demo-isolate .nav-item {
          all: unset;
          cursor: pointer;
          padding: 0.4rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.95rem;
          color: rgba(var(--color-text-base), 0.7);
          transition: background-color 0.15s, color 0.15s;
        }
        .demo-isolate .nav-item:hover {
          background: rgba(var(--color-card-muted));
          color: rgba(var(--color-text-base));
        }
        .demo-isolate .nav-item.active,
        .demo-isolate .nav-item[aria-current="page"] {
          background: rgba(var(--color-accent), 0.12);
          color: rgba(var(--color-accent));
          font-weight: 600;
        }
        .demo-isolate .nav-status {
          margin-top: 0.85rem;
          font-size: 0.8rem;
          color: rgba(var(--color-text-base), 0.6);
        }
        .demo-isolate .nav-status code {
          all: unset;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.8rem;
          padding: 0.1rem 0.35rem;
          border-radius: 0.25rem;
          background: rgba(var(--color-card-muted));
          color: rgba(var(--color-text-base));
        }
      `}</style>
      <nav className="nav-row">
        <NavLink
          href="/"
          pathname={pathname}
          exact
          onSelect={setPathname}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          Home
        </NavLink>
        <NavLink
          href="/posts"
          pathname={pathname}
          onSelect={setPathname}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          Posts
        </NavLink>
        <NavLink href="/settings" pathname={pathname} onSelect={setPathname}>
          {({ isActive }) => (
            <>
              <StarIcon filled={isActive} /> Settings
            </>
          )}
        </NavLink>
      </nav>
      <p className="nav-status">
        Current path: <code>{pathname}</code>
      </p>
    </DemoContainer>
  );
}
