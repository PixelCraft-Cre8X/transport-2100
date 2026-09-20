import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function GlassSelect({
  ariaLabel,
  className = "",
  options,
  value,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => {
    function closeOnOutside(event) {
      if (!selectRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, []);

  function selectOption(nextValue) {
    onChange(nextValue);
    setOpen(false);
  }

  function handleKeyDown(event) {
    const currentIndex = options.findIndex((option) => option.value === value);
    if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      selectOption(options[Math.min(currentIndex + 1, options.length - 1)].value);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      selectOption(options[Math.max(currentIndex - 1, 0)].value);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  }

  const selectedOption = options.find((option) => option.value === value);

  return (
    <span
      ref={selectRef}
      className={`glass-select ${open ? "open" : ""} ${className}`}
    >
      <button
        className="glass-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption?.label || value}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <span className="glass-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              className={`glass-select-option ${
                option.value === value ? "selected" : ""
              }`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => selectOption(option.value)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
