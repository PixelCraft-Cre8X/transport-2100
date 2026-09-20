import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
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

function Navigation({
  mobile = false,
  search,
  onOpenAI,
  requestingMicrophone,
}) {
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
        </NavLink>
      ))}
      <button
        className="ai-nav-button"
        type="button"
        onClick={onOpenAI}
        aria-busy={requestingMicrophone}
        aria-haspopup="dialog"
      >
        <Sparkles size={18} strokeWidth={1.7} />
        <span>{mobile ? "AI" : "Journey AI"}</span>
      </button>
    </nav>
  );
}

function Header({ search, pathname, onOpenAI, requestingMicrophone }) {
  return (
    <header
      className={`site-header glass-nav${pathname === "/" ? " home-header" : ""}`}
    >
      <div className="header-inner">
        <Brand />
        <Navigation
          search={search}
          onOpenAI={onOpenAI}
          requestingMicrophone={requestingMicrophone}
        />
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
  const [microphonePermission, setMicrophonePermission] = useState("unknown");
  const permissionRequestRef = useRef(null);
  const openingRef = useRef(0);
  const returnFocusRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      openingRef.current += 1;
    };
  }, []);

  const requestMicrophone = useCallback(() => {
    if (microphonePermission === "granted") return Promise.resolve("granted");
    if (permissionRequestRef.current) return permissionRequestRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophonePermission("unavailable");
      return Promise.resolve("unavailable");
    }
    setMicrophonePermission("requesting-permission");
    // Call synchronously in the AI/microphone click, before any await or effect.
    let request;
    try {
      request = navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicrophonePermission("unavailable");
      return Promise.resolve("unavailable");
    }
    const pending = Promise.resolve(request)
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        if (mountedRef.current) setMicrophonePermission("granted");
        return "granted";
      })
      .catch(() => {
        if (mountedRef.current) setMicrophonePermission("unavailable");
        return "unavailable";
      })
      .finally(() => {
        permissionRequestRef.current = null;
      });
    permissionRequestRef.current = pending;
    return pending;
  }, [microphonePermission]);

  const openJourneyAI = useCallback(
    (event) => {
      if (permissionRequestRef.current || journeyAIOpen) return;
      returnFocusRef.current = event?.currentTarget ?? document.activeElement;
      const opening = ++openingRef.current;
      requestMicrophone().then(() => {
        if (mountedRef.current && opening === openingRef.current)
          setJourneyAIOpen(true);
      });
    },
    [journeyAIOpen, requestMicrophone],
  );
  const closeJourneyAI = useCallback(() => {
    openingRef.current += 1;
    setJourneyAIOpen(false);
  }, []);
  const microphoneUnavailable = useCallback(
    () => setMicrophonePermission("unavailable"),
    [],
  );
  const requestingMicrophone = microphonePermission === "requesting-permission";

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${pathname === "/tracking" ? "Live tracking" : pathname === "/journey" ? "Your journey" : "Discover"} · moveone`;
  }, [pathname]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <div
        className={`main-shell${
          pathname === "/journey" || pathname === "/tracking"
            ? " route-shell"
            : ""
        }`}
      >
        <Header
          search={search}
          pathname={pathname}
          onOpenAI={openJourneyAI}
          requestingMicrophone={requestingMicrophone}
        />

        <main id="main-content" tabIndex={-1}>
          <Outlet context={{ onOpenAI: openJourneyAI }} />
        </main>

        <footer className="page-footer">
          <span>moveone · SRI LANKA, REIMAGINED · 2100</span>
          <span className="footer-network">
            <Radio size={13} /> Network connected{" "}
            <span className="status-dot" />
          </span>
        </footer>
      </div>

      <Navigation
        mobile
        search={search}
        onOpenAI={openJourneyAI}
        requestingMicrophone={requestingMicrophone}
      />
      <span className="journey-ai-sr-only" role="status">
        {requestingMicrophone ? "Requesting microphone permission…" : ""}
      </span>
      <JourneyAIPreview
        open={journeyAIOpen}
        onClose={closeJourneyAI}
        permission={microphonePermission}
        onRequestMicrophone={requestMicrophone}
        onMicrophoneUnavailable={microphoneUnavailable}
        returnFocusRef={returnFocusRef}
      />
    </div>
  );
}
