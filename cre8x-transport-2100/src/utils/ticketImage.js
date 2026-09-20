import qrcode from "qrcode-generator";
import { seatSummary, ticketPayload } from "./booking";
import { formatFare } from "../data/journeys";

const W = 900;
const H = 1160;
const SCALE = 2;

/** Builds the QR matrix for a booking as rows of booleans (true = dark module). */
export function qrMatrix(booking) {
  const qr = qrcode(0, "H");
  qr.addData(ticketPayload(booking));
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => qr.isDark(r, c)),
  );
}

const loadImage = (src) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws the ticket to a canvas and resolves with a PNG blob. */
export async function renderTicketPng(booking, logoSrc) {
  await Promise.all(
    ["400 16px Manrope", "600 16px Manrope", "700 16px Manrope"].map((font) =>
      document.fonts?.load(font).catch(() => {}),
    ),
  );
  const logo = await loadImage(logoSrc);
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  const font = (weight, size) => `${weight} ${size}px Manrope, sans-serif`;
  const text = (
    value,
    x,
    y,
    { weight = 400, size = 20, color = "#e6eef6", align = "left" } = {},
  ) => {
    ctx.font = font(weight, size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };

  // Backdrop and card
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#07111f");
  bg.addColorStop(1, "#0b1a2c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.fillStyle = "#0e1e33";
  roundRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.fill();
  ctx.stroke();

  // Brand row
  if (logo) ctx.drawImage(logo, 80, 84, 64, 64);
  text("moveone", 160, 118, { weight: 700, size: 30, color: "#22d3ee" });
  text("THE WAY FORWARD.", 160, 142, { size: 13, color: "#8fa3b7" });
  text("Journey Ticket", 590, 122, { weight: 600, size: 22, align: "right" });
  ctx.fillStyle = "rgba(52,211,153,0.14)";
  ctx.strokeStyle = "rgba(52,211,153,0.6)";
  roundRect(ctx, 620, 94, 200, 46, 10);
  ctx.fill();
  ctx.stroke();
  text("CONFIRMED", 720, 124, {
    weight: 700,
    size: 18,
    color: "#6ee7b7",
    align: "center",
  });

  // Route
  text("FROM", 80, 214, { size: 16, color: "#8fa3b7" });
  text(booking.from, 80, 262, { weight: 700, size: 40 });
  text("TO", 820, 214, { size: 16, color: "#8fa3b7", align: "right" });
  text(booking.to, 820, 262, { weight: 700, size: 40, align: "right" });
  text("→", 450, 252, { size: 34, color: "#8fa3b7", align: "center" });
  [
    ["Date", booking.date, 80],
    ["Departure", booking.departure, 380],
    ["Arrival", booking.arrival, 640],
  ].forEach(([label, value, x]) => {
    text(label, x, 328, { size: 16, color: "#8fa3b7" });
    text(value, x, 358, { weight: 600, size: 22 });
  });

  // Tear line
  ctx.strokeStyle = "rgba(148,163,184,0.4)";
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(80, 410);
  ctx.lineTo(W - 80, 410);
  ctx.stroke();
  ctx.setLineDash([]);

  // Passenger, seats, services
  text("Passenger", 80, 470, { size: 16, color: "#8fa3b7" });
  text(booking.name, 80, 502, { weight: 600, size: 22 });
  if (booking.passengers > 1)
    text(`+ ${booking.passengers - 1} more`, 80, 526, {
      size: 14,
      color: "#8fa3b7",
    });
  text("Seat No.", 80, 566, { size: 16, color: "#8fa3b7" });
  const seatLines = seatSummary(booking);
  seatLines.forEach((line, i) =>
    text(
      line.label ? `${line.label}: ${line.text}` : line.text,
      80,
      598 + i * 30,
      { weight: 700, size: seatLines.length > 1 ? 20 : 26 },
    ),
  );
  const serviceY = 598 + seatLines.length * 30 + 24;
  text("Service", 80, serviceY, { size: 16, color: "#8fa3b7" });
  booking.services.forEach((service, i) =>
    text(service.name, 80, serviceY + 30 + i * 28, { weight: 600, size: 17 }),
  );

  // QR code
  const matrix = qrMatrix(booking);
  const quiet = 4;
  const modules = matrix.length + quiet * 2;
  const qrSize = 250;
  const qrX = 325;
  const qrY = 448;
  const cell = qrSize / modules;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 14);
  ctx.fill();
  ctx.fillStyle = "#0a1626";
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark)
        ctx.fillRect(
          qrX + (c + quiet) * cell,
          qrY + (r + quiet) * cell,
          cell + 0.4,
          cell + 0.4,
        );
    }),
  );
  const badge = qrSize * 0.2;
  ctx.fillStyle = "#0a1626";
  roundRect(
    ctx,
    qrX + (qrSize - badge) / 2,
    qrY + (qrSize - badge) / 2,
    badge,
    badge,
    8,
  );
  ctx.fill();
  if (logo)
    ctx.drawImage(
      logo,
      qrX + (qrSize - badge) / 2 + 6,
      qrY + (qrSize - badge) / 2 + 6,
      badge - 12,
      badge - 12,
    );
  text("Scan this QR code", qrX + qrSize / 2, qrY + qrSize + 34, {
    size: 16,
    color: "#b8c8d8",
    align: "center",
  });
  text("at boarding and transfers", qrX + qrSize / 2, qrY + qrSize + 58, {
    size: 16,
    color: "#b8c8d8",
    align: "center",
  });

  // Booking ID and fare
  text("Booking ID", 620, 470, { size: 16, color: "#8fa3b7" });
  text(booking.reference, 620, 502, { weight: 600, size: 22 });
  text("Total Fare", 620, 556, { size: 16, color: "#8fa3b7" });
  text(formatFare(booking.total), 620, 590, { weight: 700, size: 28 });
  ctx.fillStyle = "rgba(52,211,153,0.08)";
  ctx.strokeStyle = "rgba(52,211,153,0.3)";
  roundRect(ctx, 620, 622, 200, 96, 12);
  ctx.fill();
  ctx.stroke();
  text("Greener travel", 636, 656, { weight: 600, size: 16 });
  text(`~ ${booking.emissionsSaved}% lower emissions`, 636, 682, {
    size: 14,
    color: "#5eead4",
  });
  text("compared to car travel.", 636, 704, { size: 13, color: "#8fa3b7" });

  // Footer
  ctx.strokeStyle = "rgba(148,163,184,0.25)";
  ctx.beginPath();
  ctx.moveTo(80, 800);
  ctx.lineTo(W - 80, 800);
  ctx.stroke();
  text("Important information", 80, 850, { weight: 600, size: 20 });
  [
    "Arrive at the departure point at least 10 minutes before departure.",
    "Keep your QR code ready for scanning.",
    "Your route is locked after payment. Cancelled journeys are not refunded.",
  ].forEach((line, i) =>
    text(`•  ${line}`, 80, 890 + i * 34, { size: 17, color: "#cfdbe7" }),
  );
  text(
    "Simulated ticket · Sri Lanka, 2100 · not valid for real travel",
    W / 2,
    H - 90,
    {
      size: 14,
      color: "#6f8398",
      align: "center",
    },
  );

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
