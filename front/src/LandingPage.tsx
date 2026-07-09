import { useEffect, useState } from 'react';
import {
  Copy,
  Database,
  FlaskConical,
  Globe,
  LayoutDashboard,
  Network,
  Rocket,
} from 'lucide-react';
import loginIcon from './images/登录.svg';
import registerIcon from './images/注册.svg';
import copyIcon from './images/复制.svg';
import brandLogo from './images/Logo.svg';

const BACKEND_URL = 'http://localhost:5173';
const ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/register',
];

const CAPABILITY_MARKS = [
  { label: '数据导入', short: 'DATA', display: 'OMELET', icon: Database, tone: 'blue' },
  { label: 'CA 矩阵', short: 'CA', display: 'CA Matrix', icon: Network, tone: 'indigo' },
  { label: 'OMELET-SV', short: 'SV', display: 'OMELET-SV', icon: LayoutDashboard, tone: 'cyan' },
  { label: '多核学习', short: 'MKL', display: 'Python', icon: Globe, tone: 'violet' },
  { label: 'Python 算法实现', short: 'PY', display: 'FastAPI', icon: FlaskConical, tone: 'green' },
  { label: 'FastAPI 服务编排', short: 'API', display: 'NumPy', icon: Rocket, tone: 'orange' },
  { label: '可视化看板', short: 'CHART', display: 'SciPy', icon: LayoutDashboard, tone: 'blue' },
  { label: '结果导出', short: 'EXPORT', display: 'ECharts', icon: Copy, tone: 'slate' },
] as const;

const DETAIL_CARDS = [
  {
    title: '数据管理',
    description: '导入基础聚类结果、查看基础聚类统计、随机选择样本并创建聚类任务。',
  },
  {
    title: '协关联矩阵分析',
    description: '构建 CA 矩阵，并通过热力图查看样本间协关联结构。',
  },
  {
    title: '多核相似性学习',
    description: '选择核函数、设置参数、构建基础核矩阵并执行集成聚类算法。',
  },
  {
    title: '性能评估',
    description: '计算 ACC、NMI、ARI、F1-score，并支持多次运行统计。',
  },
  {
    title: '可视化展示',
    description: '展示 CA 矩阵热力图、核权重分布、拓扑亲和矩阵、聚类散点图和收敛曲线。',
  },
  {
    title: '结果导出',
    description: '导出聚类标签、指标表格、图像结果、运行日志，并生成聚类分析报告。',
  },
];

function TopBar() {
  return (
    <header className="landing-topbar">
      <div className="landing-topbar-inner">
        <div className="landing-brand">
          <span className="brand-logo" aria-hidden="true">
            <img className="brand-logo-image" src={brandLogo} alt="" aria-hidden="true" />
          </span>
          <span className="landing-brand-copy">
            <strong>OMELET Lab</strong>
            <small>新材料聚类分析</small>
          </span>
        </div>
        <span className="landing-version-pill" aria-label="当前版本 v1.0.0">
          v1.0.0
        </span>
      </div>
    </header>
  );
}

function BaseUrlRow() {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % ENDPOINTS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(BACKEND_URL);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="base-url-row" role="group" aria-label="后端服务地址">
      <span className="base-url-address">{BACKEND_URL}</span>
      <span key={ENDPOINTS[index]} className="base-url-endpoint">
        {ENDPOINTS[index]}
      </span>
      <button
        type="button"
        className="base-url-copy"
        aria-label={copied ? '已复制地址' : '复制地址'}
        onClick={handleCopy}
      >
        <img className="base-url-copy-icon" src={copyIcon} alt="" aria-hidden="true" />
      </button>
    </div>
  );
}

function Hero({
  onLogin,
  onRegister,
}: {
  onLogin: () => void;
  onRegister: () => void;
}) {
  return (
    <section className="landing-hero" aria-label="新材料数据分析平台介绍">
      <div className="blur-ball blur-ball-indigo" aria-hidden="true" />
      <div className="blur-ball blur-ball-teal" aria-hidden="true" />
      <div className="landing-hero-inner">
        <div className="landing-hero-copy">
          <h1>
            新材料
            <br />
            <span className="shine-text">数据分析统一平台</span>
          </h1>
          <p className="hero-subtitle">
            立即进入平台，只需访问以下地址：
          </p>
        </div>

        <BaseUrlRow />

        <div className="hero-buttons" aria-label="首页账号操作">
          <button type="button" className="btn btn-primary hero-btn" onClick={onLogin}>
            <img className="hero-btn-icon" src={loginIcon} alt="" aria-hidden="true" />
            登录
          </button>
          <button type="button" className="btn btn-secondary hero-btn" onClick={onRegister}>
            <img className="hero-btn-icon" src={registerIcon} alt="" aria-hidden="true" />
            注册
          </button>
        </div>

        <CapabilityStrip />
      </div>
    </section>
  );
}

function CapabilityStrip() {
  return (
    <section className="landing-capability-strip" id="datasets" aria-labelledby="capability-title">
      <h2 id="capability-title">覆盖完整的分析链路</h2>
      <div className="capability-mark-grid" aria-label="分析链路能力">
        {CAPABILITY_MARKS.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              className={`capability-mark capability-mark-${item.tone}`}
              aria-label={item.label}
              title={item.label}
            >
              <Icon aria-hidden="true" />
              <strong>{item.short}</strong>
              <span className="capability-mark-label">{item.display}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function DetailSection() {
  return (
    <section className="landing-section" aria-labelledby="detail-title">
      <div className="landing-section-inner">
        <div className="landing-section-header">
          <span className="landing-section-kicker">平台能力</span>
          <h2 id="detail-title">从数据管理到分析报告的完整流程</h2>
          <p>
            围绕基础聚类结果、CA 矩阵、多核相似性学习、性能评估、可视化展示与结果导出，形成面向新材料数据分析的闭环工作流。
          </p>
        </div>

        <div className="capability-grid">
          {DETAIL_CARDS.map((item) => (
            <article key={item.title} className="capability-card">
              <span className="capability-icon" aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection({ onEnterWorkbench }: { onEnterWorkbench: () => void }) {
  return (
    <section className="landing-section landing-section-compact" id="about" aria-labelledby="about-title">
      <div className="landing-section-inner landing-about-card">
        <div className="landing-about-copy">
          <span className="landing-section-kicker">系统概览</span>
          <h2 id="about-title">拓扑感知多核集成聚类分析系统</h2>
          <p>
            系统以新材料数据分析为场景，串联数据管理、协关联矩阵分析、多核相似性学习、性能评估、可视化展示与结果导出，支撑从基础聚类结果导入到聚类分析报告生成的完整流程。
          </p>
        </div>
        <button type="button" className="landing-link-button" onClick={onEnterWorkbench}>
          前往分析工作台
          <LayoutDashboard size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export function LandingPage({
  onLogin,
  onRegister,
  onEnterWorkbench,
}: {
  onLogin: () => void;
  onRegister: () => void;
  onEnterWorkbench: () => void;
}) {
  return (
    <div className="landing-page">
      <TopBar />
      <main className="landing-main">
        <Hero onLogin={onLogin} onRegister={onRegister} />
        <DetailSection />
        <AboutSection onEnterWorkbench={onEnterWorkbench} />
      </main>
    </div>
  );
}

export default LandingPage;
