
import { useCallback, useEffect, useState } from 'react';
import {
  adminLogout,
  getAdminEvents,
  createAdminEvent,
  updateAdminEvent,
  getEventCategories,
} from '../adminApi';
import './Admin.css';
import AdminSeatManager from './AdminSeatManager';

const TAG_OPTIONS = [
  'âm nhạc',
  'học thuật',
  'workshop',
  'công nghệ',
  'sinh viên',
  'giao lưu',
  'thể thao',
  'tình nguyện',
];

const EMPTY_FORM = {
  name: '',
  slug: '',
  short_description: '',
  description: '',
  category: '',
  tags: [],
  start_at: '',
  end_at: '',
  doors_open_at: '',
  venue_name: '',
  venue_address: '',
  organizer_name: '',
  organizer_description: '',
  organizer_url: '',
  thumbnail_url: '',
  banner_url: '',
  ticket_price: '0',
  status: 'draft',
  guests: '[]',
};

function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value) {
  if (!value) return 'Chưa đặt lịch';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Ngày giờ không hợp lệ'
    : date.toLocaleString('vi-VN');
}

function toDateTimeLocal(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  );

  return localDate.toISOString().slice(0, 16);
}

function validHttpUrl(value) {
  if (!value.trim()) return true;

  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function ImagePreview({ label, url }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  return (
    <div className="admin-image-preview">
      <span>{label}</span>

      {!url.trim() ? (
        <div className="admin-image-placeholder">
          Chưa nhập URL ảnh
        </div>
      ) : failed ? (
        <div className="admin-image-placeholder">
          Không tải được ảnh. Kiểm tra lại URL.
        </div>
      ) : (
        <img
          src={url.trim()}
          alt={label}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export default function AdminDashboard({ email, onLogout }) {
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('events');

  const loadEvents = useCallback(async () => {
    setLoading(true);

    try {
      const result = await getAdminEvents();
      setEvents(result.events ?? []);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách sự kiện.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);

    try {
      const result = await getEventCategories();
      setCategories(result);

      setForm((current) => {
        // Không ghi đè lựa chọn hiện tại nếu đã có.
        if (current.category) return current;

        return {
          ...current,
          category: result[0]?.slug ?? '',
        };
      });
    } catch (err) {
      setError(err.message || 'Không thể tải danh mục.');
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
    loadCategories();
  }, [loadEvents, loadCategories]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleTag(tag) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  }

  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      category: categories[0]?.slug ?? '',
    });
  }

  function openCreateForm() {
    resetForm();
    setEditingId(null);
    setShowForm(true);
    setError('');
    setMessage('');
  }

  function openEditForm(item) {
    setEditingId(item.id);

    setForm({
      name: item.name ?? '',
      slug: item.slug ?? '',
      short_description: item.short_description ?? '',
      description: item.description ?? '',
      category: item.category ?? '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      start_at: toDateTimeLocal(item.start_at),
      end_at: toDateTimeLocal(item.end_at),
      doors_open_at: toDateTimeLocal(item.doors_open_at),
      venue_name: item.venue_name ?? '',
      venue_address: item.venue_address ?? '',
      organizer_name: item.organizer_name ?? '',
      organizer_description: item.organizer_description ?? '',
      organizer_url: item.organizer_url ?? '',
      thumbnail_url: item.thumbnail_url ?? '',
      banner_url: item.banner_url ?? '',
      ticket_price: String(item.ticket_price ?? 0),
      status: item.status ?? 'draft',
      guests: JSON.stringify(
        Array.isArray(item.guests) ? item.guests : [],
        null,
        2
      ),
    });

    setShowForm(true);
    setError('');
    setMessage('');
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    resetForm();
    setError('');
  }

  
  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!form.name.trim()) {
      setError('Vui lòng nhập tên sự kiện.');
      return;
    }

    if (!categories.some((item) => item.slug === form.category)) {
      setError('Vui lòng chọn một danh mục hợp lệ.');
      return;
    }

    const price = Number(form.ticket_price);

    if (!Number.isFinite(price) || price < 0) {
      setError('Giá vé phải là số không âm.');
      return;
    }

    const startDate = form.start_at ? new Date(form.start_at) : null;
    const endDate = form.end_at ? new Date(form.end_at) : null;
    const doorsDate = form.doors_open_at
      ? new Date(form.doors_open_at)
      : null;

    if (
      (startDate && Number.isNaN(startDate.getTime())) ||
      (endDate && Number.isNaN(endDate.getTime())) ||
      (doorsDate && Number.isNaN(doorsDate.getTime()))
    ) {
      setError('Ngày giờ không hợp lệ.');
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setError('Thời gian kết thúc phải sau thời gian bắt đầu.');
      return;
    }

    if (doorsDate && startDate && doorsDate > startDate) {
      setError('Giờ mở cửa không nên sau giờ bắt đầu sự kiện.');
      return;
    }

    for (const [label, value] of [
      ['Thumbnail URL', form.thumbnail_url],
      ['Banner URL', form.banner_url],
      ['Website đơn vị tổ chức', form.organizer_url],
    ]) {
      if (!validHttpUrl(value)) {
        setError(`${label} phải là URL HTTP/HTTPS hợp lệ.`);
        return;
      }
    }

    let guests;

    try {
      guests = JSON.parse(form.guests || '[]');

      if (!Array.isArray(guests)) {
        setError('Khách mời phải là một mảng JSON, ví dụ: [].');
        return;
      }
    } catch {
      setError('JSON khách mời không hợp lệ. Ví dụ: [].');
      return;
    }

    const eventData = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      short_description: form.short_description.trim() || null,
      description: form.description.trim() || null,
      category: form.category,
      tags: form.tags,
      start_at: toIsoOrNull(form.start_at),
      end_at: toIsoOrNull(form.end_at),
      doors_open_at: toIsoOrNull(form.doors_open_at),
      venue_name: form.venue_name.trim() || null,
      venue_address: form.venue_address.trim() || null,
      organizer_name: form.organizer_name.trim() || null,
      organizer_description:
        form.organizer_description.trim() || null,
      organizer_url: form.organizer_url.trim() || null,
      thumbnail_url: form.thumbnail_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      ticket_price: price,
      status: form.status,
      guests,
    };

    setSaving(true);

    try {
      if (editingId !== null) {
        await updateAdminEvent(editingId, eventData);
        setMessage('Cập nhật sự kiện thành công.');
      } else {
        await createAdminEvent(eventData);
        setMessage('Tạo sự kiện thành công.');
      }

      setShowForm(false);
      setEditingId(null);
      resetForm();

      await loadEvents();
    } catch (err) {
      setError(
        err.message ||
        (editingId !== null
          ? 'Không thể cập nhật sự kiện.'
          : 'Không thể tạo sự kiện.')
      );
    } finally {
      setSaving(false);
    }
  }


  async function handleLogout() {
    setError('');

    try {
      await adminLogout();
      onLogout();
    } catch (err) {
      setError(err.message || 'Không thể đăng xuất.');
    }
  }

  return (
    <main className="admin-shell">
      <section className="admin-card admin-dashboard-card">
        <p className="admin-eyebrow">TICKET BOOKING</p>
        <h1>Quản lý sự kiện</h1>
        <p className="admin-description">
          Tài khoản: {email}
        </p>
        <div className="admin-tabs">
          <button
            type="button"
            className={activeTab === 'events' ? 'active' : ''}
            onClick={() => {
              setActiveTab('events');
              setShowForm(false);
              setError('');
              setMessage('');
            }}
          >
            Quản lý sự kiện
          </button>

          <button
            type="button"
            className={activeTab === 'seats' ? 'active' : ''}
            onClick={() => {
              setActiveTab('seats');
              setShowForm(false);
              setError('');
              setMessage('');
            }}
          >
            Quản lý ghế
          </button>
        </div>
        {activeTab === 'events' && (
          <>
            <div className="admin-toolbar">
              
              <button
                className="admin-button"
                onClick={() => {
                  if (showForm) {
                    closeForm();
                  } else {
                    openCreateForm();
                  }
                }}
                disabled={saving}
              >
                {showForm ? 'Đóng biểu mẫu' : '+ Tạo sự kiện'}
              </button>

              <button
                className="admin-secondary-button"
                onClick={loadEvents}
                disabled={loading}
              >
                {loading ? 'Đang tải...' : 'Tải lại'}
              </button>

              <button
                className="admin-secondary-button"
                onClick={handleLogout}
              >
                Đăng xuất
              </button>
            </div>

            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success">{message}</p>}

            {showForm && (
              <form className="admin-event-form" onSubmit={handleSubmit}>
                <h2>
                  {editingId !== null
                    ? `Chỉnh sửa sự kiện #${editingId}`
                    : 'Tạo sự kiện mới'}
                </h2>

                {editingId !== null && (
                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={closeForm}
                    disabled={saving}
                  >
                    Hủy sửa
                  </button>
                )}

                <p className="admin-form-hint">
                  * Trường bắt buộc. Hãy kiểm tra thông tin trước khi lưu.
                </p>

                <label htmlFor="event-name">Tên sự kiện *</label>
                <input
                  id="event-name"
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  placeholder="VD: GDG-HUST 20/10 Concert"
                  required
                />

                <label htmlFor="event-slug">Slug</label>
                <input
                  id="event-slug"
                  name="slug"
                  value={form.slug}
                  onChange={updateField}
                  placeholder="VD: gdg-hust-20-10-concert"
                />

                <label htmlFor="event-short-description">Mô tả ngắn</label>
                <textarea
                  id="event-short-description"
                  name="short_description"
                  value={form.short_description}
                  onChange={updateField}
                  placeholder="VD: Đêm nhạc chào đón sinh viên mới..."
                  rows={2}
                />

                <label htmlFor="event-description">Mô tả đầy đủ</label>
                <textarea
                  id="event-description"
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  placeholder="Nhập nội dung, lịch trình và thông tin cần biết..."
                  rows={4}
                />

                <label htmlFor="event-category">Danh mục *</label>
                <select
                  id="event-category"
                  name="category"
                  value={form.category}
                  onChange={updateField}
                  required
                  disabled={loadingCategories || categories.length === 0}
                >
                  <option value="">
                    {loadingCategories
                      ? 'Đang tải danh mục...'
                      : categories.length === 0
                        ? 'Không có danh mục khả dụng'
                        : '— Chọn danh mục —'}
                  </option>

                  {categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>

                {form.category && (
                  <p className="admin-form-hint">
                    {categories.find((item) => item.slug === form.category)
                      ?.description || 'Danh mục đã chọn.'}
                  </p>
                )}

                <fieldset className="admin-tags-fieldset">
                  <legend>Tags (có thể chọn nhiều)</legend>

                  <div className="admin-tags-options">
                    {TAG_OPTIONS.map((tag) => (
                      <label key={tag} className="admin-tag-option">
                        <input
                          type="checkbox"
                          checked={form.tags.includes(tag)}
                          onChange={() => toggleTag(tag)}
                        />
                        <span>{tag}</span>
                      </label>
                    ))}
                  </div>

                  <p className="admin-form-hint">
                    Đã chọn: {form.tags.length ? form.tags.join(', ') : 'Chưa có tag'}.
                  </p>
                </fieldset>

                <div className="admin-form-grid">
                  <div>
                    <label htmlFor="event-start">Bắt đầu</label>
                    <input
                      id="event-start"
                      name="start_at"
                      type="datetime-local"
                      value={form.start_at}
                      onChange={updateField}
                    />
                  </div>

                  <div>
                    <label htmlFor="event-end">Kết thúc</label>
                    <input
                      id="event-end"
                      name="end_at"
                      type="datetime-local"
                      value={form.end_at}
                      onChange={updateField}
                    />
                  </div>

                  <div>
                    <label htmlFor="event-doors-open">Giờ mở cửa</label>
                    <input
                      id="event-doors-open"
                      name="doors_open_at"
                      type="datetime-local"
                      value={form.doors_open_at}
                      onChange={updateField}
                    />
                  </div>

                  <div>
                    <label htmlFor="event-price">Giá vé (VND) *</label>
                    <input
                      id="event-price"
                      name="ticket_price"
                      type="number"
                      min="0"
                      step="1000"
                      value={form.ticket_price}
                      onChange={updateField}
                      placeholder="VD: 50000"
                      required
                    />
                  </div>
                </div>

                <label htmlFor="event-venue">Tên địa điểm</label>
                <input
                  id="event-venue"
                  name="venue_name"
                  value={form.venue_name}
                  onChange={updateField}
                  placeholder="VD: Hội trường C2, Đại học Bách khoa Hà Nội"
                />

                <label htmlFor="event-address">Địa chỉ</label>
                <input
                  id="event-address"
                  name="venue_address"
                  value={form.venue_address}
                  onChange={updateField}
                  placeholder="VD: Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội"
                />

                <label htmlFor="event-organizer">Đơn vị tổ chức</label>
                <input
                  id="event-organizer"
                  name="organizer_name"
                  value={form.organizer_name}
                  onChange={updateField}
                  placeholder="VD: Google Developer Groups HUST"
                />

                <label htmlFor="event-organizer-description">
                  Mô tả đơn vị tổ chức
                </label>
                <textarea
                  id="event-organizer-description"
                  name="organizer_description"
                  value={form.organizer_description}
                  onChange={updateField}
                  placeholder="Giới thiệu ngắn về đơn vị tổ chức..."
                  rows={2}
                />

                <label htmlFor="event-organizer-url">Website đơn vị tổ chức</label>
                <input
                  id="event-organizer-url"
                  name="organizer_url"
                  type="url"
                  value={form.organizer_url}
                  onChange={updateField}
                  placeholder="VD: https://gdg.community.dev/"
                />

                <label htmlFor="event-thumbnail">Thumbnail URL</label>
                <input
                  id="event-thumbnail"
                  name="thumbnail_url"
                  type="url"
                  value={form.thumbnail_url}
                  onChange={updateField}
                  placeholder="VD: https://example.com/poster-small.jpg"
                />

                <ImagePreview
                  label="Xem trước thumbnail"
                  url={form.thumbnail_url}
                />

                <label htmlFor="event-banner">Banner URL</label>
                <input
                  id="event-banner"
                  name="banner_url"
                  type="url"
                  value={form.banner_url}
                  onChange={updateField}
                  placeholder="VD: https://example.com/banner.jpg"
                />

                <ImagePreview
                  label="Xem trước banner"
                  url={form.banner_url}
                />

                <label htmlFor="event-guests">Khách mời (JSON array)</label>
                <textarea
                  id="event-guests"
                  name="guests"
                  value={form.guests}
                  onChange={updateField}
                  rows={3}
                  placeholder={'VD: [{"name":"Nguyen Van A","title":"Speaker"}]'}
                />
                <p className="admin-form-hint">
                  Nếu chưa có khách mời, để [].
                </p>

                <label htmlFor="event-status">Trạng thái *</label>
                <select
                  id="event-status"
                  name="status"
                  value={form.status}
                  onChange={updateField}
                >
                  <option value="draft">Nháp — chưa công khai</option>
                  <option value="published">Xuất bản — hiển thị công khai</option>
                  <option value="cancelled">Đã hủy</option>
                </select>

                {form.status === 'published' && (
                  <p className="admin-form-hint">
                    Sự kiện có thể xuất hiện ngay trên trang khách hàng sau khi lưu.
                  </p>
                )}

                <button
                  className="admin-button"
                  type="submit"
                  disabled={
                    saving ||
                    loadingCategories ||
                    categories.length === 0
                  }
                >
                  {saving
                    ? 'Đang lưu...'
                    : editingId !== null
                      ? 'Lưu thay đổi'
                      : 'Tạo sự kiện'}
                </button>
              </form>
            )}

            <h2 className="admin-section-title">
              Danh sách sự kiện ({events.length})
            </h2>

            {loading ? (
              <p>Đang tải danh sách...</p>
            ) : events.length === 0 ? (
              <p>Chưa có sự kiện nào.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Ảnh</th>
                      <th>Sự kiện</th>
                      <th>Bắt đầu</th>
                      <th>Giá vé</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>

                  <tbody>
                    {events.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.thumbnail_url ? (
                            <img
                              className="admin-event-thumbnail"
                              src={item.thumbnail_url}
                              alt={`Thumbnail ${item.name}`}
                              loading="lazy"
                            />
                          ) : (
                            <div className="admin-thumbnail-empty">
                              Chưa có ảnh
                            </div>
                          )}
                        </td>

                        <td>
                          <strong>{item.name}</strong>
                          <div className="admin-muted">
                            {item.slug || `ID: ${item.id}`}
                          </div>
                        </td>

                        <td>{formatDate(item.start_at)}</td>

                        <td>
                          {Number(item.ticket_price || 0).toLocaleString('vi-VN')} ₫
                        </td>

                        <td>{item.status || 'Không rõ'}</td>

                        <td>
                          <button
                            type="button"
                            className="admin-secondary-button"
                            onClick={() => openEditForm(item)}
                            disabled={saving}
                          >
                            Sửa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === 'seats' && <AdminSeatManager />}

      </section>
    </main>
  );
}
