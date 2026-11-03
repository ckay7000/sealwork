import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Fingerprint,
  LayoutDashboard,
  Menu,
  Search,
  FileText,
  X,
  Command,
  Plus,
  ChevronRight,
} from "lucide-react";
import { Brand, Pill } from "./components";
import { SOURCE_URL, useData } from "./data";

export function AppLayout() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const { config, builds, jobs, error } = useData();
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
    setSearch(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    function keys(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearch((value) => !value);
      }
      if (event.key === "Escape") {
        setSearch(false);
        setMenu(false);
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  const nav = [
    { to: "/workspace", label: "Overview", icon: LayoutDashboard },
    { to: "/agents", label: "Agents & builds", icon: Fingerprint },
    { to: "/receipts", label: "Work receipts", icon: FileText },
  ];
  const section =
    location.pathname.startsWith("/agents") ||
    location.pathname.startsWith("/builds")
      ? "Agents & builds"
      : location.pathname.startsWith("/jobs") ||
          location.pathname === "/receipts"
        ? "Work receipts"
        : location.pathname === "/protocol"
          ? "How it works"
          : location.pathname === "/new"
            ? "New private job"
            : "Overview";
  const match = query.toLowerCase();
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Brand />
        <Link to="/new" className="sidebar-new">
          <Plus size={16} />
          New private job<span>↗</span>
        </Link>
        <div className="nav-group-label">WORKSPACE</div>
        <nav aria-label="Workspace">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={18} />
              {item.label}
              {item.to === "/receipts" && jobs.length > 0 && (
                <span className="nav-count">{jobs.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nav-group-label resources">RESOURCES</div>
        <NavLink
          to="/protocol"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <BookOpen size={18} />
          How it works
        </NavLink>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="nav-item"
        >
          <ArrowUpRight size={18} />
          View source
        </a>
        <div className="sidebar-bottom">
          <div className="network-indicator">
            <span className={config?.builds.length ? "online" : ""} />
            <div>
              <strong>NEAR testnet</strong>
              <small>
                {config?.builds.length
                  ? "Live protocol"
                  : "Connecting to protocol"}
              </small>
            </div>
            <ArrowUpRight size={14} />
          </div>
          <Link to="/protocol" className="sidebar-help">
            Private work. Inspectable outcomes.
            <ChevronRight size={14} />
          </Link>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-header">
          <div className="header-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="workspace-label">Demo workspace</span>
            <ChevronRight size={13} />
            <span>{section}</span>
          </div>
          <div className="header-right">
            <button className="search-trigger" onClick={() => setSearch(true)}>
              <Search size={16} />
              <span>Search workspace</span>
              <kbd>
                <Command size={10} /> K
              </kbd>
            </button>
            <span className="header-divider" />
            <Pill tone="green" dot>
              Sponsored testnet
            </Pill>
            <div className="workspace-avatar" title="Sponsored demo workspace">
              SW
            </div>
          </div>
        </header>
        {error && (
          <div className="connection-banner" role="status">
            {error}
          </div>
        )}
        <main id="main" className="app-main">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            <i />
            Built on NEAR. Verified with OutLayer.
          </span>
          <Link to="/protocol">
            Understand the trust model <ArrowUpRight size={12} />
          </Link>
        </footer>
      </div>
      {search && (
        <div className="dialog-backdrop" onClick={() => setSearch(false)}>
          <div
            className="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="search-dialog-input">
              <Search size={20} />
              <input
                autoFocus
                aria-label="Search agents and public job names"
                placeholder="Search agents, builds, or public job names…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                className="icon-button"
                aria-label="Close search"
                onClick={() => setSearch(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="search-results">
              <p className="eyebrow">AGENTS & BUILDS</p>
              {builds
                .filter((build) =>
                  `${build.name} ${build.version} ${build.hash}`
                    .toLowerCase()
                    .includes(match),
                )
                .map((build) => (
                  <Link key={build.hash} to={`/builds/${build.hash}`} onClick={() => setSearch(false)}>
                    <Fingerprint size={17} />
                    {build.name}
                    <span>v{build.version}</span>
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              <p className="eyebrow">PUBLIC RECEIPTS</p>
              {jobs
                .filter((job) =>
                  `${job.title} ${job.id}`.toLowerCase().includes(match),
                )
                .slice(0, 6)
                .map((job) => (
                  <Link key={job.id} to={`/jobs/${job.id}`}>
                    <FileText size={17} />
                    {job.title}
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              {!jobs.length && (
                <p className="muted search-empty">
                  No public receipts loaded yet.
                </p>
              )}
            </div>
            <div className="search-note">
              <LockLabel />
              Private file contents are never searched.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function LockLabel() {
  return <span aria-hidden="true">◇</span>;
}
