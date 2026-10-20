import App from './App';
import AdminApp from './admin/AdminApp';

export default function RouteApp() {
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminApp />;
  }

  return <App />;
}