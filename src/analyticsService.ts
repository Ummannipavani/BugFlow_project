import pg from 'pg';
import { VALID_STATUSES, VALID_SEVERITIES, VALID_PRIORITIES } from './validation';

export interface DefectBacklogSummary {
  totalBacklog: number;
  unassignedCount: number;
  byPriority: Record<string, number>;
  bySeverity: Record<string, number>;
  aging: {
    under7Days: number;
    between7And30Days: number;
    over30Days: number;
  };
}

export interface AffectedComponent {
  component: string;
  totalDefects: number;
  criticalDefects: number;
  resolvedDefects: number;
  openDefects: number;
  percentage: number;
}

export interface RepeatedDefectInsight {
  pattern: string;
  occurrences: number;
  sampleKeys: string[];
  reopenedCount: number;
  isReopened: boolean;
  status: string;
}

export interface SimilarDefectPairInsight {
  sourceId: number;
  sourceKey: string;
  sourceTitle: string;
  targetId: number;
  targetKey: string;
  targetTitle: string;
  category: string;
  similarityScore: number;
  similarityPercentage: number;
}

export interface SprintDefectTrend {
  sprintId: number;
  sprintName: string;
  status: string;
  totalDefects: number;
  openDefects: number;
  resolvedDefects: number;
  criticalDefects: number;
  completionRate: number;
  startDate?: string;
  endDate?: string;
}

export interface DeveloperWorkloadInsight {
  developer: string;
  total: number;
  open: number;
  resolved: number;
  critical: number;
  completionRate: number;
}

export interface AnalyticsSummary {
  totalDefects: number;
  openDefects: number;
  resolvedDefects: number;
  closedDefects: number;
  reopenedDefects: number;
  avgResolutionHours: number | null;
  avgResolutionDisplay: string;
  mttrBySeverity: Record<string, { avgHours: number | null; display: string; count: number }>;
  criticalRatio: number;
  criticalRatioDisplay: string;
  defectsBySeverity: Record<string, number>;
  defectsByCategory: Record<string, number>;
  topCategories: Array<{ category: string; count: number; percentage: number; criticalCount: number }>;
  affectedComponents: AffectedComponent[];
  repeatedDefects: RepeatedDefectInsight[];
  repeatedDefectsCount: number;
  similarDefects: SimilarDefectPairInsight[];
  similarDefectsCount: number;
  defectsByStatus: Record<string, number>;
  defectsByPriority: Record<string, number>;
  defectBacklog: DefectBacklogSummary;
  developerWorkload: DeveloperWorkloadInsight[];
  defectTrends: Array<{
    date: string;
    reported: number;
    resolved: number;
    critical: number;
  }>;
  criticalDefectTrends: Array<{
    date: string;
    criticalCount: number;
  }>;
  sprintDefectTrends: SprintDefectTrend[];
}

function calculateTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

export function computeAnalyticsFromIssues(
  issues: any[],
  registeredDevelopers: string[] = [],
  sprints: any[] = []
): AnalyticsSummary {
  const totalDefects = issues.length;
  let openDefects = 0;
  let resolvedDefects = 0;
  let closedDefects = 0;
  let reopenedDefects = 0;
  let criticalCount = 0;

  const defectsBySeverity: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0
  };

  const defectsByPriority: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0
  };

  const defectsByStatus: Record<string, number> = {};
  for (const s of VALID_STATUSES) {
    defectsByStatus[s] = 0;
  }

  const defectsByCategory: Record<string, number> = {};
  const categoryCriticalMap: Record<string, number> = {};
  const componentMap: Record<string, { total: number; critical: number; resolved: number; open: number }> = {};
  const developerWorkloadMap: Record<string, { total: number; open: number; resolved: number; critical: number }> = {};
  
  // Pre-populate registered developers so developers with 0 defects appear correctly
  for (const dev of registeredDevelopers) {
    if (dev && typeof dev === 'string' && dev.trim()) {
      developerWorkloadMap[dev.trim()] = { total: 0, open: 0, resolved: 0, critical: 0 };
    }
  }

  const trendMap: Record<string, { reported: number; resolved: number; critical: number }> = {};
  const nowMs = Date.now();

  const backlogPriority: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const backlogSeverity: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  let backlogUnassigned = 0;
  let backlogAgingUnder7 = 0;
  let backlogAging7To30 = 0;
  let backlogAgingOver30 = 0;

  let totalResolutionTimeMs = 0;
  let resolvedCountWithTime = 0;
  const mttrSeverityMap: Record<string, { totalTimeMs: number; count: number }> = {
    Critical: { totalTimeMs: 0, count: 0 },
    High: { totalTimeMs: 0, count: 0 },
    Medium: { totalTimeMs: 0, count: 0 },
    Low: { totalTimeMs: 0, count: 0 }
  };

  // Repeated defect pattern tracking
  const repeatedPatternsMap: Record<string, { title: string; keys: string[]; reopenedCount: number; status: string }> = {};

  for (const issue of issues) {
    const status = issue.status || 'Reported';
    const severity = issue.severity || 'Medium';
    const priority = issue.priority || 'Medium';
    const category = (issue.category && typeof issue.category === 'string' && issue.category.trim()) ? issue.category.trim() : 'General';
    const componentName = issue.projectName || issue.project_name || category;
    const assignee = (issue.assigneeName || issue.assignee_name || 'Unassigned').trim();
    const issueKey = issue.key || `BF-${issue.id}`;
    const issueTitle = issue.title || 'Untitled Defect';

    // Status counts
    if (status === 'Closed') {
      closedDefects++;
    } else if (status === 'Resolved' || status === 'Verified') {
      resolvedDefects++;
    } else if (status === 'Reopened') {
      reopenedDefects++;
      openDefects++;
    } else {
      openDefects++;
    }

    if (defectsByStatus[status] !== undefined) {
      defectsByStatus[status]++;
    } else {
      defectsByStatus[status] = 1;
    }

    // Severity & Priority counts
    if (defectsBySeverity[severity] !== undefined) {
      defectsBySeverity[severity]++;
    } else {
      defectsBySeverity[severity] = 1;
    }

    if (severity === 'Critical') {
      criticalCount++;
    }

    if (defectsByPriority[priority] !== undefined) {
      defectsByPriority[priority]++;
    } else {
      defectsByPriority[priority] = 1;
    }

    // Category
    defectsByCategory[category] = (defectsByCategory[category] || 0) + 1;
    if (severity === 'Critical') {
      categoryCriticalMap[category] = (categoryCriticalMap[category] || 0) + 1;
    }

    // Affected components / modules
    if (!componentMap[componentName]) {
      componentMap[componentName] = { total: 0, critical: 0, resolved: 0, open: 0 };
    }
    componentMap[componentName].total++;
    if (severity === 'Critical') componentMap[componentName].critical++;
    if (status === 'Resolved' || status === 'Verified' || status === 'Closed') {
      componentMap[componentName].resolved++;
    } else {
      componentMap[componentName].open++;
    }

    // Developer workload
    if (!developerWorkloadMap[assignee]) {
      developerWorkloadMap[assignee] = { total: 0, open: 0, resolved: 0, critical: 0 };
    }
    developerWorkloadMap[assignee].total++;
    if (status === 'Resolved' || status === 'Verified' || status === 'Closed') {
      developerWorkloadMap[assignee].resolved++;
    } else {
      developerWorkloadMap[assignee].open++;
    }
    if (severity === 'Critical') {
      developerWorkloadMap[assignee].critical++;
    }

    // Trend grouping by creation date
    const createdDate = (issue.createdAt || issue.created_at || '').slice(0, 10);
    if (createdDate && createdDate.length === 10) {
      if (!trendMap[createdDate]) {
        trendMap[createdDate] = { reported: 0, resolved: 0, critical: 0 };
      }
      trendMap[createdDate].reported++;
      if (severity === 'Critical') {
        trendMap[createdDate].critical++;
      }
    }

    // Backlog tracking (Active/Open issues not yet closed or verified/resolved)
    const isOpen = status !== 'Resolved' && status !== 'Verified' && status !== 'Closed';
    if (isOpen) {
      if (!assignee || assignee === 'Unassigned') {
        backlogUnassigned++;
      }
      backlogPriority[priority] = (backlogPriority[priority] || 0) + 1;
      backlogSeverity[severity] = (backlogSeverity[severity] || 0) + 1;

      const createdTime = new Date(issue.createdAt || issue.created_at || Date.now()).getTime();
      const ageDays = (nowMs - createdTime) / (1000 * 3600 * 24);
      if (ageDays < 7) {
        backlogAgingUnder7++;
      } else if (ageDays <= 30) {
        backlogAging7To30++;
      } else {
        backlogAgingOver30++;
      }
    }

    // Parse Activity Logs
    const logs = typeof issue.activityLogs === 'string' 
      ? JSON.parse(issue.activityLogs) 
      : (issue.activityLogs || (typeof issue.activity_logs === 'string' ? JSON.parse(issue.activity_logs) : (issue.activity_logs || [])));

    // Reopened count from logs or status
    let issueReopenedCount = status === 'Reopened' ? 1 : 0;
    for (const log of logs) {
      if (log.actionType === 'STATUS_CHANGE' && log.newValue === 'Reopened') {
        issueReopenedCount++;
      }
    }

    // Repeated pattern grouping by normalized title
    const normalizedTitle = issueTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!repeatedPatternsMap[normalizedTitle]) {
      repeatedPatternsMap[normalizedTitle] = {
        title: issueTitle,
        keys: [],
        reopenedCount: 0,
        status: status
      };
    }
    repeatedPatternsMap[normalizedTitle].keys.push(issueKey);
    repeatedPatternsMap[normalizedTitle].reopenedCount += issueReopenedCount;

    // Resolution Time calculation: ONLY include if currently Resolved, Verified, or Closed
    const isCurrentlyResolved = status === 'Resolved' || status === 'Verified' || status === 'Closed';
    let resolvedTimestamp: string | null = issue.resolved_at || issue.resolvedAt || null;

    for (const log of logs) {
      if (log.actionType === 'STATUS_CHANGE' && (log.newValue === 'Resolved' || log.newValue === 'Verified' || log.newValue === 'Closed')) {
        if (!resolvedTimestamp) {
          resolvedTimestamp = log.timestamp;
        }
        const resDate = (log.timestamp || '').slice(0, 10);
        if (resDate && resDate.length === 10) {
          if (!trendMap[resDate]) trendMap[resDate] = { reported: 0, resolved: 0, critical: 0 };
          trendMap[resDate].resolved++;
        }
        break;
      }
    }

    if (isCurrentlyResolved && resolvedTimestamp && (issue.createdAt || issue.created_at)) {
      const startMs = new Date(issue.createdAt || issue.created_at).getTime();
      const endMs = new Date(resolvedTimestamp).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
        const deltaMs = endMs - startMs;
        totalResolutionTimeMs += deltaMs;
        resolvedCountWithTime++;

        if (mttrSeverityMap[severity]) {
          mttrSeverityMap[severity].totalTimeMs += deltaMs;
          mttrSeverityMap[severity].count++;
        }
      }
    }
  }

  // Calculate Overall MTTR
  const avgResolutionHours = resolvedCountWithTime > 0
    ? Math.round((totalResolutionTimeMs / (resolvedCountWithTime * 3600 * 1000)) * 10) / 10
    : null;

  const avgResolutionDisplay = avgResolutionHours !== null
    ? `${avgResolutionHours} hrs`
    : 'No resolution data';

  // Calculate MTTR by Severity
  const mttrBySeverity: Record<string, { avgHours: number | null; display: string; count: number }> = {};
  for (const sev of ['Critical', 'High', 'Medium', 'Low']) {
    const data = mttrSeverityMap[sev];
    if (data && data.count > 0) {
      const hours = Math.round((data.totalTimeMs / (data.count * 3600 * 1000)) * 10) / 10;
      mttrBySeverity[sev] = {
        avgHours: hours,
        display: `${hours} hrs`,
        count: data.count
      };
    } else {
      mttrBySeverity[sev] = {
        avgHours: null,
        display: 'N/A',
        count: 0
      };
    }
  }

  // Developer Workload with Completion Rate
  const developerWorkload: DeveloperWorkloadInsight[] = Object.entries(developerWorkloadMap).map(([developer, stats]) => ({
    developer,
    ...stats,
    completionRate: stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
  })).sort((a, b) => b.total - a.total);

  // Top Defect Categories
  const topCategories = Object.entries(defectsByCategory).map(([category, count]) => ({
    category,
    count,
    percentage: totalDefects > 0 ? Math.round((count / totalDefects) * 100) : 0,
    criticalCount: categoryCriticalMap[category] || 0
  })).sort((a, b) => b.count - a.count);

  // Most Affected Components
  const affectedComponents: AffectedComponent[] = Object.entries(componentMap).map(([component, stats]) => ({
    component,
    totalDefects: stats.total,
    criticalDefects: stats.critical,
    resolvedDefects: stats.resolved,
    openDefects: stats.open,
    percentage: totalDefects > 0 ? Math.round((stats.total / totalDefects) * 100) : 0
  })).sort((a, b) => b.totalDefects - a.totalDefects);

  // Repeated Defects
  const repeatedDefects: RepeatedDefectInsight[] = Object.values(repeatedPatternsMap)
    .filter(item => item.keys.length > 1 || item.reopenedCount > 0)
    .map(item => ({
      pattern: item.title,
      occurrences: item.keys.length,
      sampleKeys: item.keys.slice(0, 5),
      reopenedCount: item.reopenedCount,
      isReopened: item.reopenedCount > 0,
      status: item.status
    }))
    .sort((a, b) => (b.occurrences + b.reopenedCount) - (a.occurrences + a.reopenedCount));

  // Similar Defects Pair Detection (Real Token / Semantic Overlap)
  const similarDefects: SimilarDefectPairInsight[] = [];
  const checkedPairs = new Set<string>();

  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      const issueA = issues[i];
      const issueB = issues[j];
      const keyPair = `${issueA.id}-${issueB.id}`;
      if (checkedPairs.has(keyPair)) continue;
      checkedPairs.add(keyPair);

      const titleSim = calculateTextSimilarity(
        `${issueA.title || ''} ${issueA.description || ''}`,
        `${issueB.title || ''} ${issueB.description || ''}`
      );

      const sameCategory = (issueA.category || '').toLowerCase() === (issueB.category || '').toLowerCase();
      const finalScore = sameCategory ? Math.min(1.0, titleSim + 0.25) : titleSim;

      if (finalScore >= 0.45) {
        similarDefects.push({
          sourceId: issueA.id,
          sourceKey: issueA.key || `BF-${issueA.id}`,
          sourceTitle: issueA.title || 'Defect',
          targetId: issueB.id,
          targetKey: issueB.key || `BF-${issueB.id}`,
          targetTitle: issueB.title || 'Defect',
          category: issueA.category || issueB.category || 'General',
          similarityScore: Math.round(finalScore * 100) / 100,
          similarityPercentage: Math.round(finalScore * 100)
        });
      }
    }
  }
  similarDefects.sort((a, b) => b.similarityScore - a.similarityScore);

  // Defect Trends & Critical Defect Trends
  const defectTrends = Object.entries(trendMap).map(([date, counts]) => ({
    date,
    reported: counts.reported,
    resolved: counts.resolved,
    critical: counts.critical
  })).sort((a, b) => a.date.localeCompare(b.date));

  const criticalDefectTrends = defectTrends.map(t => ({
    date: t.date,
    criticalCount: t.critical
  }));

  // Sprint Defect Trends
  const sprintMap: Record<number, { name: string; status: string; total: number; open: number; resolved: number; critical: number; startDate?: string; endDate?: string }> = {};
  
  // Prepopulate from actual sprints
  for (const sp of sprints) {
    if (sp && sp.id) {
      sprintMap[sp.id] = {
        name: sp.name || `Sprint ${sp.id}`,
        status: sp.status || 'Active',
        total: 0,
        open: 0,
        resolved: 0,
        critical: 0,
        startDate: sp.startDate || sp.start_date,
        endDate: sp.endDate || sp.end_date
      };
    }
  }

  for (const issue of issues) {
    const spId = issue.sprintId || issue.sprint_id;
    if (spId) {
      if (!sprintMap[spId]) {
        sprintMap[spId] = {
          name: `Sprint ${spId}`,
          status: 'Active',
          total: 0,
          open: 0,
          resolved: 0,
          critical: 0
        };
      }
      sprintMap[spId].total++;
      const isResolved = issue.status === 'Resolved' || issue.status === 'Verified' || issue.status === 'Closed';
      if (isResolved) {
        sprintMap[spId].resolved++;
      } else {
        sprintMap[spId].open++;
      }
      if (issue.severity === 'Critical') {
        sprintMap[spId].critical++;
      }
    }
  }

  const sprintDefectTrends: SprintDefectTrend[] = Object.entries(sprintMap).map(([idStr, data]) => {
    const id = Number(idStr);
    const completionRate = data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0;
    return {
      sprintId: id,
      sprintName: data.name,
      status: data.status,
      totalDefects: data.total,
      openDefects: data.open,
      resolvedDefects: data.resolved,
      criticalDefects: data.critical,
      completionRate,
      startDate: data.startDate,
      endDate: data.endDate
    };
  }).sort((a, b) => b.sprintId - a.sprintId);

  // Critical Ratio
  const criticalRatio = totalDefects > 0 ? Math.round((criticalCount / totalDefects) * 1000) / 10 : 0;
  const criticalRatioDisplay = `${criticalRatio}%`;

  const defectBacklog: DefectBacklogSummary = {
    totalBacklog: openDefects,
    unassignedCount: backlogUnassigned,
    byPriority: backlogPriority,
    bySeverity: backlogSeverity,
    aging: {
      under7Days: backlogAgingUnder7,
      between7And30Days: backlogAging7To30,
      over30Days: backlogAgingOver30
    }
  };

  return {
    totalDefects,
    openDefects,
    resolvedDefects,
    closedDefects,
    reopenedDefects,
    avgResolutionHours,
    avgResolutionDisplay,
    mttrBySeverity,
    criticalRatio,
    criticalRatioDisplay,
    defectsBySeverity,
    defectsByCategory,
    topCategories,
    affectedComponents,
    repeatedDefects,
    repeatedDefectsCount: repeatedDefects.length,
    similarDefects: similarDefects.slice(0, 10),
    similarDefectsCount: similarDefects.length,
    defectsByStatus,
    defectsByPriority,
    defectBacklog,
    developerWorkload,
    defectTrends,
    criticalDefectTrends,
    sprintDefectTrends
  };
}

export async function getPostgreSqlAnalytics(pgPool: pg.Pool, projectId?: number): Promise<AnalyticsSummary> {
  const query = projectId 
    ? `SELECT id, key, title, description, status, priority, severity, category, project_name, project_id, sprint_id, assignee_name, created_at, resolved_at, resolution_notes, activity_logs FROM issues WHERE project_id = $1 OR (project_id IS NULL AND project_name IN (SELECT name FROM projects WHERE id = $1))`
    : `SELECT id, key, title, description, status, priority, severity, category, project_name, project_id, sprint_id, assignee_name, created_at, resolved_at, resolution_notes, activity_logs FROM issues`;
  
  const params = projectId ? [projectId] : [];
  const result = await pgPool.query(query, params);

  // Retrieve registered developers
  let developerNames: string[] = [];
  try {
    const userRes = await pgPool.query("SELECT DISTINCT name FROM users WHERE role = 'Developer' OR role = 'Admin' ORDER BY name ASC");
    developerNames = userRes.rows.map((r: any) => r.name);
  } catch (userErr) {
    console.warn("Notice: could not query users for analytics workload:", (userErr as Error).message);
  }

  // Retrieve sprints
  let sprints: any[] = [];
  try {
    const sprintQuery = projectId
      ? `SELECT id, name, status, start_date as "startDate", end_date as "endDate" FROM sprints WHERE project_id = $1`
      : `SELECT id, name, status, start_date as "startDate", end_date as "endDate" FROM sprints`;
    const sprintRes = await pgPool.query(sprintQuery, projectId ? [projectId] : []);
    sprints = sprintRes.rows;
  } catch (spErr) {
    console.warn("Notice: could not query sprints for analytics trends:", (spErr as Error).message);
  }

  return computeAnalyticsFromIssues(result.rows, developerNames, sprints);
}
