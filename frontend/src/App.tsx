import { Routes, Route, Navigate, Outlet, NavLink, useParams, useNavigate, useLocation } from 'react-router-dom';
import type { CrawlJob } from './types.ts';
import { CrawlerForm } from './components/CrawlerForm.tsx';
import { SearchPanel } from './components/SearchPanel.tsx';
import { JobList } from './components/JobList.tsx';
import { CrawlerDashboard } from './components/CrawlerDashboard.tsx';
import './App.css';

function tabClassName({ isActive }: { isActive: boolean }) {
  return `tab-btn${isActive ? ' active' : ''}`;
}

function AppLayout() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Web Crawler & Search Engine</h1>
        <nav className="tab-nav">
          <NavLink to="/crawler" className={tabClassName} end>
            Crawler
          </NavLink>
          <NavLink to="/search" className={tabClassName}>
            Search
          </NavLink>
          <NavLink to="/jobs" className={tabClassName}>
            Jobs
          </NavLink>
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function JobsLayout() {
  return <Outlet />;
}

function JobDetailRoute() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const seed = (location.state as { seedJob?: CrawlJob } | null)?.seedJob;
  const seedJob =
    jobId && seed?.jobId === jobId ? seed : null;

  if (!jobId) {
    return <Navigate to="/jobs" replace />;
  }

  return (
    <div className="job-detail-view">
      <button type="button" className="btn btn-secondary back-btn" onClick={() => navigate('/jobs')}>
        &larr; Back to Jobs
      </button>
      <CrawlerDashboard jobId={jobId} job={seedJob} />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/crawler" replace />} />
        <Route path="crawler" element={<CrawlerForm />} />
        <Route path="search" element={<SearchPanel />} />
        <Route path="jobs" element={<JobsLayout />}>
          <Route index element={<JobList />} />
          <Route path=":jobId" element={<JobDetailRoute />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/crawler" replace />} />
    </Routes>
  );
}

export default AppRoutes;
