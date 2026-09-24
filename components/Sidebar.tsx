import Link from "next/link";

type RecentItem = { id: string; title: string };

/**
 * The left rail on Home and Design systems. A plain server component — no
 * client state, just links — so it never blocks on JS to be usable.
 */
export default function Sidebar({
  active,
  email,
  recent = [],
}: {
  active: "home" | "ds";
  email: string;
  recent?: RecentItem[];
}) {
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <span className="brand-mark">D</span>
        <span className="brand-name">Demonic Search</span>
      </Link>
      <nav className="sidebar-nav">
        <Link href="/" className={`nav-item${active === "home" ? " active" : ""}`}>
          New project
        </Link>
        <Link href="/design-systems" className={`nav-item${active === "ds" ? " active" : ""}`}>
          Design systems
        </Link>
      </nav>
      {!!recent.length && (
        <div className="sidebar-list-wrap">
          <span className="sidebar-label">Recent</span>
          <div className="sidebar-list">
            {recent.map((p) => (
              <Link key={p.id} href={`/project/${p.id}`} className="sidebar-list-item" title={p.title}>
                {p.title}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="sidebar-user">
        <span className="avatar">{email[0]?.toUpperCase() ?? "?"}</span>
        <span className="sidebar-email">{email}</span>
      </div>
    </aside>
  );
}
