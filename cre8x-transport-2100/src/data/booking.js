// Mock data for the demo booking dialog. Every value is fictional: the card
// number is a placeholder sequence and nothing here is ever sent or stored.
export const SERVICE_FEE = 20;

export const MOCK_PASSENGER = {
  name: "Kavindu Herath",
  email: "kavindu@example.com",
  dial: "+94",
  phone: "77 123 4567",
};

export const MOCK_CARD = {
  cardName: "Kavindu Herath",
  cardNumber: "1234 5678 9012 3456",
  expiry: "12 / 29",
  cvv: "123",
  saveCard: true,
};

// A journey can hold at most this many seats per vehicle.
export const SEAT_LIMIT = 5;

// Each vehicle type has its own cabin: seat groups per row (a gap sits between
// groups), number of rows, and how the seats are labelled.
export const SEAT_LAYOUTS = {
  bus: { groups: [2, 2], rows: 4, front: "Front", wheel: true },
  rail: { groups: [2, 3], rows: 5, front: "Front car", lettered: true },
  air: { groups: [2], rows: 2, front: "Nose" },
};

/** Rows of seat groups of seat ids, e.g. bus row 1 -> [["1","2"],["3","4"]]. */
export function seatRows(mode) {
  const layout = SEAT_LAYOUTS[mode] ?? SEAT_LAYOUTS.bus;
  let counter = 0;
  return Array.from({ length: layout.rows }, (_, row) =>
    layout.groups.map((size, group) =>
      Array.from({ length: size }, (_, col) => {
        if (!layout.lettered) return String((counter += 1));
        const offset = layout.groups.slice(0, group).reduce((a, b) => a + b, 0);
        return `${row + 1}${"ABCDE"[offset + col]}`;
      }),
    ),
  );
}

// Seats already taken, and the seat suggested first, per vehicle type.
export const MOCK_BOOKED_SEATS = {
  bus: ["1", "2", "7", "10", "13"],
  rail: ["1A", "1B", "2D", "3C", "4A", "4E"],
  air: ["1"],
};
export const MOCK_DEFAULT_SEATS = { bus: ["4"], rail: ["2A"], air: ["3"] };
