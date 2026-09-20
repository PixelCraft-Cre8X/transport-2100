import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BusFront,
  Check,
  CreditCard,
  Info,
  Leaf,
  LoaderCircle,
  Lock,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Smartphone,
  X,
} from "lucide-react";
import { formatFare } from "../data/journeys";
import GlassSelect from "./GlassSelect";
import { ModeIcon } from "./UI";
import "./BookingModal.css";

const MAX_PASSENGERS = 6;
const STEPS = ["Passenger", "Payment", "Confirm"];
const DIAL_CODES = [
  { label: "LK +94", value: "+94" },
  { label: "IN +91", value: "+91" },
  { label: "GB +44", value: "+44" },
  { label: "US +1", value: "+1" },
  { label: "AU +61", value: "+61" },
  { label: "SG +65", value: "+65" },
  { label: "AE +971", value: "+971" },
];
const METHODS = [
  { id: "card", label: "Card", icon: CreditCard },
  { id: "apple", label: "Apple Pay", icon: Smartphone },
  { id: "google", label: "Google Pay", icon: Smartphone },
];

const digits = (value) => value.replace(/\D/g, "");
const formatCard = (value) =>
  digits(value)
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
const formatExpiry = (value) => {
  const d = digits(value).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
};

function validate(form) {
  const errors = {};
  if (form.name.trim().length < 2)
    errors.name = "Enter the passenger's full name.";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
    errors.email = "Enter a valid email address.";
  if (digits(form.phone).length < 7 || digits(form.phone).length > 12)
    errors.phone = "Enter a valid phone number.";
  if (form.method === "card") {
    if (form.cardName.trim().length < 2)
      errors.cardName = "Enter the name on the card.";
    if (digits(form.cardNumber).length !== 16)
      errors.cardNumber = "Enter the 16-digit card number.";
    const month = Number(digits(form.expiry).slice(0, 2));
    if (digits(form.expiry).length !== 4 || month < 1 || month > 12)
      errors.expiry = "Use the format MM / YY.";
    if (digits(form.cvv).length < 3)
      errors.cvv = "Enter the 3 or 4 digit code.";
  }
  return errors;
}

const PASSENGER_FIELDS = ["name", "email", "phone"];

export default function BookingModal({ open, ...props }) {
  return open
    ? createPortal(<BookingDialog {...props} />, document.body)
    : null;
}

function BookingDialog({
  onClose,
  from,
  to,
  steps,
  route,
  arrival,
  dateLabel,
  trackHref,
}) {
  const uid = useId();
  const dialogRef = useRef(null);
  const timer = useRef(null);
  const closeRef = useRef(onClose);
  const [stage, setStage] = useState("form"); // form | processing | done
  const [attempted, setAttempted] = useState(false);
  const [reference, setReference] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [form, setForm] = useState({
    name: "",
    email: "",
    dial: "+94",
    phone: "",
    method: "card",
    cardName: "",
    cardNumber: "",
    expiry: "",
    cvv: "",
  });

  const errors = validate(form);
  const passengerOk = PASSENGER_FIELDS.every((field) => !errors[field]);
  const currentStep = stage === "done" ? 3 : passengerOk ? 2 : 1;
  const total = route.cost * passengers;
  const shown = attempted ? errors : {};
  const set = (field) => (event) =>
    setForm((f) => ({ ...f, [field]: event.target.value }));
  const setFormatted = (field, format) => (event) =>
    setForm((f) => ({ ...f, [field]: format(event.target.value) }));

  useEffect(() => {
    closeRef.current = onClose;
  });

  // Lock page scroll, move focus into the dialog and hand it back on close.
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const pending = timer;
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(pending.current);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const trapTab = (event) => {
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (stage !== "form") return;
    setAttempted(true);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() =>
        dialogRef.current?.querySelector('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setStage("processing");
    timer.current = setTimeout(() => {
      setReference(
        `MV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      );
      setStage("done");
    }, 1100);
  };

  const rides = steps.filter((s) => s.mode !== "walk");

  const field = (name, label, control) => (
    <div className="bk-field">
      <label htmlFor={`${uid}-${name}`}>
        {label} <span aria-hidden="true">*</span>
      </label>
      {control}
      {shown[name] && (
        <p className="bk-error" id={`${uid}-${name}-error`}>
          {shown[name]}
        </p>
      )}
    </div>
  );
  const inputProps = (name) => ({
    id: `${uid}-${name}`,
    "aria-invalid": shown[name] ? "true" : undefined,
    "aria-describedby": shown[name] ? `${uid}-${name}-error` : undefined,
    required: true,
  });

  return (
    <div
      className="bk-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="bk-dialog glass-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={trapTab}
      >
        <header className="bk-header">
          <span className="bk-header-icon">
            <BusFront size={30} />
          </span>
          <div className="bk-heading">
            <h2 id={`${uid}-title`}>Book Your Journey</h2>
            <p>Secure your seat and get ready to move forward.</p>
          </div>
          <ol className="bk-steps" aria-label="Booking progress">
            {STEPS.map((label, i) => {
              const number = i + 1;
              const state =
                number < currentStep || (stage === "done" && number === 3)
                  ? "done"
                  : number === currentStep
                    ? "current"
                    : "";
              return (
                <li
                  key={label}
                  className={state}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  <span>{state === "done" ? <Check size={15} /> : number}</span>
                  {label}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="bk-close"
            aria-label="Close booking"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="bk-body">
          <aside className="bk-summary" aria-label="Trip summary">
            <h3>Trip Summary</h3>
            <ol className="bk-timeline">
              <li>
                <span className="bk-node">
                  <LocateFixed size={20} />
                </span>
                <div>
                  <strong>{from.name}</strong>
                  <small>Start · {steps[0].time}</small>
                </div>
              </li>
              {rides.map((ride) => (
                <li key={ride.start}>
                  <span className="bk-node">
                    <ModeIcon mode={ride.mode} size={20} />
                  </span>
                  <div>
                    <strong>{ride.name}</strong>
                    <small>{ride.minutes} min</small>
                  </div>
                </li>
              ))}
              <li>
                <span className="bk-node">
                  <MapPin size={20} />
                </span>
                <div>
                  <strong>{to.name}</strong>
                  <small>Arrive · {arrival}</small>
                </div>
              </li>
            </ol>
            <dl className="bk-totals">
              <div>
                <dt>Total travel time</dt>
                <dd>{route.duration} min</dd>
              </div>
              <div>
                <dt>Total fare</dt>
                <dd>{formatFare(total)}</dd>
              </div>
            </dl>
            <div className="bk-green">
              <Leaf size={38} />
              <div>
                <strong>Greener travel</strong>
                <span>~ {route.emissionsSaved}% lower emissions</span>
                <small>compared to car travel.</small>
              </div>
            </div>
          </aside>

          {stage === "done" ? (
            <section className="bk-confirmation" aria-live="polite">
              <span className="bk-confirmed-icon">
                <Check size={34} />
              </span>
              <h3>Booking confirmed</h3>
              <p>
                Your seat from {from.name} to {to.name} is reserved for{" "}
                {dateLabel} at {steps[0].time}.
              </p>
              <dl>
                <div>
                  <dt>Reference</dt>
                  <dd>{reference}</dd>
                </div>
                <div>
                  <dt>Passenger</dt>
                  <dd>
                    {form.name.trim()}
                    {passengers > 1 ? ` + ${passengers - 1}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Total paid</dt>
                  <dd>{formatFare(total)}</dd>
                </div>
              </dl>
              <p className="bk-note">
                This is a demo booking. No payment was taken and nothing has
                been saved.
              </p>
              <div className="bk-confirm-actions">
                <Link className="bk-pay" to={trackHref}>
                  Start tracking <ArrowRight size={20} />
                </Link>
                <button
                  type="button"
                  className="bk-secondary"
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
            </section>
          ) : (
            <form className="bk-form" onSubmit={submit} noValidate>
              <section className="bk-card" aria-labelledby={`${uid}-passenger`}>
                <div className="bk-card-head">
                  <h3 id={`${uid}-passenger`}>
                    Passenger Details{" "}
                    <small>
                      ({passengers} Passenger{passengers > 1 ? "s" : ""})
                    </small>
                  </h3>
                  <div className="bk-count">
                    <span id={`${uid}-count`}>Number of passengers</span>
                    <div role="group" aria-labelledby={`${uid}-count`}>
                      <button
                        type="button"
                        aria-label="Fewer passengers"
                        disabled={passengers <= 1}
                        onClick={() => setPassengers((n) => n - 1)}
                      >
                        <Minus size={18} />
                      </button>
                      <output aria-live="polite">{passengers}</output>
                      <button
                        type="button"
                        aria-label="More passengers"
                        disabled={passengers >= MAX_PASSENGERS}
                        onClick={() => setPassengers((n) => n + 1)}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="bk-grid">
                  {field(
                    "name",
                    "Full Name",
                    <input
                      {...inputProps("name")}
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Kavindu Herath"
                      value={form.name}
                      onChange={set("name")}
                    />,
                  )}
                  {field(
                    "email",
                    "Email",
                    <input
                      {...inputProps("email")}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={set("email")}
                    />,
                  )}
                  {field(
                    "phone",
                    "Phone Number",
                    <div className="bk-phone">
                      <GlassSelect
                        ariaLabel="Country code"
                        options={DIAL_CODES}
                        value={form.dial}
                        onChange={(value) =>
                          setForm((f) => ({ ...f, dial: value }))
                        }
                      />
                      <input
                        {...inputProps("phone")}
                        type="tel"
                        autoComplete="tel-national"
                        inputMode="tel"
                        placeholder="77 123 4567"
                        value={form.phone}
                        onChange={set("phone")}
                      />
                    </div>,
                  )}
                </div>
              </section>

              <section className="bk-card" aria-labelledby={`${uid}-payment`}>
                <div className="bk-card-head">
                  <h3 id={`${uid}-payment`}>Payment Details</h3>
                  <p className="bk-secure">
                    <Lock size={18} /> Demo checkout · no real payment is taken
                  </p>
                </div>
                <div
                  className="bk-methods"
                  role="radiogroup"
                  aria-label="Payment method"
                >
                  {METHODS.map(({ id, label, icon: Icon }) => (
                    <label
                      key={id}
                      className={form.method === id ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name={`${uid}-method`}
                        value={id}
                        checked={form.method === id}
                        onChange={set("method")}
                      />
                      <Icon size={20} /> {label}
                    </label>
                  ))}
                </div>
                {form.method === "card" ? (
                  <div className="bk-grid two">
                    {field(
                      "cardName",
                      "Cardholder Name",
                      <input
                        {...inputProps("cardName")}
                        type="text"
                        autoComplete="cc-name"
                        placeholder="Name on card"
                        value={form.cardName}
                        onChange={set("cardName")}
                      />,
                    )}
                    {field(
                      "cardNumber",
                      "Card Number",
                      <div className="bk-input-icon">
                        <input
                          {...inputProps("cardNumber")}
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="1234 5678 9012 3456"
                          value={form.cardNumber}
                          onChange={setFormatted("cardNumber", formatCard)}
                        />
                        <CreditCard size={20} aria-hidden="true" />
                      </div>,
                    )}
                    {field(
                      "expiry",
                      "Expiry Date",
                      <input
                        {...inputProps("expiry")}
                        type="text"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM / YY"
                        value={form.expiry}
                        onChange={setFormatted("expiry", formatExpiry)}
                      />,
                    )}
                    {field(
                      "cvv",
                      "CVV",
                      <div className="bk-input-icon">
                        <input
                          {...inputProps("cvv")}
                          type="password"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          maxLength={4}
                          placeholder="123"
                          value={form.cvv}
                          onChange={setFormatted("cvv", (v) =>
                            digits(v).slice(0, 4),
                          )}
                        />
                        <Info size={20} aria-hidden="true" />
                      </div>,
                    )}
                  </div>
                ) : (
                  <p className="bk-wallet">
                    You&apos;ll confirm the payment with{" "}
                    {form.method === "apple" ? "Apple Pay" : "Google Pay"} on
                    your device.
                  </p>
                )}
              </section>

              <div className="bk-total">
                <span>Total Amount</span>
                <strong>{formatFare(total)}</strong>
              </div>
              <button
                type="submit"
                className="bk-pay"
                disabled={stage === "processing"}
              >
                {stage === "processing" ? (
                  <>
                    <LoaderCircle className="bk-spin" size={20} /> Processing…
                  </>
                ) : (
                  <>
                    <Lock size={20} /> Pay {formatFare(total)}
                  </>
                )}
              </button>
              <p className="bk-note">
                Demo only. Your details stay in this browser tab and are never
                sent anywhere.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
