import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ToastHost } from './components/ui';
import { RequireAuth, useMe } from './lib/auth';
import { homeFor } from './lib/roles';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { OrdersPage } from './pages/Orders';
import { ProductsPage } from './pages/Products';
import { CategoriesPage } from './pages/Categories';
import { IngredientsPage } from './pages/Ingredients';
import { CustomizationsPage } from './pages/Customizations';
import { DeliveryPage } from './pages/Delivery';
import { PaymentsPage } from './pages/Payments';
import { CustomersPage } from './pages/Customers';
import { ReportsPage } from './pages/Reports';
import { StaffPage } from './pages/Staff';
import { AuditPage } from './pages/Audit';
import { SettingsPage } from './pages/Settings';

function Home() {
  const me = useMe();
  const home = homeFor(me.role);
  return home === '/' ? <OverviewPage /> : <Navigate to={home} replace />;
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="ingredients" element={<IngredientsPage />} />
          <Route path="customizations" element={<CustomizationsPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  );
}
