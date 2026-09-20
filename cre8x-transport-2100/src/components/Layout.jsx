import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Compass,
  Download,
  Globe2,
  Map,
  Radio,
  Route,
  Sparkles,
  Sun,
} from "lucide-react";
import logoImage from "../assets/logo.png";
import profileImage from "../assets/profile-image.png";
import IntroScreen from "./IntroScreen";
import JourneyAIPreview from "./JourneyAIPreview";
import PageTransition from "./PageTransition";
import { requestMicrophoneAccess } from "../utils/microphone";
import { primeSpeechSynthesis, voiceDebug } from "../utils/speechSynthesis";

const links = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/journey", label: "My Journey", icon: Route },
  { to: "/tracking", label: "Live Map", icon: Map },
];

function Brand() {
  return (
    <NavLink
      to="/"
      reloadDocument
      className="brand"
      aria-label="MoveOne home"
    >
      <img className="brand-logo" src={logoImage} alt="" />
      <span className="brand-name">
        MoveOne
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
        <span>Journey AI</span>
      </button>
    </nav>
  );
}

function Header({
  search,
  pathname,
  onOpenAI,
  requestingMicrophone,
  canInstall,
  onInstall,
}) {
  return (
    <header
      className={`site-header glass-nav${
        pathname === "/"
          ? " home-header"
          : pathname === "/journey" || pathname === "/tracking"
            ? " route-header"
            : ""
      }`}
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
          {canInstall && (
            <button
              className="install-app-button"
              type="button"
              onClick={onInstall}
              aria-label="Install MoveOne app"
            >
              <Download size={15} />
              <span>Install app</span>
            </button>
          )}
          <div className="avatar" aria-label="Demo traveler profile">
            <img src={profileImage} alt="" />
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
  const [showIntro, setShowIntro] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [journeyAIOpen, setJourneyAIOpen] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState("unknown");
  const microphonePermissionRef = useRef("unknown");
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

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => setInstallPrompt(null);

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }, [installPrompt]);

  const requestMicrophone = useCallback(() => {
    if (permissionRequestRef.current) return permissionRequestRef.current;
    if (microphonePermissionRef.current === "granted")
      return Promise.resolve("granted");
    setMicrophonePermission("requesting-permission");
    // Reuse this session's grant; capture/permission failures invalidate it below.
    const pending = requestMicrophoneAccess()
      .then((permission) => {
        voiceDebug("microphone permission resolved", permission);
        microphonePermissionRef.current = permission;
        if (mountedRef.current) setMicrophonePermission(permission);
        return permission;
      })
      .finally(() => {
        permissionRequestRef.current = null;
      });
    permissionRequestRef.current = pending;
    return pending;
  }, []);

  const openJourneyAI = useCallback(
    (event) => {
      if (permissionRequestRef.current || journeyAIOpen) return;
      voiceDebug("Journey AI click", {
        userActivation: navigator.userActivation?.isActive,
      });
      primeSpeechSynthesis();
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
  const microphoneUnavailable = useCallback((reason) => {
    microphonePermissionRef.current = reason;
    setMicrophonePermission(reason);
  }, []);
  const requestingMicrophone = microphonePermission === "requesting-permission";

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.title = "MoveOne";
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    // PageTransition swaps the route content after its short exit animation.
    // Reset once more after that swap so the new page cannot inherit the old
    // page's scroll anchor position.
    const settle = window.setTimeout(() => window.scrollTo(0, 0), 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [pathname]);

  useEffect(() => {
    if (!showIntro) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, prefersReducedMotion ? 700 : 2450);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [showIntro]);

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
          canInstall={Boolean(installPrompt)}
          onInstall={installApp}
        />

        <main id="main-content" tabIndex={-1}>
          <PageTransition context={{ onOpenAI: openJourneyAI }} />
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
      {showIntro && <IntroScreen />}
    </div>
  );
}
