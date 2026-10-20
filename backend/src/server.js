
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------
// SUPABASE
// ---------------------------------------------------------

if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// ---------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------

app.use(
  cors({
    origin:
      process.env.FRONTEND_URL || 'http://localhost:5173',
  })
);

app.use(express.json({ limit: '20kb' }));

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

function isValidToken(token) {
  return (
    typeof token === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token
    )
  );
}

function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function isValidBookingCode(code) {
  return (
    typeof code === 'string' &&
    /^[A-F0-9]{6,12}$/i.test(code.trim())
  );
}

// ---------------------------------------------------------
// 1. HEALTH CHECK
// GET /health
// ---------------------------------------------------------

app.get('/health', (req, res) => {
  return res.json({ status: 'ok' });
});

// ---------------------------------------------------------
// 2. GET EVENTS
// GET /api/events
//
// Returns: { data: [...] }
//
// Uses actual columns from public.events.
// Does not expose service-role credentials.
// ---------------------------------------------------------

app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select(`
        id,
        slug,
        name,
        short_description,
        description,
        category,
        tags,
        start_at,
        end_at,
        doors_open_at,
        venue_name,
        venue_address,
        organizer_name,
        organizer_description,
        organizer_url,
        guests,
        banner_url,
        thumbnail_url,
        ticket_price,
        status,
        published_at,
        created_at,
        updated_at
      `)
      .eq('status', 'published')
      .order('id', { ascending: true });

    if (error) {
      console.error('GET events:', error.message);
      return sendError(
        res,
        500,
        'Khong the lay danh sach su kien'
      );
    }

    return res.json({ data: data ?? [] });
  } catch (err) {
    console.error('GET events unexpected error:', err);
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 3. GET EVENT CATEGORIES
// GET /api/categories
//
// Returns: { data: [...] }
// Only returns active categories.
// ---------------------------------------------------------

app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_categories')
      .select(`
        id,
        slug,
        name,
        description,
        sort_order
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET categories:', error.message);
      return sendError(
        res,
        500,
        'Khong the lay danh muc su kien'
      );
    }

    return res.json({ data: data ?? [] });
  } catch (err) {
    console.error('GET categories unexpected error:', err);
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 4. GET EVENT SEATS
// GET /api/events/:eventId/seats
//
// Requires RPC:
// get_event_seats(p_event_id bigint)
// ---------------------------------------------------------

app.get('/api/events/:eventId/seats', async (req, res) => {
  try {
    const eventId = Number(req.params.eventId);

    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return sendError(res, 400, 'eventId khong hop le');
    }

    const { data, error } = await supabase.rpc(
      'get_event_seats',
      {
        p_event_id: eventId,
      }
    );

    if (error) {
      console.error('GET seats:', error.message);
      return sendError(
        res,
        500,
        'Khong the lay danh sach ghe'
      );
    }

    return res.json({ seats: data ?? [] });
  } catch (err) {
    console.error('GET seats unexpected error:', err);
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 5. HOLD SEATS
// POST /api/holds
// Body: { eventId, seatLabels: ["A1", "A2"] }
//
// Requires RPC:
// hold_seats(p_event_id bigint, p_labels text[])
// ---------------------------------------------------------

app.post('/api/holds', async (req, res) => {
  try {
    const { eventId, seatLabels } = req.body ?? {};
    const id = Number(eventId);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return sendError(res, 400, 'eventId khong hop le');
    }

    if (
      !Array.isArray(seatLabels) ||
      seatLabels.length < 1 ||
      seatLabels.length > 10 ||
      !seatLabels.every(
        (label) =>
          typeof label === 'string' &&
          label.trim().length > 0 &&
          label.trim().length <= 30
      )
    ) {
      return sendError(
        res,
        400,
        'Danh sach ghe khong hop le'
      );
    }

    const labels = seatLabels.map((label) => label.trim());

    if (new Set(labels).size !== labels.length) {
      return sendError(res, 400, 'Danh sach ghe bi trung');
    }

    const { data, error } = await supabase.rpc('hold_seats', {
      p_event_id: id,
      p_labels: labels,
    });

    if (error) {
      console.error('POST holds:', error.message);
      return sendError(res, 409, error.message);
    }

    if (
      !data ||
      typeof data !== 'object' ||
      !data.hold_token
    ) {
      console.error('Unexpected hold result:', data);
      return sendError(
        res,
        500,
        'Khong nhan duoc hold token'
      );
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('POST holds unexpected error:', err);
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 6. CANCEL HOLD
// DELETE /api/holds
// Body: { holdToken }
//
// Requires RPC: cancel_hold(p_hold_token uuid)
// ---------------------------------------------------------

app.delete('/api/holds', async (req, res) => {
  try {
    const { holdToken } = req.body ?? {};

    if (!isValidToken(holdToken)) {
      return sendError(res, 400, 'holdToken khong hop le');
    }

    const { data, error } = await supabase.rpc('cancel_hold', {
      p_hold_token: holdToken,
    });

    if (error) {
      console.error('DELETE holds:', error.message);
      return sendError(res, 409, error.message);
    }

    return res.json({ result: data });
  } catch (err) {
    console.error('DELETE holds unexpected error:', err);
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 7. CONFIRM BOOKING
// POST /api/bookings/confirm
// Body: { holdToken, guestEmail }
//
// Requires RPC: confirm_booking(uuid, text)
// ---------------------------------------------------------

app.post('/api/bookings/confirm', async (req, res) => {
  try {
    const {
      holdToken,
      guestEmail = null,
    } = req.body ?? {};

    if (!isValidToken(holdToken)) {
      return sendError(res, 400, 'holdToken khong hop le');
    }

    if (
      guestEmail !== null &&
      (
        typeof guestEmail !== 'string' ||
        !isValidEmail(guestEmail)
      )
    ) {
      return sendError(res, 400, 'Email khong hop le');
    }

    const { data, error } = await supabase.rpc(
      'confirm_booking',
      {
        p_hold_token: holdToken,
        p_guest_email:
          typeof guestEmail === 'string'
            ? guestEmail.trim() || null
            : null,
      }
    );

    if (error) {
      console.error('POST confirm booking:', error.message);
      return sendError(res, 409, error.message);
    }

    if (
      !data ||
      typeof data !== 'object' ||
      !data.booking_code ||
      !data.cancel_token
    ) {
      console.error('Unexpected booking result:', data);
      return sendError(
        res,
        500,
        'Ket qua booking khong hop le'
      );
    }

    // cancel_token là bí mật, chỉ trả về khi tạo booking.
    return res.status(201).json({ booking: data });
  } catch (err) {
    console.error(
      'POST confirm booking unexpected error:',
      err
    );
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 8. LOOK UP BOOKING
// GET /api/bookings/:bookingCode
//
// Requires RPC: get_booking(p_booking_code text)
// Does not return cancel_token.
// ---------------------------------------------------------

app.get('/api/bookings/:bookingCode', async (req, res) => {
  try {
    const bookingCode = req.params.bookingCode
      .trim()
      .toUpperCase();

    if (!isValidBookingCode(bookingCode)) {
      return sendError(
        res,
        400,
        'Ma booking khong hop le'
      );
    }

    const { data, error } = await supabase.rpc('get_booking', {
      p_booking_code: bookingCode,
    });

    if (error) {
      console.error('GET booking:', error.message);
      return sendError(
        res,
        404,
        'Khong tim thay booking'
      );
    }

    if (!data) {
      return sendError(
        res,
        404,
        'Khong tim thay booking'
      );
    }

    return res.json({ booking: data });
  } catch (err) {
    console.error('GET booking unexpected error:', err);
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 9. CANCEL BOOKING
// POST /api/bookings/cancel
// Body: { bookingCode, cancelToken }
//
// Requires RPC: cancel_booking(text, uuid)
// ---------------------------------------------------------

app.post('/api/bookings/cancel', async (req, res) => {
  try {
    const { bookingCode, cancelToken } = req.body ?? {};

    if (
      !isValidBookingCode(bookingCode) ||
      !isValidToken(cancelToken)
    ) {
      return sendError(
        res,
        400,
        'Thong tin huy booking khong hop le'
      );
    }

    const { data, error } = await supabase.rpc(
      'cancel_booking',
      {
        p_booking_code: bookingCode.trim().toUpperCase(),
        p_cancel_token: cancelToken,
      }
    );

    if (error) {
      console.error('POST cancel booking:', error.message);
      return sendError(res, 409, error.message);
    }

    return res.json({ result: data });
  } catch (err) {
    console.error(
      'POST cancel booking unexpected error:',
      err
    );
    return sendError(res, 500, 'Loi server');
  }
});

// ---------------------------------------------------------
// 404
// ---------------------------------------------------------

app.use((req, res) => {
  return sendError(res, 404, 'Endpoint khong ton tai');
});

// ---------------------------------------------------------
// ERROR HANDLER
// ---------------------------------------------------------

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return sendError(res, 400, 'JSON khong hop le');
  }

  console.error('Unhandled server error:', err);
  return sendError(res, 500, 'Loi server');
});

// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
