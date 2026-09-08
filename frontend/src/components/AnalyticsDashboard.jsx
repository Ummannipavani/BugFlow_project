import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  ShieldAlert,
  Users,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Folder,
  Database
} from 'lucide-react';

export default function AnalyticsDashboard({ projects = [], activeProjectId, onSelectProject }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedProjId, setSelectedProjId] = useState(activeProjectId || 'ALL');

  const fetchAnalytics = async (projId) => {
    setLoading(true);
    try {
      const url = projId && projId !== 'ALL'
        ? `/api/analytics?project_id=${projId}`
        : '/api/analytics';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(selectedProjId);
  }, [selectedProjId]);

  const severityColors = {
    Critical: 'bg-rose-500 text-rose-100',
    High: 'bg-orange-500 text-orange-100',
    Medium: 'bg-amber-500 text-amber-100',
    Low: 'bg-emerald-500 text-emerald-100'
  };

  const statusColors = {
    'Reported': 'bg-slate-500 text-slate-100',
    'Assigned': 'bg-purple-500 text-purple-100',
    'In Progress': 'bg-blue-500 text-blue-100',
    'In Review': 'bg-amber-500 text-amber-100',
    'Resolved': 'bg-emerald-500 text-emerald-100',
    'Verified': 'bg-teal-500 text-teal-100',
    'Closed': 'bg-slate-400 text-slate-100',
    'Reopened': 'bg-rose-500 text-rose-100'
  };

  const maxWorkload = analytics?.developerWorkload
    ? Math.max(...analytics.developerWorkload.map(w => w.total), 1)
    : 1;

  const maxTrend = analytics?.defectTrends
    ? Math.max(...analytics.defectTrends.map(t => Math.max(t.reported, t.resolved)), 1)
    : 1;

  return (
    <div className="space-y-6" id="analytics-dashboard-view">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="analytics-header">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Defect Analytics & Health Metrics</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Database className="w-3 h-3" />
              Live PostgreSQL Data
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time defect aggregations, workload distribution, and resolution performance computed directly from PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-slate-400" />
            <select
              id="analytics-project-filter"
              value={selectedProjId}
              onChange={(e) => setSelectedProjId(e.target.value)}
              className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Workspace Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
              ))}
            </select>
          </div>

          <button
            id="refresh-analytics-btn"
            onClick={() => fetchAnalytics(selectedProjId)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Primary KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" id="analytics-summary-cards">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-total-defects">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Defects</span>
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><Layers className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{analytics?.totalDefects ?? 0}</span>
            <span className="text-xs text-slate-500">tickets</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">Across active sprints</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-open-defects">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Open / Active</span>
            <span className="p-2 rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600">{analytics?.openDefects ?? 0}</span>
            <span className="text-xs text-slate-500">
              ({analytics?.totalDefects ? Math.round((analytics.openDefects / analytics.totalDefects) * 100) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-xs text-rose-600 font-medium">Requiring resolution</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-resolved-defects">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Resolved / Verified</span>
            <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{analytics?.resolvedDefects ?? 0}</span>
            <span className="text-xs text-slate-500">
              ({analytics?.totalDefects ? Math.round((analytics.resolvedDefects / analytics.totalDefects) * 100) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-600 font-medium">Ready for verification</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-closed-defects">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Closed Tickets</span>
            <span className="p-2 rounded-lg bg-slate-100 text-slate-600"><ShieldAlert className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">{analytics?.closedDefects ?? 0}</span>
            <span className="text-xs text-slate-500">
              ({analytics?.totalDefects ? Math.round((analytics.closedDefects / analytics.totalDefects) * 100) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500">Completed lifecycle</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-resolution-time">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Avg Resolution Time</span>
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600"><Clock className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900">{analytics?.avgResolutionDisplay || 'N/A'}</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">Mean time to resolve (MTTR)</div>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="analytics-charts-grid">
        {/* Severity Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="chart-severity-distribution">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Defects by Severity</h3>
              <p className="text-xs text-slate-500">Impact classification</p>
            </div>
            <Flame className="w-4 h-4 text-orange-500" />
          </div>

          <div className="space-y-3">
            {['Critical', 'High', 'Medium', 'Low'].map((sev) => {
              const count = analytics?.defectsBySeverity?.[sev] || 0;
              const total = analytics?.totalDefects || 1;
              const pct = Math.round((count / total) * 100);
              const colorBg = sev === 'Critical' ? 'bg-rose-500' : sev === 'High' ? 'bg-orange-500' : sev === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500';

              return (
                <div key={sev} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-700">{sev}</span>
                    <span className="text-slate-900 font-bold">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colorBg} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="chart-category-breakdown">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Defects by Category</h3>
              <p className="text-xs text-slate-500">Architectural modules</p>
            </div>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>

          <div className="space-y-3">
            {analytics?.defectsByCategory && Object.entries(analytics.defectsByCategory).map(([cat, count]) => {
              const total = analytics?.totalDefects || 1;
              const numericCount = Number(count) || 0;
              const pct = Math.round((numericCount / total) * 100);

              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-700 truncate max-w-[200px]">{cat}</span>
                    <span className="text-slate-900 font-bold">{numericCount} ({pct}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lifecycle Status Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="chart-status-distribution">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Defects by Lifecycle Status</h3>
              <p className="text-xs text-slate-500">Pipeline progression</p>
            </div>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {analytics?.defectsByStatus && Object.entries(analytics.defectsByStatus).map(([st, count]) => (
              <div key={st} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <div className="text-xs font-medium text-slate-600 truncate">{st}</div>
                <div className="text-lg font-bold text-slate-900 mt-1">{Number(count) || 0}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Developer Workload */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="chart-developer-workload">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Developer Workload Distribution</h3>
              <p className="text-xs text-slate-500">Defects assigned per team member</p>
            </div>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>

          <div className="space-y-3">
            {analytics?.developerWorkload && analytics.developerWorkload.length > 0 ? (
              analytics.developerWorkload.map((dev) => {
                const pct = Math.round((dev.total / maxWorkload) * 100);
                return (
                  <div key={dev.developer} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-800 font-semibold">{dev.developer}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-rose-600 font-medium">{dev.open} open</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-emerald-600 font-medium">{dev.resolved} resolved</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-900 font-bold">{dev.total} total</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-rose-500 transition-all duration-500"
                        style={{ width: `${(dev.open / dev.total) * 100}%` }}
                        title={`${dev.open} open`}
                      />
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${(dev.resolved / dev.total) * 100}%` }}
                        title={`${dev.resolved} resolved`}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-400 py-4 text-center">No developer workload assignments found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Historical Trend Timeline */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="chart-defect-trends">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Defect Discovery vs. Resolution Velocity</h3>
            <p className="text-xs text-slate-500">Timeline of defects logged vs resolved by date</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-rose-600">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              Reported
            </span>
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Resolved
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[500px] flex items-end gap-3 h-40 pt-4 border-b border-slate-200">
            {analytics?.defectTrends && analytics.defectTrends.length > 0 ? (
              analytics.defectTrends.map((trend) => {
                const repHeight = Math.max(12, Math.round((trend.reported / maxTrend) * 100));
                const resHeight = Math.max(12, Math.round((trend.resolved / maxTrend) * 100));

                return (
                  <div key={trend.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full flex items-end justify-center gap-1 h-28">
                      <div
                        className="w-4 bg-rose-500 rounded-t transition-all group-hover:bg-rose-600"
                        style={{ height: `${repHeight}%` }}
                        title={`${trend.date}: ${trend.reported} reported`}
                      />
                      <div
                        className="w-4 bg-emerald-500 rounded-t transition-all group-hover:bg-emerald-600"
                        style={{ height: `${resHeight}%` }}
                        title={`${trend.date}: ${trend.resolved} resolved`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 truncate w-14 text-center font-medium">
                      {trend.date.slice(5)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="w-full flex items-center justify-center text-xs text-slate-400 py-8">
                No trend activity logged for selected project filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
