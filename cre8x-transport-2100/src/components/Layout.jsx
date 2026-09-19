import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Compass,
  Globe2,
  Map,
  Radio,
  Route,
  Sun,
} from "lucide-react";

const links = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/journey", label: "My Journey", icon: Route },
  { to: "/tracking", label: "Live Map", icon: Map },
];

function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="Lanka 2100 home">
      <span className="brand-mark">
        <Route size={24} />
      </span>
      <span>
        LANKA<span className="brand-year"> / 2100</span>
        <small>THE WAY FORWARD.</small>
      </span>
    </NavLink>
  );
}

function Navigation({ mobile = false, search }) {
  return (
    <nav
      className={mobile ? "bottom-nav" : "desktop-nav"}
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

function Header({ search, pathname }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <Navigation search={search} />
        <div className="header-meta">
          <span className="weather-meta">
            <Sun size={16} /> 28° <span>Colombo</span>
          </span>
          <span className="header-divider" />
          <span className="language-meta">
            <Globe2 size={15} /> EN
          </span>
          <div className="avatar" aria-label="Demo traveler profile">
            KA
          </div>
        </div>
      </div>
      <div className="mobile-page-title">
        {pathname === "/journey"
          ? "Your journey"
          : pathname === "/tracking"
            ? "Live tracking"
            : "Discover Sri Lanka"}
      </div>
    </header>
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

      <div className="main-shell">
        <Header search={search} pathname={pathname} />

        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>

        <footer className="page-footer">
          <span>One island. Infinite possibilities.</span>
          <span>SRI LANKA, REIMAGINED · 2100</span>
          <span className="footer-network">
            <Radio size={13} /> Network connected{" "}
            <span className="status-dot" />
          </span>
        </footer>
      </div>

      <Navigation mobile search={search} />
    </div>
  );
}
