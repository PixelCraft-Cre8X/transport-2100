import "./Switch.css";

export default function Switch({
  checked,
  onChange,
  labelledBy,
  small = false,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      className={`switch ${small ? "small" : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}
