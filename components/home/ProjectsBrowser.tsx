"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DesignSystem } from "@/lib/designSystems";
import { relativeTime } from "@/lib/relativeTime";
import Popover, { MenuItem } from "@/components/ui/Popover";
import { DesignSystemCard, DesignSystemFonts } from "@/components/ui/Pickers";
import { IconDots, IconGrid, IconList, IconPencil, IconSearch, IconStar } from "@/components/ui/Icons";

export type ProjectRow = { id: string; title: string; template: string; status: string; updated_at: string; thumb: string | null };

const STAR_KEY = "ds:starred";

function Thumb({ src, title }: { src: string | null; title: string }) {
  return (
    <span className="thumb">
      {src ? <iframe src={src} title={title} loading="lazy" tabIndex={-1} aria-hidden="true" sandbox="" /> : <span className="thumb-empty" />}
    </span>
  );
}

export default function ProjectsBrowser({
  projects: initial,
  systems,
  onUseSystem,
}: {
  projects: ProjectRow[];
  systems: DesignSystem[];
  onUseSystem: (id: string) => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [tab, setTab] = useState<"projects" | "systems">("projects");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [starredOnly, setStarredOnly] = useState(false);
  const [starred, setStarred] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      setStarred(new Set(JSON.parse(localStorage.getItem(STAR_KEY) ?? "[]")));
      const v = localStorage.getItem("ds:view");
      if (v === "grid" || v === "list") setView(v);
    } catch {}
  }, []);

  function toggleStar(id: string) {
    setStarred((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(STAR_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }
  function chooseView(v: "list" | "grid") {
    setView(v);
    try {
      localStorage.setItem("ds:view", v);
    } catch {}
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete “${title}”? Its files and history are removed for good.`)) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) setProjects((p) => p.filter((x) => x.id !== id));
  }

  const query = q.trim().toLowerCase();
  const shownProjects = useMemo(
    () => projects.filter((p) => (!query || p.title.toLowerCase().includes(query)) && (!starredOnly || starred.has(p.id))),
    [projects, query, starredOnly, starred]
  );
  const shownSystems = systems.filter((s) => !query || s.name.toLowerCase().includes(query));

  const menu = (p: ProjectRow) => (
    <Popover
      align="right"
      panelClassName="menu"
      trigger={(_o, toggle) => (
        <button type="button" className="icon-btn" aria-label="More" onClick={toggle}>
          <IconDots size={16} />
        </button>
      )}
      render={(close) => (
        <>
          <MenuItem onClick={() => router.push(`/project/${p.id}`)}>Open</MenuItem>
          <MenuItem
            onClick={() => {
              close();
              window.open(`/p/${p.id}`, "_blank");
            }}
          >
            Open view-only page
          </MenuItem>
          <div className="pop-sep" />
          <MenuItem
            danger
            onClick={() => {
              close();
              remove(p.id, p.title);
            }}
          >
            Delete
          </MenuItem>
        </>
      )}
    />
  );

  return (
    <section className="browser">
      <div className="browser-bar">
        <div className="tabs">
          <button type="button" className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>
            Projects
          </button>
          <button type="button" className={tab === "systems" ? "active" : ""} onClick={() => setTab("systems")}>
            Design systems
          </button>
        </div>
        <div className="browser-tools">
          <label className="search-input">
            <IconSearch size={15} />
            <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {tab === "projects" && (
            <>
              <button type="button" className={`icon-btn${starredOnly ? " on" : ""}`} title="Starred only" onClick={() => setStarredOnly((v) => !v)}>
                <IconStar size={16} filled={starredOnly} />
              </button>
              <div className="seg">
                <button type="button" className={view === "list" ? "on" : ""} onClick={() => chooseView("list")} aria-label="List view">
                  <IconList size={15} />
                </button>
                <button type="button" className={view === "grid" ? "on" : ""} onClick={() => chooseView("grid")} aria-label="Grid view">
                  <IconGrid size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {tab === "systems" ? (
        <>
          <DesignSystemFonts systems={systems} />
          <div className="systems-grid">
            {shownSystems.map((s) => (
              <DesignSystemCard
                key={s.id}
                ds={s}
                onClick={() => {
                  onUseSystem(s.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            ))}
            <Link href="/design-systems?new=1" className="ds-card ds-card-new">
              <span>+ New design system</span>
            </Link>
          </div>
        </>
      ) : !shownProjects.length ? (
        <p className="browser-empty">{projects.length ? "No projects match." : "Your projects will show up here."}</p>
      ) : view === "list" ? (
        <div className="ptable">
          <div className="ptable-head">
            <span>Name</span>
            <span>Last viewed</span>
            <span>Owner</span>
            <span>Access</span>
            <span />
          </div>
          {shownProjects.map((p) => (
            <div key={p.id} className="ptable-row" onClick={() => router.push(`/project/${p.id}`)}>
              <span className="ptable-name">
                <Thumb src={p.thumb} title={p.title} />
                <Link href={`/project/${p.id}`} onClick={(e) => e.stopPropagation()}>
                  {p.title}
                </Link>
              </span>
              <span className="muted" suppressHydrationWarning>{relativeTime(p.updated_at)}</span>
              <span className="owner">
                <span className="avatar sm">Y</span> You
              </span>
              <span className="muted" title="Anyone with the link can edit">
                <IconPencil size={14} />
              </span>
              <span className="ptable-actions" onClick={(e) => e.stopPropagation()}>
                {menu(p)}
                <button type="button" className={`icon-btn${starred.has(p.id) ? " starred" : ""}`} onClick={() => toggleStar(p.id)} aria-label="Star">
                  <IconStar size={16} filled={starred.has(p.id)} />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="pgrid">
          {shownProjects.map((p) => (
            <div key={p.id} className="pcard" onClick={() => router.push(`/project/${p.id}`)}>
              <Thumb src={p.thumb} title={p.title} />
              <div className="pcard-meta" onClick={(e) => e.stopPropagation()}>
                <Link href={`/project/${p.id}`} className="pcard-title">
                  {p.title}
                </Link>
                <span className="muted" suppressHydrationWarning>{relativeTime(p.updated_at)}</span>
                <span className="pcard-actions">
                  <button type="button" className={`icon-btn${starred.has(p.id) ? " starred" : ""}`} onClick={() => toggleStar(p.id)} aria-label="Star">
                    <IconStar size={15} filled={starred.has(p.id)} />
                  </button>
                  {menu(p)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
