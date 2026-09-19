import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Compass,
  Globe2,
  Map,
  Radio,
  Route,
  Sparkles,
  Sun,
} from "lucide-react";
import logoImage from "../assets/logo.png";
import JourneyAIPreview from "./JourneyAIPreview";

const links = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/journey", label: "My Journey", icon: Route },
  { to: "/tracking", label: "Live Map", icon: Map },
];

function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="moveone home">
      <img className="brand-logo" src={logoImage} alt="" />
      <span className="brand-name">
        moveone
        <small>THE WAY FORWARD.</small>
      </span>
    </NavLink>
  );
}

function Navigation({ mobile = false, search, onOpenAI }) {
  return (
    <nav
      className={mobile ? "bottom-nav glass-nav" : "desktop-nav"}
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
      <button className="ai-nav-button" type="button" onClick={onOpenAI}>
        <Sparkles size={18} strokeWidth={1.7} />
        <span>{mobile ? "AI" : "Journey AI"}</span>
        {!mobile && <ArrowUpRight className="nav-arrow" size={15} />}
      </button>
    </nav>
  );
}

function Header({ search, pathname, onOpenAI }) {
  return (
    <header className="site-header glass-nav">
      <div className="header-inner">
        <Brand />
        <Navigation search={search} onOpenAI={onOpenAI} />
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
  const [journeyAIOpen, setJourneyAIOpen] = useState(false);
  const openJourneyAI = useCallback(() => setJourneyAIOpen(true), []);
  const closeJourneyAI = useCallback(() => setJourneyAIOpen(false), []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${pathname === "/tracking" ? "Live tracking" : pathname === "/journey" ? "Your journey" : "Discover"} · moveone`;
  }, [pathname]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <div className="main-shell">
        <Header
          search={search}
          pathname={pathname}
          onOpenAI={openJourneyAI}
        />

        <main id="main-content" tabIndex={-1}>
          <Outlet context={{ onOpenAI: openJourneyAI }} />
        </main>

        <footer className="page-footer">
          <span>One island. Infinite possibilities.</span>
          <span>moveone · SRI LANKA, REIMAGINED · 2100</span>
          <span className="footer-network">
            <Radio size={13} /> Network connected{" "}
            <span className="status-dot" />
          </span>
        </footer>
      </div>

      <Navigation mobile search={search} onOpenAI={openJourneyAI} />
      <JourneyAIPreview open={journeyAIOpen} onClose={closeJourneyAI} />
    </div>
  );
}
