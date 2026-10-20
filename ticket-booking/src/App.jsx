
import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

import {
  getEvents,
  getEventSeats,
  holdSeats,
  cancelHold,
  confirmBooking,
  getBooking,
  cancelBooking,
} from './api';


const money = (value) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const dateText = (value) => {
  if (!value) return 'Thời gian sẽ được cập nhật';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Thời gian sẽ được cập nhật';
  }

  return date.toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const categories = [
  'Tất cả',
  'Âm nhạc',
  'Nghệ thuật',
  'Học thuật',
  'Workshop',
  'Công nghệ',
  'Cộng đồng',
  'Thể thao',
  'Hướng nghiệp',
  'Khác',
];

const categoryMap = {
  music: 'Âm nhạc',
  academic: 'Học thuật',
  workshop: 'Workshop',
  art: 'Nghệ thuật',
  technology: 'Công nghệ',
  community: 'Cộng đồng',
  sports: 'Thể thao',
  career: 'Hướng nghiệp',
  other: 'Khác',
};

const translations = {
  vi: {
    search: 'Tìm sự kiện, địa điểm, chủ đề...',
    lookup: 'Tra cứu vé',
    all: 'Tất cả danh mục',
    explore: 'Khám phá sự kiện',
    categories: 'Tìm điều bạn yêu thích',
    events: 'Sự kiện dành cho bạn',
    loading: 'Đang tìm sự kiện phù hợp…',
    details: 'Thông tin sự kiện',
    date: 'THỜI GIAN',
    venue: 'ĐỊA ĐIỂM',
    organizer: 'BAN TỔ CHỨC',
    guests: 'NGHỆ SĨ / KHÁCH MỜI',
    buy: 'Chọn ghế',
    back: 'Quay lại sự kiện',
    about: 'Giới thiệu',
    free: 'Miễn phí',
    empty: 'Chưa tìm thấy sự kiện',
    demo: 'SỰ KIỆN NỔI BẬT',
  },
  en: {
    search: 'Search events, venues, topics...',
    lookup: 'My tickets',
    all: 'All categories',
    explore: 'Explore events',
    categories: 'Find what you love',
    events: 'Events for you',
    loading: 'Finding events for you…',
    details: 'Event details',
    date: 'DATE & TIME',
    venue: 'VENUE',
    organizer: 'ORGANIZER',
    guests: 'ARTISTS & GUESTS',
    buy: 'Choose seats',
    back: 'Back to events',
    about: 'About this event',
    free: 'Free',
    empty: 'No events found',
    demo: 'FEATURED EVENT',
  },
};

/**
 * Chuẩn hóa tên trường từ API để giao diện sử dụng thống nhất.
 * Không thay đổi dữ liệu trong Supabase.
 */
function normalizeEvent(item) {
  return {
    ...item,
    summary: item.short_description || item.description || '',
    venue: item.venue_name || item.venue || '',
    location: item.venue_address || item.location || '',
    organizer: item.organizer_name || item.organizer || '',
    organizerDescription: item.organizer_description || '',
    organizerUrl: item.organizer_url || '',
    image: item.banner_url || item.thumbnail_url || '',
    thumbnail: item.thumbnail_url || item.banner_url || '',
    guests: Array.isArray(item.guests) ? item.guests : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
  };
}

function inferCategory(item) {
  const explicit = String(item.category || '').toLowerCase();

  if (categoryMap[explicit]) {
    return categoryMap[explicit];
  }

  const text = [
    item.name,
    item.description,
    item.short_description,
    item.organizer_name,
    item.organizer,
    item.organizer_description,
    ...item.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('vi');

  const has = (...words) => words.some((word) => text.includes(word));

  if (
    has(
      'âm nhạc',
      'music',
      'concert',
      'hòa nhạc',
      'band',
      'acoustic',
      'dance'
    )
  ) {
    return 'Âm nhạc';
  }

  if (
    has('nghệ thuật', 'art', 'triển lãm', 'văn hóa', 'kịch', 'nhiếp ảnh')
  ) {
    return 'Nghệ thuật';
  }

  if (has('workshop')) return 'Workshop';

  if (
    has(
      'học thuật',
      'học tập',
      'ôn tập',
      'thi giữa kỳ',
      'giải tích',
      'seminar'
    )
  ) {
    return 'Học thuật';
  }

  if (
    has(
      'công nghệ',
      'technology',
      'developer',
      'coding',
      'hackathon',
      'lập trình',
      'gdg'
    )
  ) {
    return 'Công nghệ';
  }

  if (has('thể thao', 'sport', 'bóng đá', 'chạy bộ', 'cầu lông')) {
    return 'Thể thao';
  }

  if (has('hướng nghiệp', 'career', 'tuyển dụng')) {
    return 'Hướng nghiệp';
  }

  return 'Cộng đồng';
}

function EventImage({ src, alt, className, loading = 'lazy' }) {
  if (!src) return null;

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

export default function App() {
  const [page, setPage] = useState('events');
  const [events, setEvents] = useState([]);
  const [event, setEvent] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);

  const [seats, setSeats] = useState([]);
  const [selected, setSelected] = useState([]);
  const [hold, setHold] = useState(null);
  const [expires, setExpires] = useState(null);

  const [email, setEmail] = useState('');
  const [emailForBooking, setEmailForBooking] = useState('');
  const [booking, setBooking] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [categoryOpen, setCategoryOpen] = useState(false);

  const [lookupCode, setLookupCode] = useState('');
  const [lookup, setLookup] = useState(null);
  const [cancelCode, setCancelCode] = useState('');
  const [cancelToken, setCancelToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const [language, setLanguage] = useState('vi');
  const [heroIndex, setHeroIndex] = useState(0);

  const isEn = language === 'en';
  const ui = translations[language];

  const price = Number(event?.ticket_price || 0);
  const total = price * selected.length;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');

    return events.filter((item) => {
      const eventCategory = inferCategory(item);

      const haystack = [
        item.name,
        item.description,
        item.short_description,
        item.venue,
        item.location,
        item.organizer,
        item.organizerDescription,
        eventCategory,
        ...item.tags,
        dateText(item.start_at),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi');

      return (
        (!query || haystack.includes(query)) &&
        (category === 'Tất cả' || eventCategory === category)
      );
    });
  }, [events, search, category]);

  const displayEvents = filtered;
  const heroEvents = displayEvents.slice(0, 5);

  const refreshSeats = useCallback(async (id) => {
    const result = await getEventSeats(id);
    setSeats(result.seats || []);
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await getEvents();
      setEvents((result.data || []).map(normalizeEvent));
    } catch (e) {
      setError(
        e.message ||
          'Không tải được danh sách sự kiện. Hãy kiểm tra kết nối backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setHeroIndex((current) =>
      heroEvents.length
        ? current % heroEvents.length
        : 0
    );
  }, [heroEvents.length]);

  useEffect(() => {
    if (page !== 'events' || heroEvents.length < 2) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setHeroIndex(
        (current) => (current + 1) % heroEvents.length
      );
    }, 6500);

    return () => window.clearInterval(timer);
  }, [page, heroEvents.length]);

  function openEvent(item) {
    setDetailEvent(item);
    setEvent(item);
    setSelected([]);
    setHold(null);
    setExpires(null);
    setBooking(null);
    setSeats([]);
    setError('');
    setNotice('');
    setEmailForBooking('');
    setEmail('');
    setPage('detail');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goEvents() {
    setPage('events');
    setEvent(null);
    setDetailEvent(null);
    setSeats([]);
    setSelected([]);
    setHold(null);
    setExpires(null);
    setBooking(null);
    setError('');
    setNotice('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function startBooking() {
    if (!event) return;

    const normalizedEmail = emailForBooking.trim();

    if (
      normalizedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      setError(
        isEn
          ? 'Please enter a valid email address.'
          : 'Vui lòng nhập email hợp lệ.'
      );
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      await refreshSeats(event.id);
      setEmail(normalizedEmail);
      setPage('seats');

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message || 'Không tải được sơ đồ ghế.');
    } finally {
      setLoading(false);
    }
  }

  function chooseSeat(seat) {
    if (hold || seat.status !== 'available') return;

    setError('');

    setSelected((current) => {
      if (current.includes(seat.label)) {
        return current.filter((label) => label !== seat.label);
      }

      if (current.length >= 10) {
        setError('Mỗi lượt chỉ được chọn tối đa 10 ghế.');
        return current;
      }

      return [...current, seat.label];
    });
  }

  async function reserve() {
    if (!event || !selected.length) {
      setError('Hãy chọn ít nhất một ghế.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const result = await holdSeats(event.id, selected);

      setHold(result.hold_token);
      setExpires(result.expires_at);
      setNotice('Giữ ghế thành công. Hãy xác nhận trước khi hết hạn.');

      await refreshSeats(event.id);
    } catch (e) {
      setError(e.message || 'Không thể giữ ghế.');

      try {
        await refreshSeats(event.id);
      } catch {
        // Giữ nguyên lỗi đặt ghế ban đầu.
      }
    } finally {
      setLoading(false);
    }
  }

  async function releaseHold() {
    if (!hold) return;

    setLoading(true);
    setError('');
    setNotice('');

    try {
      await cancelHold(hold);

      setHold(null);
      setExpires(null);
      setSelected([]);
      setNotice('Đã hủy giữ ghế.');

      await refreshSeats(event.id);
    } catch (e) {
      setError(e.message || 'Không thể hủy giữ ghế.');
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!hold) {
      setError('Không tìm thấy mã giữ ghế. Hãy thử chọn ghế lại.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const result = await confirmBooking(hold, email.trim() || null);

      setBooking(result.booking);
      setHold(null);
      setExpires(null);
      setSelected([]);
      setEmail('');
      setCopied(false);
      setPage('result');

      try {
        await refreshSeats(event.id);
      } catch {
        // Booking đã được xác nhận; không ghi đè kết quả thành công.
      }
    } catch (e) {
      setError(e.message || 'Không thể xác nhận đặt vé.');
    } finally {
      setLoading(false);
    }
  }

  async function lookupBooking(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    setLookup(null);

    try {
      const result = await getBooking(lookupCode.trim());
      setLookup(result.booking);
    } catch (err) {
      setError(err.message || 'Không tìm thấy thông tin vé.');
    } finally {
      setLoading(false);
    }
  }

  async function cancelBookingAction(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const result = await cancelBooking(
        cancelCode.trim(),
        cancelToken.trim()
      );

      setNotice(
        `Đã hủy vé ${
          result.result?.booking_code || cancelCode
        }.`
      );

      setCancelCode('');
      setCancelToken('');
      setLookup(null);
    } catch (err) {
      setError(err.message || 'Không thể hủy vé.');
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!booking?.cancel_token) return;

    try {
      await navigator.clipboard.writeText(booking.cancel_token);
      setCopied(true);
      setNotice('Đã sao chép mã hủy. Hãy lưu ở nơi an toàn.');
    } catch {
      setError('Không thể sao chép tự động. Hãy sao chép mã hủy thủ công.');
    }
  }

  function changeCategory(value) {
    setCategory(value);
    setCategoryOpen(false);
    setPage('events');
  }

  function renderGuest(guest, index) {
    if (typeof guest === 'string') {
      return (
        <article className="guest-item" key={`${guest}-${index}`}>
          <h3>{guest}</h3>
        </article>
      );
    }

    return (
      <article
        className="guest-item"
        key={`${guest.name || 'guest'}-${index}`}
      >
        <h3>{guest.name || 'Khách mời'}</h3>
        {guest.role && <p className="muted">{guest.role}</p>}
        {guest.description && <p>{guest.description}</p>}
      </article>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="logo" onClick={goEvents}>
          nhịp<span>.</span>
        </button>

        <div className="topbar-category">
          <button
            type="button"
            className="category-trigger"
            aria-expanded={categoryOpen}
            onClick={() => setCategoryOpen((value) => !value)}
          >
            {ui.all} <span aria-hidden="true">⌄</span>
          </button>

          {categoryOpen && (
            <div className="category-menu">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={category === item ? 'active' : ''}
                  onClick={() => changeCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="searchbar">
          <b aria-hidden="true">⌕</b>
          <input
            aria-label={ui.search}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage('events');
            }}
            placeholder={ui.search}
          />

          {search && (
            <button
              type="button"
              className="clear-search"
              aria-label="Xóa tìm kiếm"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </label>

        <button
          className="nav-button"
          onClick={() => {
            setPage('lookup');
            setError('');
            setNotice('');
          }}
        >
          ▣ {ui.lookup}
        </button>

        <button
          type="button"
          className="lang"
          onClick={() => setLanguage((value) => value === 'vi' ? 'en' : 'vi')}
          aria-label="Change language"
        >
          {language === 'vi' ? 'VN' : 'EN'}⌄
        </button>
      </header>

      <main className="main">
        {(error || notice) && (
          <div
            className={`message ${error ? 'error' : 'success'}`}
            role={error ? 'alert' : 'status'}
          >
            {error || notice}
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={() => {
                setError('');
                setNotice('');
              }}
            >
              ×
            </button>
          </div>
        )}

        {loading && page === 'events' && (
          <div
            className="loading-panel"
            role="status"
            aria-live="polite"
          >
            <span className="spinner" />
            <div>
              <strong>{ui.loading}</strong>
              <p>nhịp. · {isEn ? 'A moment, please' : 'Chờ một chút nhé'}</p>
            </div>
          </div>
        )}

        {loading && page !== 'events' && (
          <p className="loading">
            ● {isEn ? 'Processing…' : 'Đang xử lý...'}
          </p>
        )}

        {/* TRANG DANH SÁCH SỰ KIỆN */}
        {page === 'events' && (
          <>
            <section className="hero hero-slider" aria-label="Sự kiện nổi bật">
              {heroEvents.length > 0 ? (
                heroEvents.map((item, index) => (
                  <div
                    className={`hero-slide ${
                      index === heroIndex ? 'is-active' : ''
                    } hero-slide-${index % 4}`}
                    key={item.id}
                    aria-hidden={index !== heroIndex}
                  >
                    <EventImage
                      className="hero-poster"
                      src={item.image}
                      alt={`Poster ${item.name}`}
                      loading="eager"
                    />

                    <div className="hero-content">
                      <span className="hero-kicker">
                        <i /> {ui.demo}
                      </span>

                      <p className="eyebrow">
                        {isEn
                          ? 'MOMENTS WORTH REMEMBERING'
                          : 'NHỮNG KHOẢNH KHẮC ĐÁNG NHỚ'}
                      </p>

                      <h1>{item.name}</h1>

                      <p>
                        {item.summary ||
                          (isEn
                            ? 'Discover your next campus moment.'
                            : 'Khám phá sự kiện tiếp theo của bạn.')}
                      </p>

                      <p className="hero-date">
                        ⌁ {dateText(item.start_at)}
                      </p>

                      <button
                        className="pink-button"
                        onClick={() => openEvent(item)}
                      >
                        {ui.explore} <span aria-hidden="true">↗</span>
                      </button>
                    </div>

                    <div className="hero-orbit orbit-one" />
                    <div className="hero-orbit orbit-two" />

                    <div className="hero-sticker">
                      <span>MAKE</span>
                      <strong>MEMORIES</strong>
                      <span>TOGETHER ✳</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="hero-slide is-active">
                  <div className="hero-content">
                    <span className="hero-kicker">
                      <i /> NHỊP SỐNG SINH VIÊN
                    </span>
                    <p className="eyebrow">
                      NHỮNG KHOẢNH KHẮC ĐÁNG NHỚ
                    </p>
                    <h1>
                      {isEn
                        ? 'Find your next moment.'
                        : 'Có hẹn với những điều đáng nhớ.'}
                    </h1>
                    <p>
                      {isEn
                        ? 'Discover music, art, workshops and campus events.'
                        : 'Từ đêm nhạc, triển lãm đến workshop và những buổi học cùng nhau.'}
                    </p>
                  </div>
                </div>
              )}

              {heroEvents.length > 1 && (
                <div className="hero-controls">
                  <button
                    type="button"
                    aria-label="Sự kiện trước"
                    onClick={() =>
                      setHeroIndex(
                        (index) =>
                          (index - 1 + heroEvents.length) % heroEvents.length
                      )
                    }
                  >
                    ←
                  </button>

                  <div className="hero-dots">
                    {heroEvents.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        className={index === heroIndex ? 'active' : ''}
                        aria-label={`Chuyển đến sự kiện ${index + 1}`}
                        onClick={() => setHeroIndex(index)}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    aria-label="Sự kiện tiếp theo"
                    onClick={() =>
                      setHeroIndex(
                        (index) => (index + 1) % heroEvents.length
                      )
                    }
                  >
                    →
                  </button>
                </div>
              )}
            </section>

            <section className="events-section" id="event-list">
              <div className="section-title">
                <div>
                  <p className="eyebrow">{ui.categories}</p>
                  <h2>
                    {ui.events}
                    <span className="title-dot">.</span>
                  </h2>
                </div>
                <span>{displayEvents.length} sự kiện</span>
              </div>

              <div className="categories" aria-label="Lọc theo danh mục">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={category === item ? 'active' : ''}
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {!loading && !displayEvents.length && (
                <div className="empty-state">
                  <span className="empty-icon">✳</span>
                  <h3>
                    {search
                      ? 'Chưa tìm thấy kết quả'
                      : ui.empty}
                  </h3>
                  <p>
                    {search
                      ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem thêm sự kiện.'
                      : 'Chưa có sự kiện phù hợp. Hãy thử danh mục khác.'}
                  </p>

                  {(search || category !== 'Tất cả') && (
                    <button
                      className="outline-button"
                      onClick={() => {
                        setSearch('');
                        setCategory('Tất cả');
                      }}
                    >
                      Xóa bộ lọc
                    </button>
                  )}

                  {!error && events.length === 0 && (
                    <button
                      className="outline-button"
                      onClick={loadEvents}
                    >
                      Tải lại sự kiện
                    </button>
                  )}
                </div>
              )}

              <div className="event-grid">
                {displayEvents.map((item, index) => (
                  <article className="event-card" key={item.id}>
                    <button
                      type="button"
                      className={`event-art art-${index % 4}`}
                      onClick={() => openEvent(item)}
                      aria-label={`Xem chi tiết: ${item.name}`}
                    >
                      <EventImage
                        className="event-poster"
                        src={item.thumbnail}
                        alt={`Poster ${item.name}`}
                      />

                      <span className="art-index">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <span className="badge">Đang mở đăng ký</span>

                      <span className="art-caption">
                        {inferCategory(item)}
                      </span>

                      <span className="art-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </button>

                    <div className="event-info">
                      <span className="event-meta">
                        {dateText(item.start_at)}
                      </span>

                      <h3>{item.name}</h3>

                      <p>
                        {item.summary ||
                          'Thông tin chi tiết sẽ sớm được cập nhật.'}
                      </p>

                      <div
                        className="event-venue"
                        title={[item.venue, item.location].filter(Boolean).join(' · ')}
                      >
                        <span aria-hidden="true">⌖</span>{' '}
                        {[item.venue, item.location]
                          .filter(Boolean)
                          .filter((value, index, values) => values.indexOf(value) === index)
                          .join(' · ') || 'Địa điểm sẽ được cập nhật'}
                      </div>

                      <div className="event-footer">
                        <strong>
                          {Number(item.ticket_price || 0) === 0
                            ? 'Miễn phí'
                            : money(item.ticket_price)}
                        </strong>

                        <button
                          type="button"
                          onClick={() => openEvent(item)}
                          aria-label={`Xem sự kiện ${item.name}`}
                        >
                          ↗
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {/* TRANG CHI TIẾT SỰ KIỆN */}
        {page === 'detail' && detailEvent && (
          <section className="content-page detail-page">
            <button className="back" onClick={goEvents}>
              ← {ui.back}
            </button>

            <div
              className={`detail-cover art-${
                Math.max(
                  0,
                  displayEvents.findIndex(
                    (item) => item.id === detailEvent.id
                  )
                ) % 4
              }`}
            >
              <EventImage
                className="detail-poster"
                src={detailEvent.image}
                alt={`Poster ${detailEvent.name}`}
                loading="eager"
              />

              <span className="badge">
                {inferCategory(detailEvent)}
              </span>

              <span className="detail-cover-mark">
                nhịp<span>.</span>
              </span>
            </div>

            <div className="detail-layout">
              <article className="detail-copy">
                <div className="detail-tags">
                  <span>{inferCategory(detailEvent)}</span>
                  <span>Đang mở đăng ký</span>
                </div>

                <h1>{detailEvent.name}</h1>

                <h2>{ui.about}</h2>

                {detailEvent.summary &&
                  detailEvent.summary !== detailEvent.description && (
                    <p className="detail-summary">
                      {detailEvent.summary}
                    </p>
                  )}

                <div className="detail-description">
                  {(detailEvent.description || detailEvent.summary ||
                    'Thông tin chi tiết sẽ sớm được cập nhật.')
                    .split(/\n\s*\n/)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>

                {detailEvent.tags.length > 0 && (
                  <div className="detail-tags">
                    {detailEvent.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}

                <h2>{ui.guests}</h2>

                {detailEvent.guests.length > 0 ? (
                  <div className="guest-list">
                    {detailEvent.guests.map(renderGuest)}
                  </div>
                ) : (
                  <p>
                    {isEn
                      ? 'Guest information will be announced by the organizer.'
                      : 'Thông tin nghệ sĩ/khách mời sẽ được ban tổ chức cập nhật.'}
                  </p>
                )}

                <h2>{ui.organizer}</h2>

                <p>
                  {detailEvent.organizer ||
                    'Ban tổ chức sự kiện'}
                </p>

                {detailEvent.organizerDescription && (
                  <p>{detailEvent.organizerDescription}</p>
                )}

                {detailEvent.organizerUrl && (
                  <p>
                    <a
                      href={detailEvent.organizerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Website ban tổ chức ↗
                    </a>
                  </p>
                )}
              </article>

              <aside className="detail-ticket">
                <div className="detail-fact">
                  <span>▦</span>
                  <div>
                    <small>{ui.date}</small>
                    <strong>{dateText(detailEvent.start_at)}</strong>
                    {detailEvent.end_at && (
                      <span className="detail-fact-secondary">
                        Kết thúc: {dateText(detailEvent.end_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="detail-fact">
                  <span>⌖</span>
                  <div>
                    <small>{ui.venue}</small>
                    <strong>
                      {detailEvent.venue ||
                        'Địa điểm sẽ được cập nhật'}
                    </strong>
                    {detailEvent.location && (
                      <p>{detailEvent.location}</p>
                    )}
                  </div>
                </div>

                <div className="detail-fact">
                  <span>♙</span>
                  <div>
                    <small>{ui.organizer}</small>
                    <strong>
                      {detailEvent.organizer ||
                        'Ban tổ chức sự kiện'}
                    </strong>
                  </div>
                </div>

                {detailEvent.doors_open_at && (
                  <div className="detail-fact">
                    <span>◷</span>
                    <div>
                      <small>GIỜ MỞ CỬA</small>
                      <strong>
                        {dateText(detailEvent.doors_open_at)}
                      </strong>
                    </div>
                  </div>
                )}

                <div className="ticket-price-line">
                  <span>
                    {isEn ? 'Ticket price from' : 'Giá vé từ'}
                  </span>
                  <strong>
                    {Number(detailEvent.ticket_price || 0) === 0
                      ? ui.free
                      : money(detailEvent.ticket_price)}
                  </strong>
                </div>

                <label className="detail-email">
                  {ui.email || 'Địa chỉ email'}
                  <input
                    type="email"
                    value={emailForBooking}
                    maxLength={254}
                    onChange={(e) => setEmailForBooking(e.target.value)}
                    placeholder="ban@example.com"
                  />
                </label>

                <button
                  className="pink-button full"
                  disabled={loading}
                  onClick={startBooking}
                >
                  {ui.buy} →
                </button>

                <p className="detail-note">
                  {isEn
                    ? 'No payment is processed in this demo.'
                    : 'Bản demo không xử lý thanh toán thật.'}
                </p>
              </aside>
            </div>
          </section>
        )}

        {/* TRANG CHỌN GHẾ */}
        {page === 'seats' && event && (
          <section className="content-page">
            <button className="back" onClick={goEvents}>
              ← Quay lại sự kiện
            </button>

            <div className="page-heading">
              <div>
                <p className="eyebrow">ĐẶT CHỖ CỦA BẠN</p>
                <h1>Chọn chỗ ngồi</h1>
                <p className="muted">{event.name}</p>
              </div>

              <strong className="price-tag">
                {money(price)} <small>/ ghế</small>
              </strong>
            </div>

            <div className="seat-layout">
              <div className="seat-map">
                <div className="legend">
                  <span><i className="available" /> Còn trống</span>
                  <span><i className="selected" /> Đang chọn</span>
                  <span><i className="held" /> Đang giữ</span>
                  <span><i className="booked" /> Đã bán</span>
                </div>

                <div className="stage">S Â N&nbsp; K H Ấ U</div>

                <div className="seat-grid">
                  {seats.map((seat) => {
                    const status = selected.includes(seat.label)
                      ? 'selected'
                      : seat.status;

                    return (
                      <button
                        key={seat.id}
                        className={`seat ${status}`}
                        disabled={
                          loading ||
                          Boolean(hold) ||
                          seat.status !== 'available'
                        }
                        onClick={() => chooseSeat(seat)}
                        aria-label={`Ghế ${seat.label}: ${seat.status}`}
                      >
                        {seat.label}
                      </button>
                    );
                  })}
                </div>

                {!loading && seats.length === 0 && (
                  <p className="muted center">
                    Chưa có ghế cho sự kiện này hoặc không tải được sơ đồ ghế.
                  </p>
                )}

                <p className="muted small center">
                  Mỗi lượt đặt được chọn tối đa 10 ghế.
                </p>
              </div>

              <aside className="summary">
                <p className="eyebrow">TÓM TẮT ĐẶT VÉ</p>

                <h2>
                  {selected.length
                    ? `${selected.length} ghế đã chọn`
                    : 'Chọn ghế trên sơ đồ'}
                </h2>

                <p className="muted">
                  {selected.length
                    ? selected.join(' · ')
                    : 'Chọn chỗ trên sơ đồ để tiếp tục.'}
                </p>

                <div className="summary-line">
                  <span>Giá vé</span>
                  <span>{money(price)}</span>
                </div>

                <div className="summary-line">
                  <span>Số lượng</span>
                  <span>{selected.length}</span>
                </div>

                <div className="summary-total">
                  <span>Tổng cộng</span>
                  <strong>{money(total)}</strong>
                </div>

                {!hold ? (
                  <button
                    className="pink-button full"
                    disabled={loading || !selected.length}
                    onClick={reserve}
                  >
                    Giữ chỗ →
                  </button>
                ) : (
                  <div className="hold-form">
                    <p className="hold-notice">
                      ▣ Đã giữ ghế
                      <br />
                      <small>
                        Hạn giữ: {dateText(expires)}
                      </small>
                    </p>

                    <label>
                      Email <small>(không bắt buộc)</small>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ban@example.com"
                        maxLength={254}
                      />
                    </label>

                    <button
                      className="pink-button full"
                      disabled={loading}
                      onClick={confirm}
                    >
                      Xác nhận đặt vé
                    </button>

                    <button
                      className="outline-button full"
                      disabled={loading}
                      onClick={releaseHold}
                    >
                      Hủy giữ chỗ
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {/* TRANG KẾT QUẢ ĐẶT VÉ */}
        {page === 'result' && booking && (
          <section className="content-page result-page">
            <button className="back" onClick={goEvents}>
              ← Quay lại sự kiện
            </button>

            <div className="result-heading">
              <div className="checkmark">✓</div>
              <p className="eyebrow">XÁC NHẬN THÀNH CÔNG</p>
              <h1>Vé của bạn đã sẵn sàng</h1>
              <p className="muted">
                Lưu lại thông tin này để tra cứu hoặc hủy vé khi cần.
              </p>
            </div>

            <article className="receipt">
              <div className="receipt-head">
                <div>
                  <small>MÃ ĐẶT VÉ</small>
                  <strong>{booking.booking_code}</strong>
                </div>

                <span className="badge">
                  {booking.status === 'confirmed'
                    ? 'Đã xác nhận'
                    : booking.status}
                </span>
              </div>

              <div className="secret">
                <p>⚿ &nbsp;Mã hủy bí mật</p>
                <strong>
                  {booking.cancel_token ||
                    'Không có mã hủy trả về'}
                </strong>
                <span>
                  Giữ bí mật mã này. Bạn cần nó để hủy vé.
                </span>

                <button
                  className="outline-button"
                  disabled={!booking.cancel_token}
                  onClick={copyToken}
                >
                  {copied ? 'Đã sao chép ✓' : 'Sao chép mã hủy'}
                </button>
              </div>

              <div className="receipt-details">
                <div>
                  <small>EMAIL</small>
                  <strong>
                    {booking.guest_email || 'Không cung cấp'}
                  </strong>
                </div>

                <div>
                  <small>XÁC NHẬN LÚC</small>
                  <strong>
                    {dateText(
                      booking.confirmed_at || booking.created_at
                    )}
                  </strong>
                </div>
              </div>

              {booking.seats?.map((seat) => (
                <div className="receipt-line" key={seat.label}>
                  <span>{seat.label}</span>
                  <span>{money(seat.price)}</span>
                </div>
              ))}

              <div className="receipt-total">
                <span>Tổng cộng</span>
                <strong>{money(booking.total_amount)}</strong>
              </div>

              <p className="receipt-note">
                Hãy lưu lại mã đặt vé và mã hủy bí mật.
                Không chia sẻ mã hủy cho người khác.
              </p>
            </article>

            <div className="result-actions">
              <button
                className="pink-button"
                onClick={() => setPage('lookup')}
              >
                Tra cứu / hủy vé
              </button>

              <button className="outline-button" onClick={goEvents}>
                Quay lại sự kiện
              </button>
            </div>
          </section>
        )}

        {/* TRANG TRA CỨU VÀ HỦY VÉ */}
        {page === 'lookup' && (
          <section className="content-page lookup-page">
            <div className="page-heading">
              <div>
                <p className="eyebrow">QUẢN LÝ ĐẶT VÉ</p>
                <h1>Tra cứu vé</h1>
                <p className="muted">
                  Dùng mã đặt vé để xem thông tin hoặc hủy vé.
                </p>
              </div>
            </div>

            <div className="lookup-grid">
              <article className="form-card">
                <h2>⌕ Tra cứu đặt vé</h2>
                <p className="muted">
                  Nhập mã đặt vé bạn đã nhận sau khi xác nhận.
                </p>

                <form onSubmit={lookupBooking}>
                  <label>
                    Mã đặt vé
                    <input
                      value={lookupCode}
                      onChange={(e) =>
                        setLookupCode(e.target.value.toUpperCase())
                      }
                      minLength={6}
                      maxLength={16}
                      placeholder="VD: A1B2C3D4"
                      required
                    />
                  </label>

                  <button
                    className="pink-button full"
                    disabled={loading}
                  >
                    Tra cứu vé →
                  </button>
                </form>

                {lookup && (
                  <div className="lookup-result">
                    <small>MÃ ĐẶT VÉ</small>
                    <h3>{lookup.booking_code}</h3>
                    <p>
                      Trạng thái: <strong>{lookup.status}</strong>
                    </p>
                    <p>
                      Tổng tiền:{' '}
                      <strong>{money(lookup.total_amount)}</strong>
                    </p>

                    {lookup.seats?.map((seat) => (
                      <div
                        className="receipt-line"
                        key={seat.label}
                      >
                        <span>
                          {seat.label} · {seat.status}
                        </span>
                        <span>{money(seat.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="form-card">
                <h2>⚿ Hủy vé</h2>
                <p className="muted">
                  Bạn cần cả mã đặt vé và mã hủy bí mật.
                </p>

                <form onSubmit={cancelBookingAction}>
                  <label>
                    Mã đặt vé
                    <input
                      value={cancelCode}
                      onChange={(e) =>
                        setCancelCode(e.target.value.toUpperCase())
                      }
                      minLength={6}
                      maxLength={16}
                      required
                      placeholder="Mã đặt vé"
                    />
                  </label>

                  <label>
                    Mã hủy bí mật
                    <input
                      value={cancelToken}
                      onChange={(e) => setCancelToken(e.target.value)}
                      required
                      placeholder="Nhập mã hủy bí mật"
                    />
                  </label>

                  <button
                    className="pink-button full"
                    disabled={loading}
                  >
                    Hủy vé
                  </button>
                </form>
              </article>
            </div>

            <button
              className="back bottom-back"
              onClick={goEvents}
            >
              ← Quay lại sự kiện
            </button>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="footer-main">
          <div>
            <button className="logo" onClick={goEvents}>
              nhịp<span>.</span>
            </button>
            <p>Vé cho những khoảnh khắc đáng nhớ của giảng đường.</p>
          </div>

          <div>
            <button
              onClick={() => {
                setPage('lookup');
                setError('');
                setNotice('');
              }}
            >
              Tra cứu vé
            </button>

            <button
              onClick={() => {
                setPage('lookup');
                setError('');
                setNotice('');
              }}
            >
              Hủy vé
            </button>
          </div>
        </div>

        <div className="footer-bottom">
          nhịp™ được xây dựng duy nhất cho mục đích đánh giá trong vòng Probation của GDG-HUST và không phải là một dịch vụ thương mại. Mọi sự kiện, sản phẩm, tổ chức, cá nhân, hình ảnh, giá vé và nội dung xuất hiện trên trang chỉ mang tính minh họa cho sản phẩm. Chúng tôi không phát ngôn thay, không đại diện cho, không bán vé, không thu tiền và không tổ chức bất kỳ sự kiện nào được nhắc đến. Mọi giao dịch, mã đặt vé, mã hủy vé và khoản hoàn tiền đều là giả lập, không có giá trị thực tế. Việc nhắc đến bất kỳ tổ chức, cá nhân hay nhãn hiệu nào không có nghĩa là họ bảo trợ, xác nhận hay có liên kết với sản phẩm này; mọi nhãn hiệu thuộc về chủ sở hữu tương ứng.

          Hình ảnh và video được sử dụng theo giấy phép CC0/phạm vi công cộng.
          <p>© 2026 nhịp™</p>
        </div>
      </footer>
    </div>
  );
}

