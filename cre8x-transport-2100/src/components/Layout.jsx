import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Compass,
  Map,
  Route,
  Radio,
  Leaf,
  Sun,
  Globe2,
} from "lucide-react";
const links = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/journey", label: "My journey", icon: Route },
  { to: "/tracking", label: "Live map", icon: Map },
];
function Navigation({ mobile = false, search }) {
  return (
    <nav
      className={mobile ? "bottom-nav" : "side-nav"}
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
    >
      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to === "/" ? to : `${to}${search}`}
          end={to === "/"}
        >
          <Icon size={20} strokeWidth={1.7} />
          <span>{label}</span>
          {!mobile && <ArrowUpRight className="nav-arrow" size={15} />}
        </NavLink>
      ))}
    </nav>
  );
}
export default function Layout() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${pathname === "/tracking" ? "Live tracking" : pathname === "/journey" ? "Your journey" : "Discover"} · LANKA / 2100`;
  }, [pathname]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="Lanka 2100 home">
          <span className="brand-mark">
            <Route size={24} />
          </span>
          <span>
            LANKA<span className="brand-year"> / 2100</span>
            <small>THE WAY FORWARD.</small>
          </span>
        </NavLink>
        <div className="sidebar-caption">YOUR CONNECTED WORLD</div>
        <Navigation search={search} />
        <div className="sidebar-bottom">
          <div className="future-note">
            <Leaf size={21} />
            <p>
              A better way to move.
              <br />
              <strong>A lighter footprint.</strong>
            </p>
            <div className="future-line" />
            <small>100% electric ecosystem</small>
          </div>
          <div className="system-online">
            <Radio size={15} />
            <span>Network connected</span>
            <span className="status-dot" />
          </div>
          <p className="sidebar-foot">
            CRE8X 3.0 <span>THE ORACLE CHALLENGE</span>
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Explore <span>/</span>{" "}
            <strong>
              {pathname === "/journey"
                ? "Your journey"
                : pathname === "/tracking"
                  ? "Live tracking"
                  : "Discover Sri Lanka"}
            </strong>
          </div>
          <div className="topbar-meta">
            <span>
              <Sun size={16} /> 28°{" "}
              <span className="weather-location">Colombo</span>
            </span>
            <span className="topbar-divider" />
            <span>
              <Globe2 size={15} /> EN
            </span>
            <div className="avatar" aria-label="Demo traveler profile">
              KA
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>One island. Infinite possibilities.</span>
          <span>SRI LANKA, REIMAGINED · 2100</span>
        </footer>
      </div>
      <Navigation mobile search={search} />
    </div>
  );
}
