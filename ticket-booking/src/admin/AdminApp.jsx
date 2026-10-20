
import { useState } from 'react';
import {
  adminLogin,
  adminLogout,
  checkAdminAccess,
} from '../adminApi';
import './Admin.css';
import AdminDashboard from './AdminDashboard';

export default function AdminApp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event) {
    event.preventDefault();

    setLoading(true);
    setError('');

    try {
      // Bước 1: Đăng nhập bằng Supabase Auth.
      const sessionData = await adminLogin(email, password);

      // Bước 2: Xác minh tài khoản có quyền admin ở backend.
      await checkAdminAccess();

      // Bước 3: Chỉ hiển thị dashboard sau khi xác minh thành công.
      setAdmin({
        email: sessionData.user?.email || email.trim(),
      });

      setPassword('');
    } catch (err) {
      // Nếu đăng nhập được nhưng không có quyền admin,
      // xóa phiên vừa đăng nhập để tránh giữ phiên không hợp lệ.
      try {
        await adminLogout();
      } catch {
        // Giữ lại lỗi ban đầu để hiển thị cho người dùng.
      }

      setAdmin(null);
      setError(err.message || 'Đăng nhập thất bại hoặc tài khoản không có quyền admin.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setError('');

    try {
      await adminLogout();
      setAdmin(null);
      setPassword('');
      setEmail('');
    } catch (err) {
      setError(err.message || 'Không thể đăng xuất.');
    }
  }

  if (admin) {
    return (
      <AdminDashboard
        email={admin.email}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="admin-shell">
      <section className="admin-card admin-login-card">
        <p className="admin-eyebrow">TICKET BOOKING</p>

        <h1>Admin Login</h1>

        <p className="admin-description">
          Đăng nhập để quản lý sự kiện.
        </p>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleLogin} className="admin-login-form">
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
            required
            disabled={loading}
          />

          <label htmlFor="admin-password">Mật khẩu</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nhập mật khẩu"
            required
            disabled={loading}
          />

          <button
            type="submit"
            className="admin-button"
            disabled={loading}
          >
            {loading ? 'Đang xác minh...' : 'Đăng nhập'}
          </button>
        </form>
      </section>
    </main>
  );
}
