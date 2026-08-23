import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Playground from './pages/Playground';
import AuditTrail from './pages/AuditTrail';
import HumanReview from './pages/HumanReview';
import TrustDashboard from './pages/TrustDashboard';
import PolicyEditor from './pages/PolicyEditor';
import SystemHealth from './pages/SystemHealth';
import { TooltipProvider } from './components/ui/tooltip';

function App() {
  return (
    <TooltipProvider>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Playground />} />
            <Route path="/review" element={<HumanReview />} />
            <Route path="/trust" element={<TrustDashboard />} />
            <Route path="/audit" element={<AuditTrail />} />
            <Route path="/policies" element={<PolicyEditor />} />
            <Route path="/health" element={<SystemHealth />} />
          </Route>
        </Routes>
      </Router>
    </TooltipProvider>
  );
}

export default App;
