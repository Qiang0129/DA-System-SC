import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Play,
  Upload,
} from 'lucide-react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './landing.css';
import { SOFTWARE_SHORT_NAME } from './appMeta';
import { LandingPage } from './LandingPage';
import { AuthFlipCard } from './AuthPages';
import { AppBackground } from './AppBackground';
import { DatasetManagementPage } from './DatasetManagementPage';
import { DataQualityPage } from './workbench/data-quality/DataQualityPage';
import { DatasetVersionsPage } from './workbench/dataset-versions/DatasetVersionsPage';
import { TaskCenterPage } from './workbench/tasks/TaskCenterPage';
import { TaskResultViews } from './workbench/results/TaskResultViews';
import { useTaskResult } from './workbench/results/useTaskResult';
import {
  clearAuthSession,
  logout as logoutFromApi,
  restoreAuthSession,
  subscribeAuthSession,
  type AuthUser,
} from './api/auth';
import { publicFetch } from './api/client';
import {
  dashboardGroups,
  dashboardNavItems,
  defaultWorkbenchPath,
  getActiveWorkbenchSection,
  legacyWorkbenchRedirects,
} from './dashboard/navigation';

const resultWorkbenchSections = new Set([
  'analysis',
  'ca-matrix',
  'kernel-config',
  'mkl',
  'evaluation',
  'visualization',
  'results',
  'export',
  'reports',
  'logs',
]);

type BackendStatus = 'checking' | 'online' | 'offline';

function Sidebar({
  activeSection,
  collapsed,
  open,
  onClose,
}: {
  activeSection: string;
  collapsed: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const location = useLocation();
  const taskId = new URLSearchParams(location.search).get('taskId');
  const resultPaths = new Set([
    '/workbench/analysis',
    '/workbench/ca-matrix',
    '/workbench/kernel-config',
    '/workbench/mkl',
    '/workbench/evaluation',
    '/workbench/visualization',
    '/workbench/results',
    '/workbench/export',
    '/workbench/reports',
    '/workbench/logs',
  ]);
  return (
    <>
      <button
        type="button"
        className={`sidebar-backdrop ${open ? 'visible' : ''}`}
        aria-label="关闭导航"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand" title={SOFTWARE_SHORT_NAME}>
          <span className="brand-copy">
        <strong>{SOFTWARE_SHORT_NAME}</strong>
            <small>新材料聚类分析</small>
          </span>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {dashboardGroups.map((group) => (
            <div className="nav-group" key={group.key}>
              <span className="nav-group-label">{group.label}</span>
              {dashboardNavItems
                .filter((item) => item.group === group.key)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.label;

                  return (
                    <NavLink
                      key={item.label}
                      to={resultPaths.has(item.path) && taskId ? `${item.path}?taskId=${encodeURIComponent(taskId)}` : item.path}
                      aria-current={isActive ? 'page' : undefined}
                      className={({ isActive: routeIsActive }) =>
                        `nav-item ${routeIsActive ? 'active' : ''}`
                      }
                      onClick={onClose}
                      title={item.label}
                    >
                      <span className="nav-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <span className="nav-label">{item.label}</span>
                    </NavLink>
                  );
                })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

function TopHeader({
  activeSection,
  currentUser,
  onToggleMobileNav,
  onLogout,
}: {
  activeSection: string;
  currentUser: AuthUser | null;
  onToggleMobileNav: () => void;
  onLogout: () => void;
}) {
  const username = currentUser?.username || '研究用户';

  return (
    <header className="main-header">
      <div className="navbar-left">
        <button
          type="button"
          className="header-icon-button mobile-nav-button"
          aria-label="打开导航"
          onClick={onToggleMobileNav}
        >
          <Menu size={18} />
        </button>
        <div className="header-context">
          <span>{SOFTWARE_SHORT_NAME}工作台</span>
          <ChevronRight size={14} aria-hidden="true" />
          <div className="header-section-title" aria-label="当前模块">
            {activeSection}
          </div>
        </div>
      </div>

      <div className="navbar-right">
        <div className="header-user" title={`当前用户：${username}`} aria-label={`当前用户：${username}`}>
          <span className="header-user-avatar" aria-hidden="true">
            {username.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <button
          type="button"
          className="header-icon-button"
          aria-label="退出登录"
          title="退出登录"
          onClick={onLogout}
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function StatusHeader({
  status,
  onImportData,
  onCreateTask,
}: {
  status: BackendStatus;
  onImportData: () => void;
  onCreateTask: () => void;
}) {
  const statusText =
    status === 'online' ? 'FastAPI 已连接' : status === 'offline' ? 'FastAPI 连接异常' : '正在检查 FastAPI…';
  const statusClass = status === 'online' ? 'success' : status === 'offline' ? 'error' : 'warning';

  return (
    <section className="status-header" aria-label="系统连接状态">
      <div className="status-left">
        <span className={`status-dot ${statusClass}`} aria-hidden="true" />
        <div>
          <span className="status-label">Python 服务</span>
          <strong>{statusText}</strong>
        </div>
      </div>
      <div className="status-actions">
        <button type="button" className="btn btn-secondary" onClick={onImportData}>
          <Upload size={16} aria-hidden="true" />
          导入数据
        </button>
        <button type="button" className="btn btn-primary" onClick={onCreateTask}>
          <Play size={16} aria-hidden="true" />
          创建任务
        </button>
      </div>
    </section>
  );
}

function WorkbenchPageContent({
  activeSection,
  sectionKey,
  resultResource,
}: {
  activeSection: string;
  sectionKey: string;
  resultResource: ReturnType<typeof useTaskResult>;
}) {
  if (resultWorkbenchSections.has(sectionKey)) {
    return <TaskResultViews section={sectionKey} resource={resultResource} />;
  }

  switch (activeSection) {
    case '数据管理':
      return <DatasetManagementPage />;
    case '数据质量检查':
      return <DataQualityPage />;
    case '数据版本记录':
      return <DatasetVersionsPage />;
    case '任务中心':
      return <TaskCenterPage />;
    default:
      return <Navigate to={defaultWorkbenchPath} replace />;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const workbenchSection = getActiveWorkbenchSection(location.pathname);
  const workbenchKey = location.pathname.split('/')[2] || 'analysis';
  const resultResource = useTaskResult(Boolean(workbenchSection) && resultWorkbenchSections.has(workbenchKey));
  const activeSection = workbenchSection ?? '分析工作台';
  const showStatusHeader = location.pathname === defaultWorkbenchPath;
  const initialPathRef = useRef(location.pathname);
  const sessionCheckedRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workbenchEntryPending, setWorkbenchEntryPending] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    const storedUser = localStorage.getItem('soft_web_user');
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      return null;
    }
  });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');

  const openWorkbench = useCallback(() => {
    navigate(defaultWorkbenchPath);
    setSidebarOpen(false);
  }, [navigate]);

  useEffect(() => subscribeAuthSession((event) => {
    setCurrentUser(null);
    setSidebarOpen(false);

    if (event.reason === 'logout') {
      navigate('/', { replace: true });
      return;
    }

    if (!['/login', '/register'].includes(location.pathname)) {
      navigate('/login', { replace: true });
    }
  }), [location.pathname, navigate]);

  const enterWorkbench = useCallback(async () => {
    if (workbenchEntryPending) return;

    setWorkbenchEntryPending(true);

    try {
      const user = await restoreAuthSession();
      setCurrentUser(user);
      openWorkbench();
    } catch {
      clearAuthSession();
      setCurrentUser(null);
      setSidebarOpen(false);
      navigate('/login');
    } finally {
      setWorkbenchEntryPending(false);
    }
  }, [navigate, openWorkbench, workbenchEntryPending]);

  const refreshBackendStatus = useCallback(async () => {
    setBackendStatus('checking');
    if (typeof fetch === 'undefined') {
      setBackendStatus('offline');
      return;
    }
    try {
      const response = await publicFetch('/health');
      if (!response.ok) {
        throw new Error('health check failed');
      }
      setBackendStatus('online');
    } catch {
      setBackendStatus('offline');
    }
  }, []);

  useEffect(() => {
    if (sessionCheckedRef.current) {
      return;
    }

    sessionCheckedRef.current = true;

    const hasCachedUser = Boolean(localStorage.getItem('soft_web_user'));
    const isWorkbenchPath = initialPathRef.current.startsWith('/workbench');
    if (!hasCachedUser && !isWorkbenchPath) {
      return;
    }

    let cancelled = false;

    restoreAuthSession()
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        if (['/', '/login', '/register'].includes(initialPathRef.current)) {
          navigate(defaultWorkbenchPath, { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthSession();
        setCurrentUser(null);
        if (isWorkbenchPath) {
          navigate('/login', { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!workbenchSection) return;
    void refreshBackendStatus();
  }, [refreshBackendStatus, workbenchSection]);

  const handleAuthSuccess = () => {
    const storedUser = localStorage.getItem('soft_web_user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setCurrentUser(null);
      }
    }
    openWorkbench();
  };

  const handleLogout = async () => {
    await logoutFromApi();
    setCurrentUser(null);
    setSidebarOpen(false);
    navigate('/', { replace: true });
  };

  const dashboardShell = workbenchSection ? (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <AppBackground />
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>

      <Sidebar
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <TopHeader
        activeSection={activeSection}
        currentUser={currentUser}
        onToggleMobileNav={() => setSidebarOpen((value) => !value)}
        onLogout={handleLogout}
      />

      <button
        type="button"
        className="sidebar-toggle-floating"
        aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        onClick={() => setSidebarCollapsed((value) => !value)}
      >
        {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      <main className={`dashboard-content${workbenchKey === 'logs' ? ' is-log-layout' : ''}`} id="main-content">
        {showStatusHeader ? (
          <StatusHeader
            status={backendStatus}
            onImportData={() => navigate('/workbench/datasets')}
            onCreateTask={() => navigate('/workbench/tasks')}
          />
        ) : null}
        <WorkbenchPageContent
          activeSection={activeSection}
          sectionKey={workbenchKey}
          resultResource={resultResource}
        />
      </main>
    </div>
  ) : (
    <Navigate to={defaultWorkbenchPath} replace />
  );

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register';

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              onLogin={() => navigate('/login')}
              onRegister={() => navigate('/register')}
              onEnterWorkbench={enterWorkbench}
              isEnteringWorkbench={workbenchEntryPending}
            />
          }
        />
        <Route path="/login" element={null} />
        <Route path="/register" element={null} />
        <Route path="/workbench" element={<Navigate to={defaultWorkbenchPath} replace />} />
        {Object.entries(legacyWorkbenchRedirects).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="/workbench/:section" element={dashboardShell} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {isAuthRoute ? (
        <AuthFlipCard
          mode={location.pathname === '/register' ? 'register' : 'login'}
          onSuccess={handleAuthSuccess}
          onShowLogin={() => navigate('/login')}
          onShowRegister={() => navigate('/register')}
          onBack={() => navigate('/')}
        />
      ) : null}
    </>
  );
}

export default App;
