import {
  TrainFront,
  BusFront,
  Plane,
  Route,
  Footprints,
  Sparkles,
  Zap,
  Armchair,
  Leaf,
  ArrowUpRight,
} from "lucide-react";
const icons = {
  rail: TrainFront,
  bus: BusFront,
  air: Plane,
  road: Route,
  walk: Footprints,
  sparkles: Sparkles,
  zap: Zap,
  route: Route,
  armchair: Armchair,
  leaf: Leaf,
};
export function ModeIcon({ mode, ...props }) {
  const Icon = icons[mode] || Route;
  return <Icon size={20} strokeWidth={1.7} aria-hidden="true" {...props} />;
}
export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function SectionHeader({ eyebrow, title, children }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
const transportCardDescriptions = {
  rail: "Elevated autonomous rail",
  bus: "Autonomous local transport",
  air: "Fast autonomous air travel",
};

export function TransportModeCard({ mode }) {
  return (
    <article
      className={`transport-card glass-card ${mode.color}`}
    >
      <div className="transport-art">
        <ModeIcon mode={mode.id} size={64} />
        <span className="orbit" />
        <ArrowUpRight className="transport-arrow" size={18} />
      </div>
      <div className="transport-copy">
        <span className="tiny-label">AUTONOMOUS SYSTEM</span>
        <h3>{mode.short}</h3>
        <p>{transportCardDescriptions[mode.id]}</p>
      </div>
    </article>
  );
}
export function SmartRoadPanel() {
  return (
    <div className="smart-road">
      <span className="icon-tile green">
        <ModeIcon mode="road" />
      </span>
      <div>
        <strong>Smart Road intelligence</strong>
        <p>
          Traffic low <span>·</span> Route clear <span>·</span> Safety 98%
        </p>
      </div>
      <span className="status-dot" />
    </div>
  );
}
