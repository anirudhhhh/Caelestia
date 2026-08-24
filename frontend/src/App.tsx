import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Playground from './pages/Playground';
import AuditTrail from './pages/AuditTrail';
import HumanReview from './pages/HumanReview';
import TrustDashboard from './pages/TrustDashboard';
import PolicyEditor from './pages/PolicyEditor';
import SystemHealth from './pages/SystemHealth';
import LoadBalancer from './pages/LoadBalancer';
import { TooltipProvider } from './components/ui/tooltip';
import { PlaygroundProvider } from './context/PlaygroundContext';

function App() {
  return (
    <TooltipProvider>
      <PlaygroundProvider>
        <Router>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Playground />} />
              <Route path="/load-balancer" element={<LoadBalancer />} />
              <Route path="/review" element={<HumanReview />} />
              <Route path="/trust" element={<TrustDashboard />} />
              <Route path="/audit" element={<AuditTrail />} />
              <Route path="/policies" element={<PolicyEditor />} />
              <Route path="/health" element={<SystemHealth />} />
            </Route>
          </Routes>
        </Router>
      </PlaygroundProvider>
    </TooltipProvider>
  );
}

export default App;
