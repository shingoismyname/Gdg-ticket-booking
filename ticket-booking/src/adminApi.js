
import { supabase } from './supabase';

const API_URL = 'http://localhost:3000/api';

export async function adminRequest(path, options = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Bạn cần đăng nhập admin trước.');
  }

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${session.access_token}`,
  };

  if (options.body != null) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error || result.message || `HTTP ${response.status}`
    );
  }

  return result;
}

export async function adminLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error('Đăng nhập thất bại. Kiểm tra email và mật khẩu.');
  }

  return data;
}

export async function adminLogout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error('Không thể đăng xuất.');
  }
}

export async function checkAdminAccess() {
  return adminRequest('/admin/test');
}

export async function getAdminEvents() {
  return adminRequest('/admin/events');
}

export async function createAdminEvent(eventData) {
  return adminRequest('/admin/events', {
    method: 'POST',
    body: JSON.stringify(eventData),
  });
}


export async function getEventCategories() {
  const response = await fetch(`${API_URL}/categories`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error || result.message || 'Không thể tải danh mục sự kiện.'
    );
  }

  return result.data ?? [];
}


export async function updateAdminEvent(id, eventData) {
  return adminRequest(`/admin/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(eventData),
  });
}



export async function getAdminEventSeats(eventId) {
  return adminRequest(
    `/admin/events/${encodeURIComponent(eventId)}/seats`
  );
}

export async function generateAdminSeatGrid(eventId, rows, cols) {
  return adminRequest(
    `/admin/events/${encodeURIComponent(eventId)}/seats/generate`,
    {
      method: 'POST',
      body: JSON.stringify({ rows, cols }),
    }
  );
}

export async function deleteAdminSeat(eventId, seatId) {
  return adminRequest(
    `/admin/events/${encodeURIComponent(eventId)}/seats/${encodeURIComponent(seatId)}`,
    {
      method: 'DELETE',
    }
  );
}
