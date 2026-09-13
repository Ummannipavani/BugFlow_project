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
  Database,
  Calendar,
  Sparkles,
  GitBranch,
  Hourglass,
  Copy,
  AlertOctagon,
  Target,
  CheckCircle,
  Activity
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

  const maxWorkload = analytics?.developerWorkload
    ? Math.max(...analytics.developerWorkload.map(w => w.total), 1)
    : 1;

  const maxTrend = analytics?.defectTrends
    ? Math.max(...analytics.defectTrends.map(t => Math.max(t.reported, t.resolved, t.critical || 0)), 1)
    : 1;

  return (
    <div className="space-y-6 pb-12" id="analytics-dashboard-view">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="analytics-header">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Intelligent Defect Analytics & Metrics</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Database className="w-3 h-3" />
              Live PostgreSQL Data
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time defect aggregations, workload velocity, MTTR, backlog aging, and pattern intelligence computed directly from database records.
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
          <div className="mt-2 text-xs text-slate-500">Across active workspace</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-open-defects">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Defect Backlog (Active)</span>
            <span className="p-2 rounded-lg bg-rose-50 text-rose-600"><AlertTriangle className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600">{analytics?.defectBacklog?.totalBacklog ?? analytics?.openDefects ?? 0}</span>
            <span className="text-xs text-slate-500">
              ({analytics?.totalDefects ? Math.round(((analytics?.defectBacklog?.totalBacklog ?? analytics?.openDefects ?? 0) / analytics.totalDefects) * 100) : 0}%)
            </span>
          </div>
          <div className="mt-2 text-xs text-rose-600 font-medium">
            {analytics?.defectBacklog?.unassignedCount ? `${analytics.defectBacklog.unassignedCount} unassigned` : 'Requiring resolution'}
          </div>
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

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-critical-ratio">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Critical Defect Rate</span>
            <span className="p-2 rounded-lg bg-orange-50 text-orange-600"><Flame className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-orange-600">{analytics?.criticalRatioDisplay ?? '0%'}</span>
            <span className="text-xs text-slate-500">
              ({analytics?.defectsBySeverity?.Critical ?? 0} tickets)
            </span>
          </div>
          <div className="mt-2 text-xs text-orange-600 font-medium">Severity impact ratio</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm" id="card-resolution-time">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Avg Resolution (MTTR)</span>
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600"><Clock className="w-4 h-4" /></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900">{analytics?.avgResolutionDisplay || 'N/A'}</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">Mean time to resolve</div>
        </div>
      </div>

      {/* Grid 1: Most Common Defect Categories & Most Affected Components */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Common Defect Categories */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-common-categories">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">1. Most Common Defect Categories</h3>
              <p className="text-xs text-slate-500">Frequency breakdown by functional category</p>
            </div>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>

          <div className="space-y-3">
            {analytics?.topCategories && analytics.topCategories.length > 0 ? (
              analytics.topCategories.map((cat) => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-medium">
                    <span className="text-slate-800 font-semibold">{cat.category}</span>
                    <div className="flex items-center gap-2">
                      {cat.criticalCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-200">
                          {cat.criticalCount} critical
                        </span>
                      )}
                      <span className="text-slate-900 font-bold">{cat.count} ({cat.percentage}%)</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">No category data recorded.</div>
            )}
          </div>
        </div>

        {/* Most Affected Components */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-affected-components">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">2. Most Affected Components & Modules</h3>
              <p className="text-xs text-slate-500">Defect density distribution across platform modules</p>
            </div>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>

          <div className="space-y-3">
            {analytics?.affectedComponents && analytics.affectedComponents.length > 0 ? (
              analytics.affectedComponents.map((comp) => (
                <div key={comp.component} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <div className="text-xs font-bold text-slate-900 truncate">{comp.component}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span className="text-rose-600 font-medium">{comp.openDefects} open</span>
                      <span>•</span>
                      <span className="text-emerald-600 font-medium">{comp.resolvedDefects} resolved</span>
                      {comp.criticalDefects > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-orange-600 font-semibold">{comp.criticalDefects} critical</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-bold text-slate-900">{comp.totalDefects}</span>
                    <span className="text-[10px] text-slate-400 block font-medium">({comp.percentage}%)</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">No component records found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Grid 2: Defect Backlog & Aging & MTTR by Severity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Defect Backlog & Aging */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-defect-backlog">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">3. Defect Backlog & Aging Analysis</h3>
              <p className="text-xs text-slate-500">Unresolved defect volume and ticket age distribution</p>
            </div>
            <Hourglass className="w-4 h-4 text-amber-500" />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
              <div className="text-[11px] font-semibold text-emerald-700">&lt; 7 Days</div>
              <div className="text-lg font-bold text-emerald-900 mt-0.5">{analytics?.defectBacklog?.aging?.under7Days ?? 0}</div>
              <div className="text-[10px] text-emerald-600">Fresh defects</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-center">
              <div className="text-[11px] font-semibold text-amber-700">7 – 30 Days</div>
              <div className="text-lg font-bold text-amber-900 mt-0.5">{analytics?.defectBacklog?.aging?.between7And30Days ?? 0}</div>
              <div className="text-[10px] text-amber-600">Pending review</div>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg border border-rose-100 text-center">
              <div className="text-[11px] font-semibold text-rose-700">&gt; 30 Days</div>
              <div className="text-lg font-bold text-rose-900 mt-0.5">{analytics?.defectBacklog?.aging?.over30Days ?? 0}</div>
              <div className="text-[10px] text-rose-600">Stagnant backlog</div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700">Backlog by Priority</div>
            <div className="grid grid-cols-4 gap-2">
              {['Critical', 'High', 'Medium', 'Low'].map((p) => (
                <div key={p} className="p-2 bg-slate-50 rounded border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block">{p}</span>
                  <span className="text-xs font-bold text-slate-800">{analytics?.defectBacklog?.byPriority?.[p] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Average Resolution Time (MTTR) by Severity */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-resolution-time">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">4. Average Resolution Time (MTTR)</h3>
              <p className="text-xs text-slate-500">Mean time from defect report to resolution by severity</p>
            </div>
            <Clock className="w-4 h-4 text-teal-500" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-medium text-slate-500">Overall Platform MTTR</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{analytics?.avgResolutionDisplay || 'N/A'}</div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Computed across all resolved tickets</span>
            </div>
            <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-100">
              <span className="text-xs font-medium text-rose-700">Critical Defect MTTR</span>
              <div className="text-2xl font-bold text-rose-900 mt-1">
                {analytics?.mttrBySeverity?.Critical?.display || 'N/A'}
              </div>
              <span className="text-[10px] text-rose-600 mt-0.5 block">
                {analytics?.mttrBySeverity?.Critical?.count ? `${analytics.mttrBySeverity.Critical.count} critical defects resolved` : 'No critical resolution history'}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">Resolution Speed by Severity Level</div>
            <div className="grid grid-cols-3 gap-2">
              {['High', 'Medium', 'Low'].map((sev) => (
                <div key={sev} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                  <span className="text-[10px] font-semibold text-slate-600 block">{sev}</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5 block">{analytics?.mttrBySeverity?.[sev]?.display || 'N/A'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid 3: Sprint Defect Trends & Developer Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sprint Defect Trends */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-sprint-trends">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">5. Sprint Defect Trends & Velocity</h3>
              <p className="text-xs text-slate-500">Defect resolution completion rate per agile sprint</p>
            </div>
            <Target className="w-4 h-4 text-blue-500" />
          </div>

          <div className="space-y-3">
            {analytics?.sprintDefectTrends && analytics.sprintDefectTrends.length > 0 ? (
              analytics.sprintDefectTrends.map((sp) => (
                <div key={sp.sprintId} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <div className="font-bold text-slate-900">{sp.sprintName}</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${sp.status === 'Active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'}`}>
                        {sp.status}
                      </span>
                      <span className="font-bold text-slate-900">{sp.completionRate}% Done</span>
                    </div>
                  </div>

                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${sp.completionRate}%` }}
                      title={`${sp.resolvedDefects} resolved`}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Total: {sp.totalDefects} defects</span>
                    <span>{sp.openDefects} open • {sp.resolvedDefects} resolved</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">No sprint defect trends recorded.</div>
            )}
          </div>
        </div>

        {/* Developer Workload */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-developer-workload">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">6. Developer Workload & Completion Rate</h3>
              <p className="text-xs text-slate-500">Defect distribution and individual resolution velocity</p>
            </div>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>

          <div className="space-y-3">
            {analytics?.developerWorkload && analytics.developerWorkload.length > 0 ? (
              analytics.developerWorkload.map((dev) => {
                return (
                  <div key={dev.developer} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-800 font-semibold">{dev.developer}</span>
                        <span className="text-[10px] text-emerald-600 font-bold">({dev.completionRate}% resolved)</span>
                      </div>
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
                        style={{ width: `${dev.total > 0 ? (dev.open / dev.total) * 100 : 0}%` }}
                        title={`${dev.open} open`}
                      />
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${dev.total > 0 ? (dev.resolved / dev.total) * 100 : 0}%` }}
                        title={`${dev.resolved} resolved`}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-400 py-6 text-center">No developer workload assignments found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Grid 5: Severity Distribution & Lifecycle Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-severity-distribution">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">7. Severity Distribution</h3>
              <p className="text-xs text-slate-500">Defect impact classification</p>
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

        {/* Lifecycle Status Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-status-distribution">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Defects by Lifecycle Status</h3>
              <p className="text-xs text-slate-500">Pipeline progression status</p>
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
      </div>

      {/* Grid 5: Defect Discovery vs Resolution Velocity Timeline (Insight 8) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="insight-defect-trends">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">8. Defect Discovery vs. Resolution Velocity Timeline</h3>
            <p className="text-xs text-slate-500">Historical trend timeline comparing reported, resolved, and critical defects by date</p>
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
            <span className="flex items-center gap-1.5 text-orange-600">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
              Critical
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[500px] flex items-end gap-3 h-44 pt-4 border-b border-slate-200">
            {analytics?.defectTrends && analytics.defectTrends.length > 0 ? (
              analytics.defectTrends.map((trend) => {
                const repHeight = Math.max(12, Math.round((trend.reported / maxTrend) * 100));
                const resHeight = Math.max(12, Math.round((trend.resolved / maxTrend) * 100));
                const critHeight = trend.critical ? Math.max(10, Math.round((trend.critical / maxTrend) * 100)) : 0;

                return (
                  <div key={trend.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full flex items-end justify-center gap-1 h-32">
                      <div
                        className="w-3.5 bg-rose-500 rounded-t transition-all group-hover:bg-rose-600"
                        style={{ height: `${repHeight}%` }}
                        title={`${trend.date}: ${trend.reported} reported`}
                      />
                      <div
                        className="w-3.5 bg-emerald-500 rounded-t transition-all group-hover:bg-emerald-600"
                        style={{ height: `${resHeight}%` }}
                        title={`${trend.date}: ${trend.resolved} resolved`}
                      />
                      {critHeight > 0 && (
                        <div
                          className="w-3.5 bg-orange-500 rounded-t transition-all group-hover:bg-orange-600"
                          style={{ height: `${critHeight}%` }}
                          title={`${trend.date}: ${trend.critical} critical`}
                        />
                      )}
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
