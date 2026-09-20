import { useMemo, useSyncExternalStore } from "react";
import { SERVICE_FEE } from "../data/booking";
import { departureDay, formatDay } from "../data/journeys";

// The confirmed booking lives in sessionStorage so it survives moving between
// My Journey and Live Map (and a refresh) but never leaves this browser tab.
// Card details are deliberately never part of it.
const KEY = "moveone.booking";
const listeners = new Set();
let fallback = null; // used when sessionStorage is unavailable
let storageBroken = false;

function read() {
  if (storageBroken) return fallback;
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    storageBroken = true;
    return fallback;
  }
}

function write(value) {
  fallback = value;
  if (!storageBroken) {
    try {
      if (value === null) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, value);
    } catch {
      storageBroken = true;
    }
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const saveBooking = (booking) => write(JSON.stringify(booking));
export const clearBooking = () => write(null);

export function useBooking() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => {
    try {
      const booking = raw ? JSON.parse(raw) : null;
      // Ignore a booking saved by an older version of the app.
      const valid = booking?.services?.every((s) => Array.isArray(s.seats));
      return valid ? booking : null;
    } catch {
      return null;
    }
  }, [raw]);
}

const pad = (n) => String(n).padStart(2, "0");

export function createBooking({
  from,
  to,
  steps,
  route,
  query,
  passenger,
  seats,
  arrival,
}) {
  const day = departureDay();
  const stamp = `${String(day.getFullYear()).slice(2)}${pad(day.getMonth() + 1)}${pad(day.getDate())}`;
  const rides = steps.filter((s) => s.mode !== "walk");
  const passengers = seats[rides[0].start].length;
  const fare = route.cost * passengers;
  return {
    reference: `MVN${stamp}-${Math.floor(1000 + Math.random() * 9000)}`,
    name: passenger.name,
    email: passenger.email,
    from: from.name,
    to: to.name,
    query,
    date: formatDay(day, { year: true }),
    departure: steps[0].time,
    arrival,
    duration: route.duration,
    passengers,
    services: rides.map((ride) => ({
      name: ride.name,
      mode: ride.mode,
      seats: seats[ride.start],
    })),
    fare,
    fee: SERVICE_FEE,
    total: fare + SERVICE_FEE,
    emissionsSaved: route.emissionsSaved,
  };
}

// What the ticket QR code encodes: enough to identify the booking at a gate.
export const ticketPayload = (b) =>
  [
    "MOVEONE",
    b.reference,
    `${b.from}>${b.to}`,
    `${b.date} ${b.departure}`,
    b.services.map((s) => `${s.name}#${s.seats.join("+")}`).join(","),
  ].join("|");

/** Seat lines for the ticket: one per ride, labelled only when there are several. */
export function seatSummary(booking) {
  const many = booking.services.length > 1;
  return booking.services.map((service) => ({
    label: many ? service.name.split(" · ")[0] : null,
    text: service.seats.join(", "),
  }));
}
