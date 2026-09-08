import pg from 'pg';
import { VALID_STATUSES, VALID_SEVERITIES, VALID_PRIORITIES } from './validation';

export interface AnalyticsSummary {
  totalDefects: number;
  openDefects: number;
  resolvedDefects: number;
  closedDefects: number;
  reopenedDefects: number;
  avgResolutionHours: number | null;
  avgResolutionDisplay: string;
  defectsBySeverity: Record<string, number>;
  defectsByCategory: Record<string, number>;
  defectsByStatus: Record<string, number>;
  defectsByPriority: Record<string, number>;
  developerWorkload: Array<{
    developer: string;
    total: number;
    open: number;
    resolved: number;
    critical: number;
  }>;
  defectTrends: Array<{
    date: string;
    reported: number;
    resolved: number;
  }>;
}

export function computeAnalyticsFromIssues(issues: any[], registeredDevelopers: string[] = []): AnalyticsSummary {
  let totalDefects = issues.length;
  let openDefects = 0;
  let resolvedDefects = 0;
  let closedDefects = 0;
  let reopenedDefects = 0;

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
  const developerWorkloadMap: Record<string, { total: number; open: number; resolved: number; critical: number }> = {};
  
  // Pre-populate registered developers so developers with 0 defects appear correctly
  for (const dev of registeredDevelopers) {
    if (dev && typeof dev === 'string' && dev.trim()) {
      developerWorkloadMap[dev.trim()] = { total: 0, open: 0, resolved: 0, critical: 0 };
    }
  }

  const trendMap: Record<string, { reported: number; resolved: number }> = {};

  let totalResolutionTimeMs = 0;
  let resolvedCountWithTime = 0;

  for (const issue of issues) {
    const status = issue.status || 'Reported';
    const severity = issue.severity || 'Medium';
    const priority = issue.priority || 'Medium';
    const category = (issue.category && typeof issue.category === 'string' && issue.category.trim()) ? issue.category.trim() : 'General';
    const assignee = (issue.assigneeName || issue.assignee_name || 'Unassigned').trim();

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

    if (defectsByPriority[priority] !== undefined) {
      defectsByPriority[priority]++;
    } else {
      defectsByPriority[priority] = 1;
    }

    // Category
    defectsByCategory[category] = (defectsByCategory[category] || 0) + 1;

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
        trendMap[createdDate] = { reported: 0, resolved: 0 };
      }
      trendMap[createdDate].reported++;
    }

    // Resolution Time calculation: ONLY include if currently Resolved, Verified, or Closed
    const isCurrentlyResolved = status === 'Resolved' || status === 'Verified' || status === 'Closed';
    const logs = typeof issue.activityLogs === 'string' 
      ? JSON.parse(issue.activityLogs) 
      : (issue.activityLogs || (typeof issue.activity_logs === 'string' ? JSON.parse(issue.activity_logs) : (issue.activity_logs || [])));

    let resolvedTimestamp: string | null = issue.resolved_at || issue.resolvedAt || null;

    for (const log of logs) {
      if (log.actionType === 'STATUS_CHANGE' && (log.newValue === 'Resolved' || log.newValue === 'Verified' || log.newValue === 'Closed')) {
        if (!resolvedTimestamp) {
          resolvedTimestamp = log.timestamp;
        }
        const resDate = (log.timestamp || '').slice(0, 10);
        if (resDate && resDate.length === 10) {
          if (!trendMap[resDate]) trendMap[resDate] = { reported: 0, resolved: 0 };
          trendMap[resDate].resolved++;
        }
        break;
      }
    }

    if (isCurrentlyResolved && resolvedTimestamp && (issue.createdAt || issue.created_at)) {
      const startMs = new Date(issue.createdAt || issue.created_at).getTime();
      const endMs = new Date(resolvedTimestamp).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
        totalResolutionTimeMs += (endMs - startMs);
        resolvedCountWithTime++;
      }
    }
  }

  const avgResolutionHours = resolvedCountWithTime > 0
    ? Math.round((totalResolutionTimeMs / (resolvedCountWithTime * 3600 * 1000)) * 10) / 10
    : null;

  const avgResolutionDisplay = avgResolutionHours !== null
    ? `${avgResolutionHours} hrs`
    : 'No sufficient data available';

  const developerWorkload = Object.entries(developerWorkloadMap).map(([developer, stats]) => ({
    developer,
    ...stats
  })).sort((a, b) => b.total - a.total);

  const defectTrends = Object.entries(trendMap).map(([date, counts]) => ({
    date,
    reported: counts.reported,
    resolved: counts.resolved
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalDefects,
    openDefects,
    resolvedDefects,
    closedDefects,
    reopenedDefects,
    avgResolutionHours,
    avgResolutionDisplay,
    defectsBySeverity,
    defectsByCategory,
    defectsByStatus,
    defectsByPriority,
    developerWorkload,
    defectTrends
  };
}

export async function getPostgreSqlAnalytics(pgPool: pg.Pool, projectId?: number): Promise<AnalyticsSummary> {
  const query = projectId 
    ? `SELECT id, key, title, status, priority, severity, category, assignee_name, created_at, resolved_at, resolution_notes, activity_logs FROM issues WHERE project_id = $1`
    : `SELECT id, key, title, status, priority, severity, category, assignee_name, created_at, resolved_at, resolution_notes, activity_logs FROM issues`;
  
  const params = projectId ? [projectId] : [];
  const result = await pgPool.query(query, params);

  // Retrieve registered developers so developers with 0 assigned defects are accurately reflected
  let developerNames: string[] = [];
  try {
    const userRes = await pgPool.query("SELECT DISTINCT name FROM users WHERE role = 'Developer' OR role = 'Admin' ORDER BY name ASC");
    developerNames = userRes.rows.map((r: any) => r.name);
  } catch (userErr) {
    console.warn("Notice: could not query users for analytics workload:", (userErr as Error).message);
  }

  return computeAnalyticsFromIssues(result.rows, developerNames);
}
