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

// Seats per vehicle type, the ones already taken, and the seat suggested first.
export const SEATS_PER_VEHICLE = { bus: 10, rail: 12, air: 4 };
export const MOCK_BOOKED_SEATS = {
  bus: [1, 2, 7],
  rail: [1, 2, 5, 9],
  air: [1],
};
export const MOCK_DEFAULT_SEAT = { bus: 4, rail: 4, air: 3 };
