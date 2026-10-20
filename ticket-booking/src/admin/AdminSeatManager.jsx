
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAdminEvents,
  getAdminEventSeats,
  generateAdminSeatGrid,
  deleteAdminSeat,
} from '../adminApi';

function getSeatStatus(seat, holds, bookingItems) {
  const seatBookings = bookingItems.filter(
    (item) => String(item.seat_id) === String(seat.id)
  );

  // Có lịch sử đặt vé chưa bị hủy: ưu tiên hiển thị đã đặt.
  const hasBooking = seatBookings.some(
    (item) =>
      !item.cancelled_at &&
      !['cancelled', 'canceled'].includes(
        String(item.status || '').toLowerCase()
      )
  );

  if (hasBooking) {
    return { key: 'booked', label: 'Đã đặt' };
  }

  const now = Date.now();

  const hasActiveHold = holds.some(
    (hold) =>
      String(hold.seat_id) === String(seat.id) &&
      hold.status === 'held' &&
      new Date(hold.expires_at).getTime() > now
  );

  if (hasActiveHold) {
    return { key: 'held', label: 'Đang giữ' };
  }

  return { key: 'available', label: 'Còn trống' };
}

export default function AdminSeatManager() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [seatData, setSeatData] = useState(null);

  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(8);

  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deletingSeatId, setDeletingSeatId] = useState(null);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setError('');

    try {
      const result = await getAdminEvents();
      const list = result.events || [];

      setEvents(list);

      setEventId((current) => {
        if (current && list.some((event) => String(event.id) === current)) {
          return current;
        }

        return list.length ? String(list[0].id) : '';
      });
    } catch (err) {
      setError(err.message || 'Không tải được danh sách sự kiện.');
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const loadSeats = useCallback(async (id) => {
    if (!id) {
      setSeatData(null);
      return;
    }

    setLoadingSeats(true);
    setError('');

    try {
      const result = await getAdminEventSeats(id);
      setSeatData(result);
    } catch (err) {
      setSeatData(null);
      setError(err.message || 'Không tải được sơ đồ ghế.');
    } finally {
      setLoadingSeats(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setMessage('');
    loadSeats(eventId);
  }, [eventId, loadSeats]);

  const seats = seatData?.seats || [];
  const holds = seatData?.holds || [];
  const bookingItems = seatData?.bookingItems || [];

  const seatStatuses = useMemo(() => {
    return seats.map((seat) => ({
      seat,
      ...getSeatStatus(seat, holds, bookingItems),
    }));
  }, [seats, holds, bookingItems]);

  const counts = useMemo(() => ({
    total: seats.length,
    available: seatStatuses.filter((item) => item.key === 'available').length,
    held: seatStatuses.filter((item) => item.key === 'held').length,
    booked: seatStatuses.filter((item) => item.key === 'booked').length,
  }), [seats.length, seatStatuses]);

  async function handleGenerate(event) {
    event.preventDefault();

    if (!eventId) {
      setError('Hãy chọn một sự kiện.');
      return;
    }

    if (
      !Number.isInteger(Number(rows)) ||
      !Number.isInteger(Number(cols)) ||
      Number(rows) < 1 ||
      Number(rows) > 26 ||
      Number(cols) < 1 ||
      Number(cols) > 50
    ) {
      setError('Số hàng phải từ 1–26, số ghế mỗi hàng từ 1–50.');
      return;
    }

    if (seats.length > 0) {
      setError('Sự kiện đã có ghế. Không thể tạo lại sơ đồ ban đầu.');
      return;
    }

    const confirmed = window.confirm(
      `Tạo ${rows} hàng × ${cols} ghế, tổng ${Number(rows) * Number(cols)} ghế?`
    );

    if (!confirmed) return;

    setGenerating(true);
    setError('');
    setMessage('');

    try {
      const result = await generateAdminSeatGrid(
        eventId,
        Number(rows),
        Number(cols)
      );

      await loadSeats(eventId);

      const createdCount =
        result.result?.created_count ?? Number(rows) * Number(cols);

      setMessage(`Đã tạo ${createdCount} ghế.`);
    } catch (err) {
      setError(err.message || 'Tạo sơ đồ ghế thất bại.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(seat) {
    const confirmed = window.confirm(
      `Xóa ghế ${seat.label}? Thao tác này không thể hoàn tác.`
    );

    if (!confirmed) return;

    setDeletingSeatId(seat.id);
    setError('');
    setMessage('');

    try {
      await deleteAdminSeat(eventId, seat.id);
      await loadSeats(eventId);
      setMessage(`Đã xóa ghế ${seat.label}.`);
    } catch (err) {
      setError(
        err.message ||
          'Không thể xóa ghế. Ghế có thể đã có lịch sử giữ chỗ hoặc đặt vé.'
      );
    } finally {
      setDeletingSeatId(null);
    }
  }

  if (loadingEvents) {
    return <section className="admin-seat-manager">Đang tải sự kiện...</section>;
  }

  return (
    <section className="admin-seat-manager">
      <div className="admin-seat-header">
        <div>
          <h2>Quản lý ghế</h2>
          <p>Chọn sự kiện để xem và quản lý sơ đồ ghế.</p>
        </div>

        <button
          type="button"
          onClick={() => loadSeats(eventId)}
          disabled={!eventId || loadingSeats}
        >
          {loadingSeats ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {error && <p className="seat-alert seat-alert-error">{error}</p>}
      {message && <p className="seat-alert seat-alert-success">{message}</p>}

      <label className="seat-field">
        Sự kiện
        <select
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
          disabled={!events.length}
        >
          {events.length === 0 && <option value="">Chưa có sự kiện</option>}

          {events.map((event) => (
            <option key={event.id} value={String(event.id)}>
              {event.name} — #{event.id}
            </option>
          ))}
        </select>
      </label>

      {!events.length ? (
        <p>Hãy tạo sự kiện trước khi thiết lập sơ đồ ghế.</p>
      ) : (
        <>
          <div className="seat-stat-grid">
            <div className="seat-stat">
              <span>Tổng ghế</span>
              <strong>{counts.total}</strong>
            </div>
            <div className="seat-stat">
              <span>Còn trống</span>
              <strong>{counts.available}</strong>
            </div>
            <div className="seat-stat">
              <span>Đang giữ</span>
              <strong>{counts.held}</strong>
            </div>
            <div className="seat-stat">
              <span>Đã đặt</span>
              <strong>{counts.booked}</strong>
            </div>
          </div>

          {seats.length === 0 && !loadingSeats && (
            <form className="seat-generate-form" onSubmit={handleGenerate}>
              <h3>Tạo sơ đồ ghế ban đầu</h3>
              <p>
                Tạo nhãn tự động theo dạng A1, A2, B1, B2...
                Chức năng này chỉ dùng khi sự kiện chưa có ghế.
              </p>

              <div className="seat-generate-fields">
                <label className="seat-field">
                  Số hàng (1–26)
                  <input
                    type="number"
                    min="1"
                    max="26"
                    value={rows}
                    onChange={(event) => setRows(event.target.value)}
                    required
                  />
                </label>

                <label className="seat-field">
                  Ghế mỗi hàng (1–50)
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={cols}
                    onChange={(event) => setCols(event.target.value)}
                    required
                  />
                </label>
              </div>

              <p>Tổng số ghế sẽ tạo: {Number(rows) * Number(cols) || 0}</p>

              <button type="submit" disabled={generating || loadingSeats}>
                {generating ? 'Đang tạo...' : 'Tạo sơ đồ'}
              </button>
            </form>
          )}

          {loadingSeats ? (
            <p>Đang tải sơ đồ ghế...</p>
          ) : seats.length > 0 ? (
            <>
              <div className="seat-legend">
                <span><i className="seat-dot available" /> Còn trống</span>
                <span><i className="seat-dot held" /> Đang giữ</span>
                <span><i className="seat-dot booked" /> Đã đặt</span>
              </div>

              <div className="seat-grid" aria-label="Sơ đồ ghế">
                {seatStatuses.map(({ seat, key, label }) => (
                  <div className="seat-cell" key={seat.id}>
                    <div className={`seat-tile ${key}`} title={label}>
                      {seat.label}
                    </div>
                    <span className="seat-status-label">{label}</span>
                    <button
                      type="button"
                      className="seat-delete-button"
                      disabled={deletingSeatId !== null}
                      onClick={() => handleDelete(seat)}
                      title="Yêu cầu xóa ghế; backend sẽ kiểm tra lịch sử"
                    >
                      {deletingSeatId === seat.id ? 'Đang xóa...' : 'Xóa'}
                    </button>
                  </div>
                ))}
              </div>

              <p className="seat-note">
                Xóa ghế chỉ thành công nếu ghế không có bất kỳ lịch sử giữ chỗ
                hoặc đặt vé nào. Backend vẫn kiểm tra lại trước khi xóa.
              </p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
