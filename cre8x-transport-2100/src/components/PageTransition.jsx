import { useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import "./PageTransition.css";

const EXIT_DURATION = 140;

export default function PageTransition({ context }) {
  const location = useLocation();
  const outlet = useOutlet(context);
  const routeKey = `${location.pathname}${location.search}`;
  const [view, setView] = useState({ key: routeKey, content: outlet });
  const [phase, setPhase] = useState("enter");
  const activeRouteRef = useRef(routeKey);

  useEffect(() => {
    if (routeKey === activeRouteRef.current) return undefined;

    activeRouteRef.current = routeKey;
    setPhase("exit");

    const timer = window.setTimeout(() => {
      setView({ key: routeKey, content: outlet });
      setPhase("enter");
    }, EXIT_DURATION);

    return () => window.clearTimeout(timer);
  }, [outlet, routeKey]);

  return (
    <div
      key={view.key}
      className={`page-transition page-transition-${phase}`}
    >
      {view.content}
    </div>
  );
}
