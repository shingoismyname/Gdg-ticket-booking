
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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
  ?.trim()
  .toLowerCase();

async function requireAdmin(req, res, next) {
  try {
    if (!ADMIN_EMAIL) {
      return res.status(500).json({
        error: 'Admin authentication is not configured',
      });
    }

    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error: 'Missing access token',
      });
    }

    const accessToken = match[1];

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid or expired access token',
      });
    }

    if (
      !user.email ||
      user.email.trim().toLowerCase() !== ADMIN_EMAIL
    ) {
      return res.status(403).json({
        error: 'Admin access required',
      });
    }

    req.admin = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);

    return res.status(500).json({
      error: 'Unable to verify admin access',
    });
  }
}

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

// authen của trang admin 
app.get('/api/admin/test', requireAdmin, (req, res) => {
  res.json({
    message: 'Admin authentication successful',
    email: req.admin.email,
  });
});

// GET /api/admin/events
// Lấy danh sách sự kiện cho admin dashboard
app.get('/api/admin/events', requireAdmin, async (req, res) => {
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
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Admin get events error:', error);
      return res.status(500).json({
        error: 'Không thể tải danh sách sự kiện.',
      });
    }

    return res.json({ events: data ?? [] });
  } catch (error) {
    console.error('Admin events error:', error);
    return res.status(500).json({
      error: 'Lỗi máy chủ khi tải sự kiện.',
    });
  }
});




/* ---------------------------------------------------------
   ADMIN SEAT MANAGEMENT

   GET    /api/admin/events/:id/seats
   POST   /api/admin/events/:id/seats/generate
   DELETE /api/admin/events/:id/seats/:seatId

   Tất cả route đều yêu cầu requireAdmin.
--------------------------------------------------------- */

// 1. Xem danh sách ghế và dữ liệu giữ chỗ/đặt vé liên quan.
app.get(
  '/api/admin/events/:id/seats',
  requireAdmin,
  async (req, res) => {
    try {
      const eventId = Number(req.params.id);

      if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        return sendError(res, 400, 'ID sự kiện không hợp lệ.');
      }

      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, name, status, ticket_price')
        .eq('id', eventId)
        .maybeSingle();

      if (eventError) {
        console.error('Admin get seat event:', eventError);
        return sendError(res, 500, 'Không thể tải sự kiện.');
      }

      if (!event) {
        return sendError(res, 404, 'Không tìm thấy sự kiện.');
      }

      const { data: seats, error: seatsError } = await supabase
        .from('seats')
        .select('id, event_id, label, created_at')
        .eq('event_id', eventId)
        .order('label', { ascending: true });

      if (seatsError) {
        console.error('Admin get seats:', seatsError);
        return sendError(res, 500, 'Không thể tải danh sách ghế.');
      }

      const seatIds = (seats ?? []).map((seat) => seat.id);

      // Không truy vấn bảng con nếu sự kiện chưa có ghế.
      if (seatIds.length === 0) {
        return res.json({
          event,
          seats: [],
          holds: [],
          bookingItems: [],
        });
      }

      const [
        { data: holds, error: holdsError },
        { data: bookingItems, error: itemsError },
      ] = await Promise.all([
        supabase
          .from('holds')
          .select('id, seat_id, status, expires_at, booking_id')
          .in('seat_id', seatIds),

        supabase
          .from('booking_items')
          .select(
            'id, seat_id, booking_id, status, price, cancelled_at'
          )
          .in('seat_id', seatIds),
      ]);

      if (holdsError || itemsError) {
        console.error('Admin get seat history:', {
          holdsError,
          itemsError,
        });

        return sendError(
          res,
          500,
          'Không thể tải dữ liệu giữ chỗ/đặt vé.'
        );
      }

      return res.json({
        event,
        seats: seats ?? [],
        holds: holds ?? [],
        bookingItems: bookingItems ?? [],
      });
    } catch (error) {
      console.error('Admin get seats unexpected error:', error);
      return sendError(res, 500, 'Lỗi máy chủ khi tải ghế.');
    }
  }
);


// 2. Tạo sơ đồ ghế ban đầu.
// Chỉ dùng khi sự kiện chưa có ghế.
app.post(
  '/api/admin/events/:id/seats/generate',
  requireAdmin,
  async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const { rows, cols } = req.body ?? {};

      if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        return sendError(res, 400, 'ID sự kiện không hợp lệ.');
      }

      if (
        !Number.isInteger(rows) ||
        !Number.isInteger(cols) ||
        rows < 1 ||
        rows > 26 ||
        cols < 1 ||
        cols > 50
      ) {
        return sendError(
          res,
          400,
          'Số hàng phải từ 1-26 và số ghế mỗi hàng từ 1-50.'
        );
      }

      const { data, error } = await supabase.rpc(
        'admin_generate_seat_grid',
        {
          p_event_id: eventId,
          p_rows: rows,
          p_cols: cols,
        }
      );

      if (error) {
        console.error('Admin generate seats:', error);

        // Sự kiện không tồn tại hoặc đã có ghế,
        // hay dữ liệu không thỏa điều kiện của function.
        return sendError(
          res,
          409,
          error.message || 'Không thể tạo sơ đồ ghế.'
        );
      }

      return res.status(201).json({ result: data });
    } catch (error) {
      console.error('Admin generate seats unexpected error:', error);
      return sendError(res, 500, 'Lỗi máy chủ khi tạo sơ đồ ghế.');
    }
  }
);


// 3. Xóa ghế thông qua PostgreSQL function kiểm tra an toàn.
app.delete(
  '/api/admin/events/:id/seats/:seatId',
  requireAdmin,
  async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      const seatId = Number(req.params.seatId);

      if (
        !Number.isSafeInteger(eventId) ||
        eventId <= 0 ||
        !Number.isSafeInteger(seatId) ||
        seatId <= 0
      ) {
        return sendError(res, 400, 'ID sự kiện hoặc ghế không hợp lệ.');
      }

      // Đảm bảo ghế thuộc đúng sự kiện trên URL.
      const { data: seat, error: seatError } = await supabase
        .from('seats')
        .select('id')
        .eq('id', seatId)
        .eq('event_id', eventId)
        .maybeSingle();

      if (seatError) {
        console.error('Admin find seat before delete:', seatError);
        return sendError(res, 500, 'Không thể kiểm tra ghế.');
      }

      if (!seat) {
        return sendError(
          res,
          404,
          'Không tìm thấy ghế thuộc sự kiện này.'
        );
      }

      const { data, error } = await supabase.rpc(
        'admin_delete_seat_safe',
        {
          p_seat_id: seatId,
        }
      );

      if (error) {
        console.error('Admin delete seat rejected:', error);

        return sendError(
          res,
          409,
          error.message || 'Không thể xóa ghế.'
        );
      }

      return res.json({ result: data });
    } catch (error) {
      console.error('Admin delete seat unexpected error:', error);
      return sendError(res, 500, 'Lỗi máy chủ khi xóa ghế.');
    }
  }
);




// admin tạo sự kiện

app.post('/api/admin/events', requireAdmin, async (req, res) => {
  try {
    const body = req.body ?? {};

    const {
      name,
      slug = null,
      short_description = null,
      description = null,
      category,
      tags = [],
      start_at = null,
      end_at = null,
      doors_open_at = null,
      venue_name = null,
      venue_address = null,
      organizer_name = null,
      organizer_description = null,
      organizer_url = null,
      guests = [],
      banner_url = null,
      thumbnail_url = null,
      ticket_price = 0,
      status = 'draft',
    } = body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        error: 'Tên sự kiện không được để trống.',
      });
    }

    if (typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({
        error: 'Danh mục sự kiện không được để trống.',
      });
    }

    if (!Array.isArray(tags) || !Array.isArray(guests)) {
      return res.status(400).json({
        error: 'tags và guests phải là mảng.',
      });
    }

    const price = Number(ticket_price);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        error: 'Giá vé phải là số không âm.',
      });
    }

    if (!['draft', 'published', 'cancelled'].includes(status)) {
      return res.status(400).json({
        error: 'Trạng thái sự kiện không hợp lệ.',
      });
    }

    const dateFields = {
      start_at,
      end_at,
      doors_open_at,
    };

    for (const [field, value] of Object.entries(dateFields)) {
      if (
        value !== null &&
        (
          typeof value !== 'string' ||
          !Number.isFinite(Date.parse(value))
        )
      ) {
        return res.status(400).json({
          error: `${field} không phải ngày giờ hợp lệ.`,
        });
      }
    }

    if (
      start_at &&
      end_at &&
      new Date(end_at) < new Date(start_at)
    ) {
      return res.status(400).json({
        error: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
      });
    }

    function cleanOptionalText(value, field) {
      if (value == null || value === '') return null;
      if (typeof value !== 'string') {
        throw new Error(`${field} phải là chuỗi.`);
      }
      return value.trim() || null;
    }

    function cleanImageUrl(value, field) {
      const text = cleanOptionalText(value, field);
      if (!text) return null;

      let url;
      try {
        url = new URL(text);
      } catch {
        throw new Error(`${field} không phải URL hợp lệ.`);
      }

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`${field} phải sử dụng HTTP hoặc HTTPS.`);
      }

      return url.toString();
    }

    let insertData;

    try {
      insertData = {
        name: name.trim(),
        slug: cleanOptionalText(slug, 'slug'),
        short_description: cleanOptionalText(
          short_description,
          'short_description'
        ),
        description: cleanOptionalText(description, 'description'),
        category: category.trim(),
        tags: tags.map((tag) => {
          if (typeof tag !== 'string') {
            throw new Error('Mỗi tag phải là chuỗi.');
          }
          return tag.trim();
        }).filter(Boolean),
        start_at,
        end_at,
        doors_open_at,
        venue_name: cleanOptionalText(venue_name, 'venue_name'),
        venue_address: cleanOptionalText(venue_address, 'venue_address'),
        organizer_name: cleanOptionalText(
          organizer_name,
          'organizer_name'
        ),
        organizer_description: cleanOptionalText(
          organizer_description,
          'organizer_description'
        ),
        organizer_url: cleanImageUrl(organizer_url, 'organizer_url'),
        guests,
        banner_url: cleanImageUrl(banner_url, 'banner_url'),
        thumbnail_url: cleanImageUrl(thumbnail_url, 'thumbnail_url'),
        ticket_price: price,
        status,
        published_at: status === 'published'
          ? new Date().toISOString()
          : null,
      };
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const { data, error } = await supabase
      .from('events')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Admin create event error:', error);
      return res.status(500).json({
        error: 'Không thể tạo sự kiện. Kiểm tra log backend.',
      });
    }

    return res.status(201).json({ event: data });
  } catch (error) {
    console.error('Admin create event error:', error);
    return res.status(500).json({
      error: 'Lỗi máy chủ khi tạo sự kiện.',
    });
  }
});

// Lấy 1 event cụ thể để sửa :))

app.patch('/api/admin/events/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body ?? {};

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'ID sự kiện không hợp lệ.',
      });
    }

    const allowedFields = [
      'name',
      'slug',
      'short_description',
      'description',
      'category',
      'tags',
      'start_at',
      'end_at',
      'doors_open_at',
      'venue_name',
      'venue_address',
      'organizer_name',
      'organizer_description',
      'organizer_url',
      'guests',
      'banner_url',
      'thumbnail_url',
      'ticket_price',
      'status',
    ];

    const suppliedFields = allowedFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(body, field)
    );

    if (suppliedFields.length === 0) {
      return res.status(400).json({
        error: 'Không có trường hợp lệ nào để cập nhật.',
      });
    }

    // Lấy dữ liệu hiện tại để kiểm tra ngày giờ và trạng thái.
    const {
      data: current,
      error: fetchError,
    } = await supabase
      .from('events')
      .select('id, status, published_at, start_at, end_at')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('Admin fetch event before update:', fetchError);
      return res.status(500).json({
        error: 'Không thể kiểm tra sự kiện hiện tại.',
      });
    }

    if (!current) {
      return res.status(404).json({
        error: 'Không tìm thấy sự kiện.',
      });
    }

    function cleanOptionalText(value, field) {
      if (value == null || value === '') return null;

      if (typeof value !== 'string') {
        throw new Error(`${field} phải là chuỗi.`);
      }

      return value.trim() || null;
    }

    function cleanHttpUrl(value, field) {
      const text = cleanOptionalText(value, field);
      if (text === null) return null;

      let url;

      try {
        url = new URL(text);
      } catch {
        throw new Error(`${field} không phải URL hợp lệ.`);
      }

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`${field} phải sử dụng HTTP hoặc HTTPS.`);
      }

      return url.toString();
    }

    function cleanDate(value, field) {
      if (value === null || value === '') return null;

      if (
        typeof value !== 'string' ||
        !Number.isFinite(Date.parse(value))
      ) {
        throw new Error(`${field} không phải ngày giờ hợp lệ.`);
      }

      return new Date(value).toISOString();
    }

    let updateData = {};

    try {
      for (const field of suppliedFields) {
        const value = body[field];

        switch (field) {
          case 'name':
            if (typeof value !== 'string' || !value.trim()) {
              throw new Error('Tên sự kiện không được để trống.');
            }
            updateData.name = value.trim();
            break;

          case 'category':
            if (typeof value !== 'string' || !value.trim()) {
              throw new Error('Danh mục không được để trống.');
            }
            updateData.category = value.trim();
            break;

          case 'tags':
            if (
              !Array.isArray(value) ||
              !value.every(
                (tag) =>
                  typeof tag === 'string' &&
                  tag.trim().length > 0
              )
            ) {
              throw new Error('tags phải là mảng các chuỗi không rỗng.');
            }

            updateData.tags = [...new Set(
              value.map((tag) => tag.trim())
            )];
            break;

          case 'guests':
            if (!Array.isArray(value)) {
              throw new Error('guests phải là một mảng JSON.');
            }
            updateData.guests = value;
            break;

          case 'ticket_price': {
            const price = Number(value);

            if (!Number.isFinite(price) || price < 0) {
              throw new Error('Giá vé phải là số không âm.');
            }

            updateData.ticket_price = price;
            break;
          }

          case 'status':
            if (!['draft', 'published', 'cancelled'].includes(value)) {
              throw new Error('Trạng thái sự kiện không hợp lệ.');
            }
            updateData.status = value;
            break;

          case 'start_at':
          case 'end_at':
          case 'doors_open_at':
            updateData[field] = cleanDate(value, field);
            break;

          case 'organizer_url':
          case 'banner_url':
          case 'thumbnail_url':
            updateData[field] = cleanHttpUrl(value, field);
            break;

          default:
            updateData[field] = cleanOptionalText(value, field);
        }
      }

      const effectiveStart = Object.prototype.hasOwnProperty.call(
        updateData, 'start_at'
      ) ? updateData.start_at : current.start_at;

      const effectiveEnd = Object.prototype.hasOwnProperty.call(
        updateData, 'end_at'
      ) ? updateData.end_at : current.end_at;

      if (
        effectiveStart &&
        effectiveEnd &&
        new Date(effectiveEnd) < new Date(effectiveStart)
      ) {
        throw new Error(
          'Thời gian kết thúc phải sau thời gian bắt đầu.'
        );
      }
    } catch (validationError) {
      return res.status(400).json({
        error: validationError.message,
      });
    }

    // Chỉ cập nhật published_at khi chuyển sang trạng thái published.
    // Nếu sự kiện đã published và chỉ sửa nội dung, giữ nguyên thời điểm cũ.
    if (
      updateData.status === 'published' &&
      current.status !== 'published'
    ) {
      updateData.published_at = new Date().toISOString();
    }

    // Cột updated_at được cập nhật rõ ràng để không phụ thuộc trigger.
    updateData.updated_at = new Date().toISOString();

    const {
      data: updatedEvent,
      error: updateError,
    } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Admin update event error:', updateError);
      return res.status(500).json({
        error: 'Không thể cập nhật sự kiện. Kiểm tra log backend.',
      });
    }

    return res.json({ event: updatedEvent });
  } catch (error) {
    console.error('Admin update event unexpected error:', error);

    return res.status(500).json({
      error: 'Lỗi máy chủ khi cập nhật sự kiện.',
    });
  }
});




// app lấy danh sách sự kiện
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
