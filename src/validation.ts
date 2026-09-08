import { Request, Response } from 'express';

// Valid Enumerations
export const VALID_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const VALID_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const VALID_STATUSES = [
  'Reported',
  'Assigned',
  'In Progress',
  'In Review',
  'Resolved',
  'Verified',
  'Closed',
  'Reopened'
];
export const VALID_ROLES = ['Admin', 'Developer', 'User / QA', 'QA', 'User'];
export const VALID_ISSUE_TYPES = ['Bug', 'Security', 'Performance', 'UI/UX', 'Backend/API', 'Database', 'AI Pipeline', 'Task', 'Improvement'];

// Status Transitions Matrix
export const VALID_TRANSITIONS: Record<string, string[]> = {
  'Reported': ['Assigned', 'In Progress', 'Closed'],
  'Open': ['Assigned', 'In Progress', 'Closed'],
  'Assigned': ['In Progress', 'Reported'],
  'In Progress': ['In Review', 'Assigned', 'Reported'],
  'In Review': ['Resolved', 'In Progress', 'Assigned'],
  'Resolved': ['Verified', 'Reopened', 'Closed'],
  'Verified': ['Closed', 'Reopened'],
  'Closed': ['Reopened'],
  'Reopened': ['In Progress', 'Assigned']
};

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim().toLowerCase());
}

export function validateIssuePayload(body: any): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a valid JSON object.' };
  }

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return { valid: false, error: 'Defect title is required and cannot be empty.' };
  }

  if (body.title.trim().length > 255) {
    return { valid: false, error: 'Defect title cannot exceed 255 characters.' };
  }

  if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
    return { valid: false, error: `Invalid severity: '${body.severity}'. Allowed values: ${VALID_SEVERITIES.join(', ')}` };
  }

  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return { valid: false, error: `Invalid priority: '${body.priority}'. Allowed values: ${VALID_PRIORITIES.join(', ')}` };
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return { valid: false, error: `Invalid status: '${body.status}'. Allowed values: ${VALID_STATUSES.join(', ')}` };
  }

  return { valid: true };
}
