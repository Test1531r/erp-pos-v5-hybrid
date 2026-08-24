import { Routes, Route, Navigate } from "react-router-dom";
import { useStore } from "./store/index.js";
import Login from "./views/Login.jsx";
import Layout from "./views/Layout.jsx";
import Dashboard from "./views/Dashboard.jsx";
import POS from "./views/POS.jsx";
import Inventory from "./views/Inventory.jsx";
import Sales from "./views/Sales.jsx";
import Customers from "./views/Customers.jsx";
import Repairs from "./views/Repairs.jsx";
import Transfers from "./views/Transfers.jsx";
import Expenses from "./views/Expenses.jsx";
import Users from "./views/Users.jsx";
import Branches from "./views/Branches.jsx";
import Finance from "./views/Finance.jsx";
import Returns from "./views/Returns.jsx";
import StockLedger from "./views/StockLedger.jsx";
import Purchases from "./views/Purchases.jsx";
import Receivables from "./views/Receivables.jsx";
import Approvals from "./views/Approvals.jsx";
import Growth from "./views/Growth.jsx";
import Closing from "./views/Closing.jsx";
import Tools from "./views/Tools.jsx";
import Reports from "./views/Reports.jsx";
import Settings from "./views/Settings.jsx";
import Stocktake from "./views/Stocktake.jsx";
import SyncCenter from "./views/SyncCenter.jsx";

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
const guard = (element, roles) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={guard(<Layout />)}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pos" element={guard(<POS />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER"])} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="stock-ledger" element={<StockLedger />} />
        <Route path="purchases" element={guard(<Purchases />, ["SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER","ACCOUNTANT"])} />
        <Route path="receivables" element={guard(<Receivables />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER","ACCOUNTANT"])} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="growth" element={<Growth />} />
        <Route path="closing" element={guard(<Closing />, ["SUPER_ADMIN","BRANCH_MANAGER","ACCOUNTANT"])} />
        <Route path="tools" element={guard(<Tools />, ["SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER"])} />
        <Route path="sync" element={<SyncCenter />} />
        <Route path="stocktake" element={guard(<Stocktake />, ["SUPER_ADMIN","BRANCH_MANAGER","INVENTORY_MANAGER"])} />
        <Route path="reports" element={guard(<Reports />, ["SUPER_ADMIN","BRANCH_MANAGER","ACCOUNTANT"])} />
        <Route path="settings" element={guard(<Settings />, ["SUPER_ADMIN","BRANCH_MANAGER"])} />
        <Route path="sales" element={<Sales />} />
        <Route path="customers" element={<Customers />} />
        <Route path="repairs" element={<Repairs />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="expenses" element={guard(<Expenses />, ["SUPER_ADMIN","BRANCH_MANAGER","ACCOUNTANT"])} />
        <Route path="finance" element={guard(<Finance />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER","ACCOUNTANT"])} />
        <Route path="returns" element={guard(<Returns />, ["SUPER_ADMIN","BRANCH_MANAGER","CASHIER","ACCOUNTANT"])} />
        <Route path="users" element={guard(<Users />, ["SUPER_ADMIN","BRANCH_MANAGER"])} />
        <Route path="branches" element={guard(<Branches />, ["SUPER_ADMIN"])} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
