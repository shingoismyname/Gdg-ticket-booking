
const API_URL = 'http://localhost:3000/api';

async function request(path, options = {}) {
  const headers = {
    ...options.headers,
  };

  if (options.body !== undefined && options.body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    console.error('API connection error:', error);

    throw new Error(
      'Khong the ket noi backend. Hay kiem tra server tai http://localhost:3000'
    );
  }

  const contentType = response.headers.get('content-type') || '';
  let result = {};

  if (contentType.includes('application/json')) {
    result = await response.json().catch(() => ({}));
  } else {
    const text = await response.text().catch(() => '');
    result = text ? { message: text } : {};
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
      result.message ||
      `Request failed (${response.status})`
    );
  }

  return result;
}

// GET /api/events
// Returns: { data: [...] }
export function getEvents() {
  return request('/events');
}

// GET /api/categories
// Returns: { data: [...] }
export function getCategories() {
  return request('/categories');
}

// GET /api/events/:eventId/seats
// Returns: { seats: [...] }
export function getEventSeats(eventId) {
  return request(`/events/${encodeURIComponent(eventId)}/seats`);
}

// POST /api/holds
export function holdSeats(eventId, seatLabels) {
  return request('/holds', {
    method: 'POST',
    body: JSON.stringify({ eventId, seatLabels }),
  });
}

// DELETE /api/holds
export function cancelHold(holdToken) {
  return request('/holds', {
    method: 'DELETE',
    body: JSON.stringify({ holdToken }),
  });
}

// POST /api/bookings/confirm
// Returns: { booking: {...} }
export function confirmBooking(holdToken, guestEmail = null) {
  return request('/bookings/confirm', {
    method: 'POST',
    body: JSON.stringify({ holdToken, guestEmail }),
  });
}

// GET /api/bookings/:bookingCode
// Returns: { booking: {...} }
export function getBooking(bookingCode) {
  return request(
    `/bookings/${encodeURIComponent(bookingCode)}`
  );
}

// POST /api/bookings/cancel
export function cancelBooking(bookingCode, cancelToken) {
  return request('/bookings/cancel', {
    method: 'POST',
    body: JSON.stringify({ bookingCode, cancelToken }),
  });
}
