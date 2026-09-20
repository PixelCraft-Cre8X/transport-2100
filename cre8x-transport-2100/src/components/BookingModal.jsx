import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Armchair,
  BusFront,
  Check,
  CreditCard,
  Disc3,
  Info,
  Leaf,
  LoaderCircle,
  Lock,
  LocateFixed,
  MapPin,
  Smartphone,
  X,
} from "lucide-react";
import { formatFare } from "../data/journeys";
import {
  MOCK_BOOKED_SEATS,
  MOCK_CARD,
  MOCK_DEFAULT_SEAT,
  MOCK_PASSENGER,
  SEATS_PER_VEHICLE,
  SERVICE_FEE,
} from "../data/booking";
import GlassSelect from "./GlassSelect";
import Modal from "./Modal";
import Ticket from "./Ticket";
import { createBooking, saveBooking } from "../utils/booking";
import { ModeIcon } from "./UI";
import "./BookingModal.css";

const STEPS = ["Passenger", "Seat", "Payment"];
const HEADINGS = [
  {
    title: "Book Your Journey",
    subtitle: "Fill in your details and choose your seat.",
    icon: BusFront,
  },
  {
    title: "Select Your Seat",
    subtitle: "Choose one of the available seats.",
    icon: Armchair,
  },
  {
    title: "Payment Details",
    subtitle: "Complete your payment to confirm your booking.",
    icon: CreditCard,
  },
];
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

function validatePassenger(form) {
  const errors = {};
  if (form.name.trim().length < 2)
    errors.name = "Enter the passenger's full name.";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
    errors.email = "Enter a valid email address.";
  if (digits(form.phone).length < 7 || digits(form.phone).length > 12)
    errors.phone = "Enter a valid phone number.";
  return errors;
}

function validatePayment(form) {
  const errors = {};
  if (form.method !== "card") return errors;
  if (form.cardName.trim().length < 2)
    errors.cardName = "Enter the name on the card.";
  if (digits(form.cardNumber).length !== 16)
    errors.cardNumber = "Enter the 16-digit card number.";
  const month = Number(digits(form.expiry).slice(0, 2));
  if (digits(form.expiry).length !== 4 || month < 1 || month > 12)
    errors.expiry = "Use the format MM / YY.";
  if (digits(form.cvv).length < 3) errors.cvv = "Enter the 3 or 4 digit code.";
  return errors;
}

export default function BookingModal({ open, ...props }) {
  return open ? <BookingDialog {...props} /> : null;
}

function BookingDialog({
  onClose,
  from,
  to,
  steps,
  route,
  arrival,
  query,
  trackHref,
}) {
  const uid = useId();
  const dialogRef = useRef(null);
  const mounted = useRef(false);
  const timer = useRef(null);
  const [step, setStep] = useState(1);
  const [stage, setStage] = useState("form"); // form | processing | done
  const [tried, setTried] = useState({
    passenger: false,
    seat: false,
    pay: false,
  });
  const [booking, setBooking] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [seats, setSeats] = useState(() =>
    Object.fromEntries(
      steps
        .filter((s) => s.mode !== "walk")
        .map((ride) => [ride.start, MOCK_DEFAULT_SEAT[ride.mode]]),
    ),
  );
  const [saveCard, setSaveCard] = useState(MOCK_CARD.saveCard);
  const [form, setForm] = useState({
    ...MOCK_PASSENGER,
    method: "card",
    cardName: MOCK_CARD.cardName,
    cardNumber: MOCK_CARD.cardNumber,
    expiry: MOCK_CARD.expiry,
    cvv: MOCK_CARD.cvv,
  });

  const rides = steps.filter((s) => s.mode !== "walk");
  const activeRide =
    rides.find((ride) => String(ride.start) === vehicle) || rides[0];
  const activeSeats = SEATS_PER_VEHICLE[activeRide.mode] || 10;
  const booked = new Set(MOCK_BOOKED_SEATS[activeRide.mode]);
  const chosenCount = rides.filter((ride) => seats[ride.start]).length;
  const seatsDone = chosenCount === rides.length;
  const total = route.cost + SERVICE_FEE;

  const passengerErrors = validatePassenger(form);
  const paymentErrors = validatePayment(form);
  const errors = step === 1 ? passengerErrors : paymentErrors;
  const attempted = step === 1 ? tried.passenger : tried.pay;
  const shown = attempted ? errors : {};
  const done = stage === "done";
  const heading = HEADINGS[Math.min(step, 3) - 1];
  const HeadingIcon = heading.icon;

  const set = (field) => (event) =>
    setForm((f) => ({ ...f, [field]: event.target.value }));
  const setFormatted = (field, format) => (event) =>
    setForm((f) => ({ ...f, [field]: format(event.target.value) }));

  useEffect(() => {
    const pending = timer;
    return () => clearTimeout(pending.current);
  }, []);

  // Each step change starts at the top with the new heading announced.
  useEffect(() => {
    if (mounted.current) {
      dialogRef.current
        ?.querySelector(".bk-heading h2, .tc-header h2")
        ?.focus();
      dialogRef.current?.querySelector(".bk-body")?.scrollTo(0, 0);
    }
    mounted.current = true;
  }, [step, stage]);

  const focusFirstError = () =>
    requestAnimationFrame(() =>
      dialogRef.current?.querySelector('[aria-invalid="true"]')?.focus(),
    );

  const toSeats = (event) => {
    event.preventDefault();
    setTried((t) => ({ ...t, passenger: true }));
    if (Object.keys(passengerErrors).length) {
      focusFirstError();
      return;
    }
    setStep(2);
  };

  const toPayment = () => {
    setTried((t) => ({ ...t, seat: true }));
    if (seatsDone) setStep(3);
  };

  const pay = (event) => {
    event.preventDefault();
    if (stage !== "form") return;
    setTried((t) => ({ ...t, pay: true }));
    if (Object.keys(paymentErrors).length) {
      focusFirstError();
      return;
    }
    setStage("processing");
    timer.current = setTimeout(() => {
      const created = createBooking({
        from,
        to,
        steps,
        route,
        query,
        passenger: form,
        seats,
        arrival,
      });
      saveBooking(created);
      setBooking(created);
      setStage("done");
    }, 1100);
  };

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
    <Modal
      onClose={onClose}
      labelledBy={`${uid}-title`}
      dialogRef={dialogRef}
      className={done ? "tc-dialog" : ""}
    >
      {done ? (
        <div className="bk-body">
          <Ticket booking={booking} titleId={`${uid}-title`} onClose={onClose}>
            <button type="button" className="bk-primary" onClick={onClose}>
              Done
            </button>
            <Link className="bk-secondary" to={trackHref}>
              Track journey <ArrowRight size={18} />
            </Link>
          </Ticket>
        </div>
      ) : (
        <>
          <header className="bk-header">
            <span className="bk-header-icon">
              <HeadingIcon size={28} />
            </span>
            <div className="bk-heading">
              <h2 id={`${uid}-title`} tabIndex={-1}>
                {heading.title}
              </h2>
              <p>{heading.subtitle}</p>
            </div>
            <button
              type="button"
              className="bk-close"
              aria-label="Close booking"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </header>

          <ol className="bk-steps" aria-label="Booking progress">
            {STEPS.map((label, i) => {
              const number = i + 1;
              const state =
                number < step ? "done" : number === step ? "current" : "";
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

          <div className="bk-body">
            {step === 1 && (
              <form className="bk-step-form" onSubmit={toSeats} noValidate>
                <div className="bk-passenger">
                  <div className="bk-fields">
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

                  <aside className="bk-summary" aria-label="Journey summary">
                    <h3>Journey Summary</h3>
                    <ol className="bk-timeline">
                      <li>
                        <span className="bk-node">
                          <LocateFixed size={18} />
                        </span>
                        <div>
                          <strong>{from.name}</strong>
                          <small>{steps[0].time}</small>
                        </div>
                      </li>
                      {rides.map((ride) => (
                        <li key={ride.start}>
                          <span className="bk-node">
                            <ModeIcon mode={ride.mode} size={18} />
                          </span>
                          <div>
                            <strong>{ride.name}</strong>
                            <small>{ride.minutes} min</small>
                          </div>
                        </li>
                      ))}
                      <li>
                        <span className="bk-node">
                          <MapPin size={18} />
                        </span>
                        <div>
                          <strong>{to.name}</strong>
                          <small>{arrival}</small>
                        </div>
                      </li>
                    </ol>
                    <dl className="bk-totals">
                      <div>
                        <dt>Estimated time</dt>
                        <dd>{route.duration} min</dd>
                      </div>
                      <div>
                        <dt>Estimated fare</dt>
                        <dd>{formatFare(route.cost)}</dd>
                      </div>
                    </dl>
                    <div className="bk-green">
                      <Leaf size={30} />
                      <div>
                        <strong>Greener travel</strong>
                        <span>~ {route.emissionsSaved}% lower emissions</span>
                      </div>
                    </div>
                  </aside>
                </div>
                <button type="submit" className="bk-primary">
                  Next: Select Seat <ArrowRight size={20} />
                </button>
              </form>
            )}

            {step === 2 && (
              <div className="bk-step-form">
                <div className="bk-vehicle">
                  <span className="bk-vehicle-icon">
                    <ModeIcon mode={activeRide.mode} size={20} />
                  </span>
                  <GlassSelect
                    ariaLabel="Vehicle"
                    options={rides.map((ride) => ({
                      label: ride.name,
                      value: String(ride.start),
                    }))}
                    value={String(activeRide.start)}
                    onChange={setVehicle}
                  />
                </div>

                <div className="bk-seat-layout">
                  <div
                    className="bk-cabin"
                    role="radiogroup"
                    aria-label={`Seats on ${activeRide.name}`}
                  >
                    <div className="bk-cabin-front">
                      <span>Front</span>
                      <Disc3 size={26} aria-hidden="true" />
                    </div>
                    <div className="bk-seat-grid">
                      {Array.from({ length: activeSeats }, (_, i) => i + 1).map(
                        (seat) => {
                          const isBooked = booked.has(seat);
                          const isChosen = seats[activeRide.start] === seat;
                          return (
                            <button
                              key={seat}
                              type="button"
                              role="radio"
                              aria-checked={isChosen}
                              aria-label={`Seat ${seat}${isBooked ? ", booked" : ""}`}
                              disabled={isBooked}
                              className={`bk-seat ${isChosen ? "chosen" : ""}`}
                              onClick={() =>
                                setSeats((current) => ({
                                  ...current,
                                  [activeRide.start]: seat,
                                }))
                              }
                            >
                              {seat}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>

                  <div className="bk-seat-side">
                    <ul className="bk-legend">
                      <li className="available">Available</li>
                      <li className="chosen">Selected</li>
                      <li className="booked">Booked</li>
                    </ul>
                    <div className="bk-selected">
                      <strong>Selected Seat</strong>
                      <output aria-live="polite">
                        {seats[activeRide.start] || "–"}
                      </output>
                      {rides.length > 1 && (
                        <small>
                          {chosenCount} of {rides.length} rides
                        </small>
                      )}
                    </div>
                  </div>
                </div>

                {tried.seat && !seatsDone && (
                  <p className="bk-error" role="alert">
                    Choose a seat on{" "}
                    {rides.length > 1 ? "each ride" : "this ride"} to continue.
                  </p>
                )}
                <div className="bk-nav">
                  <button
                    type="button"
                    className="bk-secondary"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft size={18} /> Back
                  </button>
                  <button
                    type="button"
                    className="bk-primary"
                    onClick={toPayment}
                  >
                    Next: Payment <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <form className="bk-step-form" onSubmit={pay} noValidate>
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
                  <div className="bk-grid">
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
                    <div className="bk-pair">
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
                    <label className="bk-check">
                      <input
                        type="checkbox"
                        checked={saveCard}
                        onChange={(event) => setSaveCard(event.target.checked)}
                      />
                      <span aria-hidden="true">
                        <Check size={14} />
                      </span>
                      Save this card for future payments
                    </label>
                  </div>
                ) : (
                  <p className="bk-wallet">
                    You&apos;ll confirm the payment with{" "}
                    {form.method === "apple" ? "Apple Pay" : "Google Pay"} on
                    your device.
                  </p>
                )}

                <dl className="bk-fare">
                  <div>
                    <dt>Fare (1 seat)</dt>
                    <dd>{formatFare(route.cost)}</dd>
                  </div>
                  <div>
                    <dt>Service fee</dt>
                    <dd>{formatFare(SERVICE_FEE)}</dd>
                  </div>
                  <div className="total">
                    <dt>Total</dt>
                    <dd>{formatFare(total)}</dd>
                  </div>
                </dl>

                <div className="bk-nav">
                  <button
                    type="button"
                    className="bk-secondary"
                    disabled={stage === "processing"}
                    onClick={() => setStep(2)}
                  >
                    <ArrowLeft size={18} /> Back
                  </button>
                  <button
                    type="submit"
                    className="bk-primary"
                    disabled={stage === "processing"}
                  >
                    {stage === "processing" ? (
                      <>
                        <LoaderCircle className="bk-spin" size={20} />{" "}
                        Processing…
                      </>
                    ) : (
                      <>
                        <Lock size={20} /> Pay {formatFare(total)}
                      </>
                    )}
                  </button>
                </div>
                <p className="bk-note">
                  Demo checkout: no real payment is taken and your details stay
                  in this browser tab. By continuing, you agree to our{" "}
                  <span className="bk-terms">Terms of Service</span> and{" "}
                  <span className="bk-terms">Privacy Policy</span>.
                </p>
              </form>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
