import React, { useState, useMemo, useEffect, useRef } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';
import AIChatDrawer from './AIChatDrawer';
import SwaggerDocsView from './SwaggerDocsView';
import { 
  Bug, 
  Bot,
  Plus, 
  Sparkles, 
  MessageSquare, 
  History, 
  Shield, 
  ChevronDown,
  X, 
  Send, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Search,
  Filter,
  Download,
  Trash2,
  FolderPlus,
  Folder,
  User,
  Lock,
  Mail,
  LogOut,
  LayoutDashboard,
  ListTodo,
  Check,
  ChevronRight,
  Layers,
  Tag,
  Smartphone,
  Globe,
  Server,
  AlertTriangle,
  Cpu,
  Zap,
  RotateCcw,
  Paperclip,
  Calendar,
  Flag,
  Target,
  Edit3,
  FileText,
  FileImage,
  FileArchive,
  File,
  Eye,
  Upload,
  BookOpen,
  HelpCircle,
  Archive,
  FileCode,
  ExternalLink,
  Code2,
  Terminal,
  Copy
} from 'lucide-react';

// Strict Defect Lifecycle Transitions Matrix
const VALID_TRANSITIONS = {
  'Reported': ['Assigned', 'In Progress', 'Closed'],
  'Open': ['Assigned', 'In Progress', 'Closed'], // backward compatibility
  'Assigned': ['In Progress', 'Reported'],
  'In Progress': ['In Review', 'Assigned', 'Reported'],
  'In Review': ['Resolved', 'In Progress', 'Assigned'],
  'Resolved': ['Verified', 'Reopened', 'Closed'],
  'Verified': ['Closed', 'Reopened'],
  'Closed': ['Reopened'],
  'Reopened': ['In Progress', 'Assigned']
};

const ALL_STATUSES = ['Reported', 'Assigned', 'In Progress', 'In Review', 'Resolved', 'Verified', 'Closed', 'Reopened'];

const STATUS_COLUMNS = [
  { id: 'Reported', label: 'Reported / Open', color: 'text-slate-600', barColor: 'bg-slate-400', alias: 'Open' },
  { id: 'Assigned', label: 'Assigned', color: 'text-purple-600', barColor: 'bg-purple-500' },
  { id: 'In Progress', label: 'In Progress', color: 'text-blue-600', barColor: 'bg-blue-500' },
  { id: 'In Review', label: 'In Review', color: 'text-amber-600', barColor: 'bg-amber-500' },
  { id: 'Resolved', label: 'Resolved', color: 'text-emerald-600', barColor: 'bg-emerald-500' },
  { id: 'Verified', label: 'Verified', color: 'text-teal-600', barColor: 'bg-teal-500' },
  { id: 'Closed', label: 'Closed', color: 'text-slate-400', barColor: 'bg-slate-500' }
];

export default function Dashboard() {
  // ----------------------------------------------------
  // AUTHENTICATION STATE (STARTS AT SIGN-IN PAGE)
  // ----------------------------------------------------
  const [userSession, setUserSession] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authRole, setAuthRole] = useState('User / QA');

  // Semantic Search State
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState([]);
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false);
  const [semanticSearchCompleted, setSemanticSearchCompleted] = useState(false);

  // ----------------------------------------------------
  // CORE APP STATE & PERSISTENCE
  // ----------------------------------------------------
  const [activeTab, setActiveTab] = useState('Dashboard'); // 'Dashboard' | 'Issues' | 'Sprints' | 'Projects' | 'AI Assistant'
  const [projects, setProjects] = useState([]);
  const [issues, setIssues] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [users, setUsers] = useState([]);
  const [dbStatus, setDbStatus] = useState({ database: 'Connecting...', pgConnected: false, databaseName: 'bugflow_db' });
  const [authBootstrapping, setAuthBootstrapping] = useState(true);
  const [resolutionAidError, setResolutionAidError] = useState('');
  
  // Computed Role Permissions
  const userRole = userSession?.role || 'Developer';
  const isAdmin = userRole === 'Admin';
  const isDeveloper = userRole === 'Developer';
  const isUserQA = userRole === 'User / QA' || userRole === 'User' || userRole === 'QA';

  const getAuthHeaders = (extra = {}) => {
    const token = userSession?.token || localStorage.getItem('bugflow_jwt_token');
    const headers = { ...extra };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (userSession?.role) headers['x-user-role'] = userSession.role;
    if (userSession?.name) headers['x-user-name'] = userSession.name;
    if (userSession?.id) headers['x-user-id'] = String(userSession.id);
    return headers;
  };

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sprintFilter, setSprintFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');

  // Selection & Modals
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [isNewIssueOpen, setIsNewIssueOpen] = useState(false);
  const [isNewSprintOpen, setIsNewSprintOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // AI Chat Assistant Drawer State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatDefectContext, setChatDefectContext] = useState(null);

  // New Issue Form Fields
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueDesc, setNewIssueDesc] = useState('');
  const [newIssuePriority, setNewIssuePriority] = useState('Medium');
  const [newIssueSeverity, setNewIssueSeverity] = useState('Medium');
  const [newIssueEnvironment, setNewIssueEnvironment] = useState('Production');
  const [newIssueType, setNewIssueType] = useState('Bug');
  const [newIssueCategory, setNewIssueCategory] = useState('Frontend');
  const [newIssueProject, setNewIssueProject] = useState('');
  const [newIssueSprint, setNewIssueSprint] = useState('');
  const [newIssueAssignee, setNewIssueAssignee] = useState('');

  // Similar Defects Live Detection
  const [similarDefects, setSimilarDefects] = useState([]);
  const [isCheckingSimilar, setIsCheckingSimilar] = useState(false);

  // New Sprint Form Fields
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintProject, setNewSprintProject] = useState('');
  const [newSprintStartDate, setNewSprintStartDate] = useState('');
  const [newSprintEndDate, setNewSprintEndDate] = useState('');
  const [newSprintGoal, setNewSprintGoal] = useState('');

  // Resolution Assistance State
  const [resolutionAid, setResolutionAid] = useState(null);
  const [isLoadingAid, setIsLoadingAid] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [historicalResolutions, setHistoricalResolutions] = useState([]);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(false);

  // Attachment upload state & file input ref
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef(null);

  // New Issue creation attachments state
  const [newIssueFiles, setNewIssueFiles] = useState([]);
  const newIssueFileInputRef = useRef(null);

  // Comment state
  const [commentText, setCommentText] = useState('');

  // Project creation state
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectCategory, setNewProjectCategory] = useState('Core Platform');

  // AI Refine Simulator State
  const [rawReport, setRawReport] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState(null);
  const [isEnhancingAi, setIsEnhancingAi] = useState(false);

  // Toast System
  const [toast, setToast] = useState(null);
  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3500);
  };

  // ----------------------------------------------------
  // INITIAL BACKEND PERSISTENT DATA FETCHING
  // ----------------------------------------------------
  const reloadAllData = async () => {
    try {
      const [projRes, issueRes, userRes, sprintRes, healthRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/issues'),
        fetch('/api/users'),
        fetch('/api/sprints'),
        fetch('/api/health')
      ]);

      if (projRes.ok) setProjects(await projRes.json());
      if (issueRes.ok) setIssues(await issueRes.json());
      if (userRes.ok) setUsers(await userRes.json());
      if (sprintRes.ok) setSprints(await sprintRes.json());
      if (healthRes.ok) setDbStatus(await healthRes.json());
    } catch (err) {
      console.error('Error fetching persistent data:', err);
    }
  };

  useEffect(() => {
    reloadAllData();
  }, []);

  useEffect(() => {
    if (userSession?.id) reloadAllData();
  }, [userSession?.id]);

  // Restore authenticated session from JWT on page load
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('bugflow_jwt_token');
      const stored = localStorage.getItem('bugflow_user_session');
      if (!token && !stored) {
        setAuthBootstrapping(false);
        return;
      }
      try {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/auth/me', { headers });
        if (res.ok) {
          const data = await res.json();
          const profile = data.user || data;
          const sess = {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            avatar: profile.avatar,
            token: token || (stored ? JSON.parse(stored).token : null)
          };
          setUserSession(sess);
          localStorage.setItem('bugflow_user_session', JSON.stringify(sess));
        } else {
          localStorage.removeItem('bugflow_user_session');
          localStorage.removeItem('bugflow_jwt_token');
        }
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        setAuthBootstrapping(false);
      }
    };
    restoreSession();
  }, []);

  // Load relational attachments when opening a defect detail panel
  useEffect(() => {
    if (!selectedIssue?.id) return;
    let cancelled = false;
    fetch(`/api/issues/${selectedIssue.id}/attachments`)
      .then(res => (res.ok ? res.json() : []))
      .then(atts => {
        if (cancelled || !Array.isArray(atts)) return;
        setSelectedIssue(prev => (prev && prev.id === selectedIssue.id ? { ...prev, attachments: atts } : prev));
        setIssues(prev => prev.map(i => (i.id === selectedIssue.id ? { ...i, attachments: atts } : i)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedIssue?.id]);

  // Reset defect-specific AI suite panel states when a new defect is opened
  useEffect(() => {
    if (selectedIssue) {
      setResolutionAid(null);
      setResolutionAidError('');
      setAiSummary(selectedIssue.aiSummary || '');
      setHistoricalResolutions([]);
      setHistoricalMessage('');
    } else {
      setResolutionAid(null);
      setResolutionAidError('');
      setAiSummary('');
      setHistoricalResolutions([]);
      setHistoricalMessage('');
    }
  }, [selectedIssue?.id]);

  // Check similar defects when user types in issue title
  useEffect(() => {
    if (!newIssueTitle || newIssueTitle.trim().length < 4) {
      setSimilarDefects([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingSimilar(true);
      try {
        const res = await fetch('/api/ai/similar-defects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newIssueTitle,
            description: newIssueDesc,
            category: newIssueCategory,
            severity: newIssueSeverity,
            issueType: newIssueType
          })
        });
        if (res.ok) {
          const data = await res.json();
          setSimilarDefects(data.similar_defects || []);
        }
      } catch (e) {
        console.error('Error checking similar defects:', e);
      } finally {
        setIsCheckingSimilar(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newIssueTitle, newIssueDesc]);

  // Auth Handlers with Real PostgreSQL Backend Authentication
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      showToast('Please enter both email and password', true);
      return;
    }

    if (isRegistering) {
      // Real registration in PostgreSQL
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: authName.trim() || authEmail.split('@')[0],
            email: authEmail.trim(),
            password: authPassword.trim(),
            role: authRole || 'Developer',
          })
        });

        const data = await res.json();
        if (res.ok) {
          const sess = { ...data.user, token: data.token };
          setUserSession(sess);
          localStorage.setItem('bugflow_user_session', JSON.stringify(sess));
          if (data.token) {
            localStorage.setItem('bugflow_jwt_token', data.token);
          }
          showToast(`Account registered in PostgreSQL! Welcome, ${data.user.name}.`);
          reloadAllData();
        } else {
          showToast(data.detail || 'Registration failed', true);
        }
      } catch (err) {
        console.error('Registration network error:', err);
        showToast('Network error during registration', true);
      }
    } else {
      // Real login in PostgreSQL
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authEmail.trim(),
            password: authPassword.trim(),
            role: authRole
          })
        });

        const data = await res.json();
        if (res.ok) {
          const sess = { ...data.user, token: data.token };
          setUserSession(sess);
          localStorage.setItem('bugflow_user_session', JSON.stringify(sess));
          if (data.token) {
            localStorage.setItem('bugflow_jwt_token', data.token);
          }
          showToast(`Welcome back, ${data.user.name} (${data.user.role})!`);
        } else {
          showToast(data.detail || 'Invalid email or password', true);
        }
      } catch (err) {
        console.error('Login network error:', err);
        showToast('Network error during login', true);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      const token = userSession?.token || localStorage.getItem('bugflow_jwt_token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {}
    localStorage.removeItem('bugflow_user_session');
    localStorage.removeItem('bugflow_jwt_token');
    setUserSession(null);
    showToast('Signed out of BugFlow workspace.');
  };

  // Semantic Search Execution
  const handleSemanticSearch = async (queryText) => {
    const q = queryText !== undefined ? queryText : semanticQuery;
    if (!q || !q.trim()) {
      showToast('Please enter a semantic search term or sentence', true);
      return;
    }

    setIsSearchingSemantic(true);
    setSemanticSearchCompleted(false);
    try {
      const res = await fetch('/api/ai/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setSemanticResults(data.results || []);
        setSemanticSearchCompleted(true);
        showToast(`Found ${data.count || 0} semantically relevant defect(s) in PostgreSQL!`);
      } else {
        setSemanticResults([]);
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.detail || 'PostgreSQL semantic search is unavailable', true);
      }
    } catch (err) {
      console.error('Semantic search error:', err);
      showToast('Error connecting to semantic search engine', true);
    } finally {
      setIsSearchingSemantic(false);
    }
  };

  // ----------------------------------------------------
  // DEFECT LIFECYCLE & STATUS HANDLERS
  // ----------------------------------------------------
  const handleStatusTransition = async (issueId, newStatus) => {
    const target = issues.find(i => i.id === issueId);
    if (!target) return;

    if (isUserQA && (newStatus === 'Resolved' || newStatus === 'In Review')) {
      showToast('🔒 Permission Denied: User / QA role cannot directly resolve or review bugs. Only Developers or Admins can transition issues to Resolved or In Review.', true);
      return;
    }

    if (!isAdmin) {
      const allowed = VALID_TRANSITIONS[target.status] || [];
      if (!allowed.includes(newStatus) && !(target.status === 'Open' && allowed.includes(newStatus))) {
        showToast(`Invalid status transition: Cannot move from '${target.status}' directly to '${newStatus}'.`, true);
        return;
      }
    }

    let resolutionNotes;
    if (newStatus === 'Resolved') {
      resolutionNotes = window.prompt(
        'Enter the resolution notes for this defect:',
        target.resolutionNotes || ''
      );
      if (resolutionNotes === null || !resolutionNotes.trim()) {
        showToast('Resolution notes are required before resolving a defect.', true);
        return;
      }
    }

    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: getAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          status: newStatus,
          ...(resolutionNotes ? { resolutionNotes: resolutionNotes.trim() } : {}),
          user_name: userSession?.name || 'User'
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setIssues(prev => prev.map(i => i.id === issueId ? updated : i));
        if (selectedIssue && selectedIssue.id === issueId) {
          setSelectedIssue(updated);
        }
        showToast(`Issue #${issueId} moved to ${newStatus}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.detail || 'Failed to update issue status', true);
      }
    } catch (err) {
      console.error('Status transition error:', err);
      showToast('Failed to connect to server', true);
    }
  };

  const handleUpdateIssueFields = async (issueId, updates) => {
    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: getAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          ...updates,
          user_name: userSession?.name || 'User'
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setIssues(prev => prev.map(i => i.id === issueId ? updated : i));
        if (selectedIssue && selectedIssue.id === issueId) {
          setSelectedIssue(updated);
        }
        showToast(`Issue updated successfully`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.detail || 'Failed to update issue', true);
      }
    } catch (err) {
      console.error('Update issue error:', err);
      showToast('Failed to connect to server', true);
    }
  };

  const handleDeleteIssue = async (issueId) => {
    if (!isAdmin) {
      showToast('🔒 Permission Denied: Only Workspace Admins can delete issues.', true);
      return;
    }

    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        setIssues(prev => prev.filter(i => i.id !== issueId));
        if (selectedIssue && selectedIssue.id === issueId) {
          setSelectedIssue(null);
        }
        showToast(`Deleted issue #${issueId} permanently from PostgreSQL.`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.detail || 'Failed to delete issue', true);
      }
    } catch (err) {
      console.error('Delete issue error:', err);
      showToast('Failed to connect to server', true);
    }
  };

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    if (!newIssueTitle.trim()) return;

    const selectedProjObj = projects.find(p => p.name === newIssueProject) || projects[0];
    const selectedSprintObj = sprints.find(s => s.name === newIssueSprint);

    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          title: newIssueTitle.trim(),
          description: newIssueDesc || `### 📌 Overview\n${newIssueTitle}`,
          priority: newIssuePriority,
          severity: newIssueSeverity || 'Medium',
          environment: newIssueEnvironment || 'Production',
          issueType: newIssueType || 'Bug',
          category: newIssueCategory,
          projectName: selectedProjObj?.name || 'BugFlow Core',
          projectId: selectedProjObj?.id || 1,
          sprintId: selectedSprintObj?.id || null,
          assigneeName: newIssueAssignee || userSession?.name || 'Unassigned',
          assigneeRole: userSession?.role || 'Developer'
        })
      });

      if (res.ok) {
        let created = await res.json();

        // If there are files attached during issue creation, upload them now
        if (newIssueFiles && newIssueFiles.length > 0) {
          const uploadedAtts = [];
          for (const file of newIssueFiles) {
            try {
              const fd = new FormData();
              fd.append('file', file);
              const attRes = await fetch(`/api/issues/${created.id}/attachments`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: fd
              });
              if (attRes.ok) {
                const attData = await attRes.json();
                uploadedAtts.push(attData);
              }
            } catch (attErr) {
              console.warn('Error uploading initial file:', attErr);
            }
          }
          if (uploadedAtts.length > 0) {
            created.attachments = uploadedAtts;
          }
        }

        setIssues(prev => [created, ...prev]);
        setNewIssueTitle('');
        setNewIssueDesc('');
        setNewIssueSeverity('Medium');
        setNewIssueEnvironment('Production');
        setNewIssueType('Bug');
        setNewIssueFiles([]);
        setSimilarDefects([]);
        setIsNewIssueOpen(false);
        showToast(`Issue ${created.key || '#' + created.id} created & saved to PostgreSQL with ${newIssueFiles.length} attachment(s)`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.detail || 'Failed to create issue', true);
      }
    } catch (err) {
      console.error('Create issue error:', err);
      showToast('Failed to connect to server', true);
    }
  };

  // ----------------------------------------------------
  // SPRINTS CRUD & PLANNING
  // ----------------------------------------------------
  const handleCreateSprint = async (e) => {
    e.preventDefault();
    if (!newSprintName.trim()) return;

    const targetProj = projects.find(p => p.name === newSprintProject) || projects[0];

    try {
      const res = await fetch('/api/sprints', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: newSprintName.trim(),
          projectId: targetProj?.id || 1,
          startDate: newSprintStartDate || new Date().toISOString().split('T')[0],
          endDate: newSprintEndDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
          goal: newSprintGoal || 'Sprint delivery goal',
          status: 'Active'
        })
      });

      if (res.ok) {
        const created = await res.json();
        setSprints(prev => [created, ...prev]);
        setNewSprintName('');
        setNewSprintGoal('');
        setIsNewSprintOpen(false);
        showToast(`Sprint "${created.name}" created in PostgreSQL`);
      } else {
        showToast('Failed to create sprint', true);
      }
    } catch (err) {
      console.error('Create sprint error:', err);
      showToast('Failed to connect to server', true);
    }
  };

  const handleDeleteSprint = async (sprintId) => {
    if (!isAdmin) {
      showToast('🔒 Only Admins can delete sprints', true);
      return;
    }
    try {
      const res = await fetch(`/api/sprints/${sprintId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setSprints(prev => prev.filter(s => s.id !== sprintId));
        setIssues(prev => prev.map(i => i.sprintId === sprintId ? { ...i, sprintId: null } : i));
        showToast('Sprint deleted from PostgreSQL');
      }
    } catch (e) {
      showToast('Failed to delete sprint', true);
    }
  };

  // ----------------------------------------------------
  // COMMENTS & ATTACHMENTS
  // ----------------------------------------------------
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedIssue) return;

    try {
      const res = await fetch(`/api/issues/${selectedIssue.id}/comments`, {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          body: commentText.trim(),
          userName: userSession ? userSession.name : 'Anonymous',
          userId: userSession?.id || null
        })
      });

      if (res.ok) {
        const newComment = await res.json();
        const updatedComments = [...(selectedIssue.comments || []), newComment];
        const updatedLogs = [
          { id: Date.now(), issueId: selectedIssue.id, actionType: 'COMMENT_ADDED', oldValue: '', newValue: `Comment added: "${commentText.trim().slice(0, 30)}..."`, userName: userSession?.name || 'User', timestamp: new Date().toISOString() },
          ...(selectedIssue.activityLogs || [])
        ];

        setIssues(prev => prev.map(i => i.id === selectedIssue.id ? { ...i, comments: updatedComments, activityLogs: updatedLogs } : i));
        setSelectedIssue(prev => ({
          ...prev,
          comments: updatedComments,
          activityLogs: updatedLogs
        }));
        setCommentText('');
        showToast('Comment saved to PostgreSQL');
      } else {
        showToast('Failed to post comment', true);
      }
    } catch (err) {
      console.error('Add comment error:', err);
      showToast('Failed to connect to server', true);
    }
  };

  // ----------------------------------------------------
  // REAL FILE ATTACHMENTS & UPLOADS
  // ----------------------------------------------------
  const handleUploadSelectedFile = async (fileToUpload) => {
    if (!fileToUpload || !selectedIssue) return;

    // Client-side quick size validation (20MB)
    if (fileToUpload.size > 20 * 1024 * 1024) {
      showToast('File exceeds maximum size limit of 20MB', true);
      return;
    }

    setIsUploadingAttachment(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);

      const res = await fetch(`/api/issues/${selectedIssue.id}/attachments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      if (res.ok) {
        const newAttachment = await res.json();
        const updatedAttachments = [newAttachment, ...(selectedIssue.attachments || [])];
        const newLog = {
          id: Date.now(),
          issueId: selectedIssue.id,
          actionType: 'ATTACHMENT_UPLOADED',
          oldValue: '',
          newValue: `Uploaded attachment: ${newAttachment.originalName || newAttachment.fileName} (${Math.round(newAttachment.fileSize / 1024)} KB)`,
          userName: userSession?.name || 'User',
          timestamp: new Date().toISOString()
        };
        const updatedLogs = [newLog, ...(selectedIssue.activityLogs || [])];

        setIssues(prev => prev.map(i => i.id === selectedIssue.id ? { ...i, attachments: updatedAttachments, activityLogs: updatedLogs } : i));
        setSelectedIssue(prev => ({
          ...prev,
          attachments: updatedAttachments,
          activityLogs: updatedLogs
        }));

        showToast(`File "${newAttachment.originalName || newAttachment.fileName}" uploaded & persisted!`);
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.detail || 'File upload failed.';
        setUploadError(msg);
        showToast(msg, true);
      }
    } catch (e) {
      console.error('File upload error:', e);
      showToast('Failed to connect to server for file upload', true);
    } finally {
      setIsUploadingAttachment(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachment = async (attachmentId, originalName) => {
    if (!selectedIssue) return;
    if (!window.confirm(`Are you sure you want to remove the attachment "${originalName || 'file'}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const updatedAttachments = (selectedIssue.attachments || []).filter(a => a.id !== attachmentId);
        const newLog = {
          id: Date.now(),
          issueId: selectedIssue.id,
          actionType: 'ATTACHMENT_REMOVED',
          oldValue: originalName,
          newValue: `Removed attachment: ${originalName}`,
          userName: userSession?.name || 'User',
          timestamp: new Date().toISOString()
        };
        const updatedLogs = [newLog, ...(selectedIssue.activityLogs || [])];

        setIssues(prev => prev.map(i => i.id === selectedIssue.id ? { ...i, attachments: updatedAttachments, activityLogs: updatedLogs } : i));
        setSelectedIssue(prev => ({
          ...prev,
          attachments: updatedAttachments,
          activityLogs: updatedLogs
        }));
        showToast(`Attachment "${originalName}" deleted from server and PostgreSQL`);
      } else {
        showToast('Failed to delete attachment', true);
      }
    } catch (e) {
      console.error('Delete attachment error:', e);
      showToast('Failed to delete attachment', true);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    if (!attachment) return;
    try {
      const response = await fetch(`/api/attachments/${attachment.id}?download=true`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Attachment download failed');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = attachment.originalName || attachment.fileName || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      showToast('Failed to download attachment', true);
    }
  };

  // ----------------------------------------------------
  // RESOLUTION ASSISTANCE & AI
  // ----------------------------------------------------
  const [historicalMessage, setHistoricalMessage] = useState('');

  const handleGetResolutionAid = async () => {
    if (!selectedIssue) return;
    setIsLoadingAid(true);
    setResolutionAidError('');
    setResolutionAid(null);
    try {
      const res = await fetch('/api/ai/resolution-assistance', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          issue_id: selectedIssue.id,
          title: selectedIssue.title,
          description: selectedIssue.description,
          category: selectedIssue.category,
          severity: selectedIssue.severity,
          priority: selectedIssue.priority,
          environment: selectedIssue.environment
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResolutionAid(data);
        showToast('AI Investigation Plan generated!');
      } else {
        const msg = data.detail || 'Failed to generate investigation plan.';
        setResolutionAidError(msg);
        showToast(msg, true);
      }
    } catch (e) {
      const msg = 'Failed to connect to AI resolution service.';
      setResolutionAidError(msg);
      showToast(msg, true);
    } finally {
      setIsLoadingAid(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedIssue) return;
    setIsLoadingSummary(true);
    try {
      const res = await fetch('/api/ai/summarize-defect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: selectedIssue.id,
          title: selectedIssue.title,
          description: selectedIssue.description,
          save_to_db: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.summary);
        setSelectedIssue(prev => prev ? { ...prev, aiSummary: data.summary } : null);
        setIssues(prev => prev.map(i => i.id === selectedIssue.id ? { ...i, aiSummary: data.summary } : i));
        showToast('Executive Defect Summary Generated & Saved!');
      }
    } catch (e) {
      showToast('Failed to summarize defect', true);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleFetchHistoricalResolutions = async () => {
    if (!selectedIssue) return;
    setIsLoadingHistorical(true);
    setHistoricalMessage('');
    try {
      const res = await fetch('/api/ai/historical-resolutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedIssue.title,
          description: selectedIssue.description,
          category: selectedIssue.category,
          exclude_id: selectedIssue.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        setHistoricalResolutions(data.historical_resolutions || []);
        if (!data.historical_resolutions || data.historical_resolutions.length === 0) {
          setHistoricalMessage(data.message || 'No relevant historical resolution found.');
          showToast('No relevant historical resolution found.');
        } else {
          showToast(`Retrieved ${data.count || data.historical_resolutions.length} historical resolved defect match(es)`);
        }
      }
    } catch (e) {
      showToast('Failed to retrieve historical resolutions', true);
    } finally {
      setIsLoadingHistorical(false);
    }
  };

  const handleAiEnhanceIssue = async () => {
    if (!newIssueTitle.trim()) {
      showToast('Please enter an issue title first.', true);
      return;
    }
    setIsEnhancingAi(true);
    try {
      const res = await fetch('/api/ai/enhance-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newIssueTitle,
          existing_desc: newIssueDesc,
          user_environment: newIssueEnvironment
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.detailed_description) setNewIssueDesc(data.detailed_description);
        if (data.issue_type) setNewIssueType(data.issue_type);
        if (data.priority) setNewIssuePriority(data.priority);
        if (data.severity) setNewIssueSeverity(data.severity);
        if (data.environment) setNewIssueEnvironment(data.environment);
        showToast('Auto-Generated Bug Spec & Detected Fields with AI!');
      }
    } catch (err) {
      showToast('AI service response error', true);
    } finally {
      setIsEnhancingAi(false);
    }
  };

  const handleRefineWithAi = async () => {
    if (!rawReport.trim()) return;
    setIsAiLoading(true);
    try {
      const res = await fetch('/api/ai/refine-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_report: rawReport })
      });
      if (res.ok) {
        const data = await res.json();
        setAiOutput(data);
        showToast('AI Bug Report Refinement Complete!');
      }
    } catch (e) {
      showToast('Failed to refine bug report', true);
    } finally {
      setIsAiLoading(false);
    }
  };

  // ----------------------------------------------------
  // PROJECTS CRUD
  // ----------------------------------------------------
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('🔒 Only Workspace Admins can create projects.', true);
      return;
    }
    if (!newProjectName.trim()) return;

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          name: newProjectName.trim(),
          key: newProjectKey.trim() || undefined,
          description: newProjectDesc.trim(),
          category: newProjectCategory
        })
      });

      if (res.ok) {
        const created = await res.json();
        setProjects(prev => [created, ...prev]);
        setNewProjectName('');
        setNewProjectKey('');
        setNewProjectDesc('');
        showToast(`Project "${created.name}" stored permanently in PostgreSQL`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.detail || 'Failed to create project', true);
      }
    } catch (err) {
      console.error('Create project error:', err);
      showToast('Failed to connect to server', true);
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    if (!editingProject) return;

    try {
      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          name: editingProject.name,
          description: editingProject.description,
          category: editingProject.category
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
        setEditingProject(null);
        showToast(`Project "${updated.name}" updated in PostgreSQL`);
      }
    } catch (err) {
      showToast('Failed to update project', true);
    }
  };

  const handleDeleteProject = async (projId) => {
    if (!isAdmin) {
      showToast('🔒 Only Admins can delete projects.', true);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== projId));
        setIssues(prev => prev.filter(i => i.projectId !== projId));
        showToast(`Project and associated issues deleted from PostgreSQL`);
      }
    } catch (err) {
      showToast('Failed to delete project', true);
    }
  };

  // ----------------------------------------------------
  // COMPUTED / FILTERED DATA
  // ----------------------------------------------------
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        !searchQuery ||
        issue.title.toLowerCase().includes(query) ||
        (issue.description && issue.description.toLowerCase().includes(query)) ||
        (issue.category && issue.category.toLowerCase().includes(query)) ||
        (issue.projectName && issue.projectName.toLowerCase().includes(query)) ||
        (issue.key && issue.key.toLowerCase().includes(query));

      const matchesPriority = priorityFilter === 'ALL' || issue.priority === priorityFilter;
      const matchesSeverity = severityFilter === 'ALL' || issue.severity === severityFilter;
      const matchesCategory = categoryFilter === 'ALL' || issue.category === categoryFilter;
      const targetProjName = projectFilter !== 'ALL' ? projects.find(p => String(p.id) === String(projectFilter) || p.name === projectFilter)?.name : null;
      const matchesProject = projectFilter === 'ALL' || 
        String(issue.projectId) === String(projectFilter) || 
        issue.projectName === projectFilter ||
        (Boolean(targetProjName) && issue.projectName === targetProjName);
      const matchesStatus = statusFilter === 'ALL' || issue.status === statusFilter;

      return matchesSearch && matchesPriority && matchesSeverity && matchesCategory && matchesSprint && matchesProject && matchesStatus;
    });
  }, [issues, projects, searchQuery, priorityFilter, severityFilter, categoryFilter, sprintFilter, projectFilter, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: issues.length,
      reported: issues.filter(i => i.status === 'Reported' || i.status === 'Open').length,
      assigned: issues.filter(i => i.status === 'Assigned').length,
      inProgress: issues.filter(i => i.status === 'In Progress').length,
      inReview: issues.filter(i => i.status === 'In Review').length,
      resolved: issues.filter(i => i.status === 'Resolved').length,
      verified: issues.filter(i => i.status === 'Verified').length,
      closed: issues.filter(i => i.status === 'Closed').length,
    };
  }, [issues]);

  const categories = useMemo(() => {
    const set = new Set(issues.map(i => i.category).filter(Boolean));
    return Array.from(set);
  }, [issues]);

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'Critical': return 'bg-red-600 text-white border-red-700 font-bold';
      case 'High': return 'bg-orange-600 text-white border-orange-700 font-semibold';
      case 'Medium': return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      case 'Low': return 'bg-sky-100 text-sky-800 border-sky-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Reported':
      case 'Open': return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'Assigned': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'In Progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'In Review': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Resolved': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Verified': return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'Closed': return 'bg-slate-200 text-slate-600 border-slate-300';
      case 'Reopened': return 'bg-rose-100 text-rose-800 border-rose-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const exportCsv = () => {
    const headers = ['Key', 'Title', 'Status', 'Priority', 'Severity', 'Category', 'Project', 'Sprint', 'Assignee'];
    const rows = filteredIssues.map(i => [
      i.key,
      `"${i.title.replace(/"/g, '""')}"`,
      i.status,
      i.priority,
      i.severity,
      i.category,
      i.projectName,
      i.sprintId ? `Sprint #${i.sprintId}` : 'Backlog',
      i.assigneeName
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'bugflow_defects_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported issues to CSV');
  };

  // ----------------------------------------------------
  // RENDER: AUTHENTICATION SCREEN (IF NOT LOGGED IN)
  // ----------------------------------------------------
  if (!userSession) {
    if (authBootstrapping) {
      return (
        <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col justify-center items-center p-4 font-sans text-slate-900">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-xs font-semibold text-slate-500">Restoring workspace session...</p>
        </div>
      );
    }

    return (
      <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col justify-center items-center p-4 font-sans text-slate-900 select-none">
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg border text-xs font-semibold ${
            toast.isError ? 'bg-red-900 text-red-100 border-red-700' : 'bg-slate-900 text-emerald-300 border-slate-800'
          }`}>
            {toast.isError ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {toast.msg}
          </div>
        )}

        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-lg text-white mb-3 shadow-md">
              <Bug className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-snug">
              Intelligent Software Defect Tracking System
            </h1>
            <p className="text-xs text-blue-600 font-semibold mt-0.5">with Resolution Assistance</p>
            <p className="text-[11px] text-slate-500 mt-1">Full-Stack Defect Lifecycle Management</p>
          </div>

          <div className="flex border-b border-slate-200 bg-slate-100/60 p-1">
            <button
              onClick={() => setIsRegistering(false)}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition ${
                !isRegistering ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsRegistering(true)}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition ${
                isRegistering ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="alex.rivera@bugflow.io"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {isRegistering && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required={isRegistering}
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Account Role</label>
              <div className="relative">
                <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <select
                  value={authRole}
                  onChange={(e) => setAuthRole(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  required
                >
                  <option value="Admin">Admin</option>
                  <option value="Developer">Developer</option>
                  <option value="User / QA">User / QA</option>
                </select>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {isRegistering ? 'Select your role (Admin, Developer, or User / QA).' : 'Select the role assigned to your registered account.'}
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <span>{isRegistering ? 'Register & Enter Workspace' : 'Sign In to Workspace'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: MAIN APPLICATION LAYOUT
  // ----------------------------------------------------
  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] font-sans text-slate-900 overflow-hidden select-none">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg border text-xs font-semibold ${
          toast.isError ? 'bg-red-900 text-red-100 border-red-700' : 'bg-slate-900 text-emerald-300 border-slate-800'
        }`}>
          {toast.isError ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toast.msg}
        </div>
      )}

      {/* Top Header Bar */}
      <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0">
        {/* Left: Project Branding & Official Role Indicator */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold shadow-2xs">
              <Bug className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-slate-900 leading-none">
                Intelligent Defect Tracking
              </span>
              <span className="text-[10px] font-semibold text-blue-600 tracking-tight">
                with Resolution Assistance
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center border-l border-slate-200 pl-4">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                isAdmin 
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : isDeveloper
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
              title={`Logged-in account role: ${userRole}`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>{userRole}</span>
            </span>
          </div>
        </div>

        {/* Right: Essential Global Actions (New Issue, User Profile & Menu) */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsNewIssueOpen(true)}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Issue</span>
          </button>

          {/* User Profile Menu & Logout */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer border border-transparent hover:border-slate-200 text-left"
              title="Account Menu"
            >
              <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                {userSession?.name ? userSession.name.charAt(0) : <User className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden md:flex flex-col">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {userSession?.name || 'Workspace User'}
                </span>
                <span className="text-[10px] text-slate-400 leading-none">
                  {userSession?.email || 'Active Account'}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/60">
                  <p className="font-bold text-slate-900 truncate">{userSession?.name || 'Workspace User'}</p>
                  <p className="text-[11px] text-slate-500 truncate">{userSession?.email || 'user@bugflow.io'}</p>
                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200/80 text-slate-700">
                    <Shield className="w-3 h-3" />
                    <span>Role: {userRole}</span>
                  </div>
                </div>

                <div className="px-1.5 py-1">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-semibold transition cursor-pointer text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar Navigation */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Bar */}
        <aside className="w-48 bg-white border-r border-slate-200 p-3 space-y-1 shrink-0 flex flex-col justify-between">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('Dashboard')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'Dashboard' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('Issues')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'Issues' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <ListTodo className="w-4 h-4" />
                <span>Issues Board</span>
              </div>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                {issues.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('Sprints')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'Sprints' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Target className="w-4 h-4 text-purple-600" />
                <span>Sprint Planning</span>
              </div>
              <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                {sprints.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('Projects')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'Projects' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Folder className="w-4 h-4 text-amber-600" />
                <span>Projects</span>
              </div>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                {projects.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('Swagger')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'Swagger'
                  ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <FileCode className="w-4 h-4 text-emerald-600" />
                <span>Swagger API Docs</span>
              </div>
              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono">
                OAS 3.0
              </span>
            </button>

            <button
              onClick={() => {
                setChatDefectContext(null);
                setIsChatOpen(true);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 transition cursor-pointer shadow-2xs"
            >
              <div className="flex items-center space-x-2.5">
                <Bot className="w-4 h-4 text-purple-600 animate-pulse" />
                <span className="font-bold">AI Assistant</span>
              </div>
              <span className="bg-purple-200/80 text-purple-900 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                Chat
              </span>
            </button>

            <button
              onClick={() => setActiveTab('AI Assistant')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'AI Assistant' ? 'bg-purple-50 text-purple-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
              <span>AI QA Refiner</span>
            </button>
          </nav>

          {/* Database Diagnostics Footer */}
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[10px] text-slate-500 space-y-1">
            <div className="flex items-center justify-between font-bold text-slate-700">
              <span>PostgreSQL Schema</span>
              <span className="text-emerald-600">● LIVE</span>
            </div>
            <p className="truncate text-slate-500 font-mono text-[9px]">{dbStatus.databaseName}</p>
            <div className="pt-1 border-t border-slate-200 text-[9px] text-slate-400">
              Tables: Users, Projects, Sprints, Issues, Comments, Attachments, Logs
            </div>
          </div>
        </aside>

        {/* Content View Container */}
        <main className="flex-1 overflow-y-auto p-5">
          {/* ========================================================= */}
          {/* VIEW A: DASHBOARD VIEW (REAL POSTGRESQL ANALYTICS)         */}
          {/* ========================================================= */}
          {activeTab === 'Dashboard' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <AnalyticsDashboard
                projects={projects}
                activeProjectId={projectFilter !== 'ALL' ? Number(projectFilter) : undefined}
                onSelectProject={(id) => setProjectFilter(id ? String(id) : 'ALL')}
              />

              {/* Active Sprints and Projects Health Quick Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                {/* Active Sprints */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-purple-600" />
                      <span>Active Sprints</span>
                    </h2>
                    <button onClick={() => setActiveTab('Sprints')} className="text-xs text-blue-600 font-semibold hover:underline">
                      View All
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {sprints.map(s => {
                      const sprintIssues = issues.filter(i => i.sprintId === s.id);
                      const resolved = sprintIssues.filter(i => i.status === 'Resolved' || i.status === 'Verified' || i.status === 'Closed').length;
                      const progress = sprintIssues.length ? Math.round((resolved / sprintIssues.length) * 100) : 0;

                      return (
                        <div key={s.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-bold text-slate-800">{s.name}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">{s.status}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mb-2">{s.goal}</p>
                          <div className="flex justify-between text-[10px] text-slate-600 mb-1 font-semibold">
                            <span>Progress ({resolved}/{sprintIssues.length} Completed)</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-purple-600 rounded-full" style={{ width: `${progress}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Projects Health */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Folder className="w-4 h-4 text-amber-600" />
                      <span>Project Repositories</span>
                    </h2>
                    <button onClick={() => setActiveTab('Projects')} className="text-xs text-blue-600 font-semibold hover:underline">
                      Manage
                    </button>
                  </div>
                  <div className="space-y-3">
                    {projects.map(proj => {
                      const projIssues = issues.filter(i => (i.projectId ? Number(i.projectId) === Number(proj.id) : i.projectName === proj.name));
                      const resolvedCount = projIssues.filter(i => i.status === 'Resolved' || i.status === 'Verified' || i.status === 'Closed').length;
                      const percent = projIssues.length ? Math.round((resolvedCount / projIssues.length) * 100) : 0;

                      return (
                        <div key={proj.id} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-800">{proj.name} <span className="text-slate-400 font-mono">({proj.key})</span></span>
                            <span className="text-slate-500 font-mono">{resolvedCount}/{projIssues.length} Done ({percent}% resolved)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW B: ISSUES BOARD VIEW                                 */}
          {/* ========================================================= */}
          {activeTab === 'Issues' && (
            <div className="space-y-4 flex flex-col h-full">
              {/* Header */}
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Defect Tracking & Lifecycle Pipeline</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Filter, transition, and manage defects across all PostgreSQL lifecycle stages</p>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={exportCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Export CSV
                  </button>
                  <button
                    onClick={() => setIsNewIssueOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 rounded text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Issue
                  </button>
                </div>
              </div>

              {/* Filtering Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Title, Key, Description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>

                {/* Priority Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">Priority:</span>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="bg-slate-50 text-xs rounded-lg px-2 py-1 border border-slate-200 text-slate-800 font-semibold focus:outline-none"
                  >
                    <option value="ALL">All</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {/* Severity Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">Severity:</span>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="bg-slate-50 text-xs rounded-lg px-2 py-1 border border-slate-200 text-slate-800 font-semibold focus:outline-none"
                  >
                    <option value="ALL">All</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {/* Sprint Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-purple-700">Sprint:</span>
                  <select
                    value={sprintFilter}
                    onChange={(e) => setSprintFilter(e.target.value)}
                    className="bg-purple-50 text-xs rounded-lg px-2 py-1 border border-purple-200 text-purple-800 font-semibold focus:outline-none"
                  >
                    <option value="ALL">All Sprints</option>
                    <option value="BACKLOG">Backlog (Unassigned)</option>
                    {sprints.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Project Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">Project:</span>
                  <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="bg-slate-50 text-xs rounded-lg px-2 py-1 border border-slate-200 text-slate-800 font-semibold focus:outline-none"
                  >
                    <option value="ALL">All Projects</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Kanban Multi-Column Board */}
              <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 min-w-[1120px] gap-3.5 pb-2 h-full">
                {STATUS_COLUMNS.map(col => {
                  const columnIssues = filteredIssues.filter(i => i.status === col.id || (col.alias && i.status === col.alias));

                  return (
                    <div key={col.id} className="flex flex-col bg-slate-100/70 rounded-xl p-2.5 border border-slate-200/80 overflow-hidden">
                      <div className="flex items-center justify-between px-2 mb-2.5 shrink-0">
                        <h3 className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                          {col.label} ({columnIssues.length})
                        </h3>
                        <div className={`w-1.5 h-4 ${col.barColor} rounded-full`}></div>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                        {columnIssues.map(issue => {
                          const allowedNext = VALID_TRANSITIONS[issue.status] || [];

                          return (
                            <div
                              key={issue.id}
                              onClick={() => setSelectedIssue(issue)}
                              className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2 hover:border-blue-400 hover:shadow-xs transition cursor-pointer group"
                            >
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] font-mono text-slate-400 font-bold">{issue.key}</span>
                                <div className="flex items-center gap-1">
                                  <span className={`px-1.5 py-0.5 text-[8px] rounded uppercase border ${getSeverityBadge(issue.severity)}`}>
                                    {issue.severity}
                                  </span>
                                  <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase border ${getPriorityBadge(issue.priority)}`}>
                                    {issue.priority}
                                  </span>
                                </div>
                              </div>

                              <p className="text-xs font-bold leading-tight text-slate-800 group-hover:text-blue-600 transition line-clamp-2">
                                {issue.title}
                              </p>

                              <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-medium">
                                  {issue.category}
                                </span>
                                <div className="flex items-center space-x-1">
                                  <div className="w-4 h-4 rounded-full bg-blue-600 text-white font-bold text-[8px] flex items-center justify-center">
                                    {issue.assigneeName ? issue.assigneeName[0] : 'U'}
                                  </div>
                                  <span className="text-slate-600 font-medium truncate max-w-[80px]">
                                    {issue.assigneeName || 'Unassigned'}
                                  </span>
                                </div>
                              </div>

                              {allowedNext.length > 0 && (
                                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                                  <span className="text-[9px] text-slate-400 font-medium">Move:</span>
                                  <div className="flex gap-1">
                                    {allowedNext.slice(0, 2).map(targetStatus => (
                                      <button
                                        key={targetStatus}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStatusTransition(issue.id, targetStatus);
                                        }}
                                        className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[9px] font-bold rounded border border-blue-200 transition cursor-pointer"
                                      >
                                        → {targetStatus}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {columnIssues.length === 0 && (
                          <div className="h-24 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400 font-medium bg-slate-50/50">
                            No issues in stage
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW C: SPRINT PLANNING VIEW                              */}
          {/* ========================================================= */}
          {activeTab === 'Sprints' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sprint Planning & Iteration Board</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Plan sprints, assign defects, and track goal delivery</p>
                </div>
                <button
                  onClick={() => setIsNewSprintOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Sprint</span>
                </button>
              </div>

              {/* Sprints List */}
              <div className="space-y-4">
                {sprints.map(sprint => {
                  const sprintIssues = issues.filter(i => i.sprintId === sprint.id);

                  return (
                    <div key={sprint.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <Target className="w-5 h-5 text-purple-600" />
                            <h2 className="text-base font-bold text-slate-900">{sprint.name}</h2>
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                              {sprint.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{sprint.goal}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {sprint.startDate} to {sprint.endDate}
                            </span>
                            <span>{sprintIssues.length} Assigned Defects</span>
                          </div>
                        </div>

                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteSprint(sprint.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold p-1 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Sprint Issues Table */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">Key</th>
                              <th className="p-2.5">Title</th>
                              <th className="p-2.5">Status</th>
                              <th className="p-2.5">Priority</th>
                              <th className="p-2.5">Assignee</th>
                              <th className="p-2.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sprintIssues.map(issue => (
                              <tr key={issue.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                                <td className="p-2.5 font-mono font-bold text-slate-400">{issue.key}</td>
                                <td className="p-2.5 font-semibold text-slate-800">{issue.title}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getStatusBadge(issue.status)}`}>
                                    {issue.status}
                                  </span>
                                </td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${getPriorityBadge(issue.priority)}`}>
                                    {issue.priority}
                                  </span>
                                </td>
                                <td className="p-2.5 text-slate-600">{issue.assigneeName || 'Unassigned'}</td>
                                <td className="p-2.5 text-right">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateIssueFields(issue.id, { sprintId: null });
                                    }}
                                    className="text-[10px] text-slate-500 hover:text-red-600 font-semibold"
                                  >
                                    Move to Backlog
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {sprintIssues.length === 0 && (
                              <tr>
                                <td colSpan={6} className="p-4 text-center text-slate-400 text-xs">
                                  No defects assigned to this sprint yet. Assign defects from the Issue Board.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW D: PROJECTS VIEW                                     */}
          {/* ========================================================= */}
          {activeTab === 'Projects' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Projects</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Manage active project repositories, database modules, and defect assignments.</p>
                </div>
              </div>

              {/* Inline Create Project Form */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                  <span>Create New Project</span>
                </h2>
                <form onSubmit={handleCreateProject} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Project Name *</label>
                      <input
                        type="text"
                        required
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="e.g. Mobile Payment SDK"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium focus:outline-none focus:border-blue-500 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Project Key (Prefix)</label>
                      <input
                        type="text"
                        value={newProjectKey}
                        onChange={(e) => setNewProjectKey(e.target.value.toUpperCase())}
                        placeholder="e.g. PAY"
                        maxLength={6}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold focus:outline-none focus:border-blue-500 uppercase text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                      <select
                        value={newProjectCategory}
                        onChange={(e) => setNewProjectCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-none text-slate-800"
                      >
                        <option value="Core Platform">Core Platform</option>
                        <option value="Backend">Backend / API</option>
                        <option value="Frontend">Frontend / Web</option>
                        <option value="Mobile">Mobile (iOS/Android)</option>
                        <option value="Security">Security & Auth</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={newProjectDesc}
                      onChange={(e) => setNewProjectDesc(e.target.value)}
                      placeholder="Brief overview of repository scope..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium focus:outline-none focus:border-blue-500 text-slate-900"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!isAdmin}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                    >
                      {isAdmin ? 'Save Project to Database' : '🔒 Admin Role Required to Create'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Projects Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {projects.map(p => (
                  <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                          {p.key}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-1">{p.name}</h3>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteProject(p.id)}
                          className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{p.description}</p>
                    <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-400">
                      <span>{p.category}</span>
                      <span className="font-semibold text-slate-700">
                        {issues.filter(i => (i.projectId ? Number(i.projectId) === Number(p.id) : i.projectName === p.name)).length} Defects
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW E: AI ASSISTANT & SEMANTIC SEARCH VIEW               */}
          {/* ========================================================= */}
          {activeTab === 'AI Assistant' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Section 1: Semantic Search */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <Search className="w-4 h-4 text-blue-600" />
                      <span>PostgreSQL Semantic Defect Search Engine</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Search defects across the cloud database using natural language and semantic relevance.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                    PostgreSQL + Vector
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={semanticQuery}
                        onChange={(e) => setSemanticQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
                        placeholder="Search conceptually, e.g., 'OAuth token redirect failure', 'Audit log database missing', 'Favicon manifest'..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => handleSemanticSearch()}
                      disabled={isSearchingSemantic || !semanticQuery.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSearchingSemantic ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>Search DB</span>
                    </button>
                  </div>

                  {/* Sample Query Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Try Presets:</span>
                    {[
                      'OAuth redirect loop',
                      'ActivityLog audit record',
                      'Gemini refinement pipeline',
                      'Favicon metadata',
                      'PostgreSQL migrations schema'
                    ].map(preset => (
                      <button
                        key={preset}
                        onClick={() => {
                          setSemanticQuery(preset);
                          handleSemanticSearch(preset);
                        }}
                        className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition cursor-pointer border border-slate-200"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Semantic Results */}
                {semanticResults.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">Matching PostgreSQL Defects ({semanticResults.length})</span>
                      <span className="text-[11px] text-slate-400">Ranked by Semantic Relevance Score</span>
                    </div>

                    <div className="space-y-2">
                      {semanticResults.map((result) => (
                        <div
                          key={result.id}
                          onClick={() => setSelectedIssue(result)}
                          className="p-3 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-lg transition cursor-pointer flex justify-between items-center group"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold text-slate-500">{result.key}</span>
                              <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition">{result.title}</h4>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${getStatusBadge(result.status)}`}>
                                {result.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-1">{result.description}</p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <div className="text-right">
                              <span className="text-xs font-bold text-purple-700 font-mono">
                                {result.similarity_percentage ?? Math.round((result.similarity_score || 0) * 100)}%
                              </span>
                              <div className="text-[9px] text-slate-400 uppercase font-semibold">Match</div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {semanticSearchCompleted && semanticResults.length === 0 && (
                  <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 text-center">
                    No relevant defects found for this search.
                  </div>
                )}
              </div>

              {/* Section 2: Gemini Report Refiner */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div>
                  <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>Gemini QA Report Refiner & Assistant</span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">Transform raw, messy bug notes into rigorous QA specs</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Raw Bug Input</label>
                  <textarea
                    rows={4}
                    value={rawReport}
                    onChange={(e) => setRawReport(e.target.value)}
                    placeholder="e.g. When the user taps login twice quickly, the app crashes with null pointer on token..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={handleRefineWithAi}
                  disabled={isAiLoading || !rawReport.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition shadow-2xs flex items-center gap-2 cursor-pointer"
                >
                  {isAiLoading ? <Clock className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Refine Bug Report with Gemini AI</span>
                </button>

                {aiOutput && (
                  <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200 space-y-3 mt-4">
                    <h3 className="text-xs font-bold text-purple-900 uppercase tracking-wider">Refined Specification</h3>
                    <div className="p-3 bg-white rounded-lg border border-purple-100 text-xs font-mono text-slate-800 whitespace-pre-wrap">
                      {aiOutput.refined_markdown}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW F: SWAGGER UI & INTERACTIVE API DOCUMENTATION        */}
          {/* ========================================================= */}
          {activeTab === 'Swagger' && (
            <SwaggerDocsView userSession={userSession} showToast={showToast} />
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* MODAL: ISSUE DETAILS VIEW                                 */}
      {/* ========================================================= */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-slate-400">{selectedIssue.key}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusBadge(selectedIssue.status)}`}>
                  {selectedIssue.status}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getPriorityBadge(selectedIssue.priority)}`}>
                  {selectedIssue.priority}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getSeverityBadge(selectedIssue.severity)}`}>
                  {selectedIssue.severity}
                </span>
              </div>
              <button onClick={() => setSelectedIssue(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div>
                <h2 className="text-base font-bold text-slate-900">{selectedIssue.title}</h2>
                <div className="flex flex-wrap gap-4 mt-2 text-slate-500 text-xs">
                  <span>Project: <strong className="text-slate-700">{selectedIssue.projectName}</strong></span>
                  <span>Category: <strong className="text-slate-700">{selectedIssue.category}</strong></span>
                  <span>Assignee: <strong className="text-slate-700">{selectedIssue.assigneeName || 'Unassigned'}</strong></span>
                  <span>Sprint: <strong className="text-purple-700">{selectedIssue.sprintId ? `Sprint #${selectedIssue.sprintId}` : 'Backlog'}</strong></span>
                </div>
              </div>

              {/* Status Transition Buttons */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Defect Lifecycle Workflow Actions:</span>
                <div className="flex flex-wrap gap-2">
                  {(VALID_TRANSITIONS[selectedIssue.status] || []).map(nextStatus => (
                    <button
                      key={nextStatus}
                      onClick={() => handleStatusTransition(selectedIssue.id, nextStatus)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>Transition to {nextStatus}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution Assistance & AI Suite Block */}
              <div className="p-3.5 bg-gradient-to-br from-purple-50/80 to-indigo-50/60 rounded-xl border border-purple-200 space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-purple-900">
                    <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
                    <span>Gemini AI Resolution & Intelligence Suite</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => {
                        setChatDefectContext(selectedIssue);
                        setIsChatOpen(true);
                      }}
                      className="px-2.5 py-1 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 shadow-2xs"
                      title="Open AI Chat focused on this defect"
                    >
                      <Bot className="w-3.5 h-3.5 text-purple-200 animate-pulse" />
                      <span>Ask AI About This Defect</span>
                    </button>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isLoadingSummary}
                      className="px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-700 border border-purple-300 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 shadow-2xs"
                    >
                      {isLoadingSummary ? <Clock className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                      <span>Executive Summary</span>
                    </button>
                    <button
                      onClick={handleFetchHistoricalResolutions}
                      disabled={isLoadingHistorical}
                      className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 shadow-2xs"
                    >
                      {isLoadingHistorical ? <Clock className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                      <span>Similar Past Fixes</span>
                    </button>
                    <button
                      onClick={handleGetResolutionAid}
                      disabled={isLoadingAid}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 shadow-2xs"
                    >
                      {isLoadingAid ? <Clock className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      <span>Investigation Plan</span>
                    </button>
                  </div>
                </div>

                {/* AI Executive Summary */}
                {(aiSummary || selectedIssue.aiSummary) && (
                  <div className="p-3 bg-white rounded-lg border border-purple-200 text-xs space-y-1 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-purple-800 font-bold text-[11px]">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Executive Defect Summary (AI Generated)</span>
                    </div>
                    <p className="text-slate-700 text-[11px] leading-relaxed">{aiSummary || selectedIssue.aiSummary}</p>
                  </div>
                )}

                {/* Investigation plan loading / error states */}
                {isLoadingAid && !resolutionAid && (
                  <div className="p-3 bg-white rounded-lg border border-purple-200 text-xs flex items-center gap-2 text-purple-700">
                    <Clock className="w-4 h-4 animate-spin shrink-0" />
                    <span>Generating AI investigation plan for this defect...</span>
                  </div>
                )}
                {resolutionAidError && !resolutionAid && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{resolutionAidError}</span>
                  </div>
                )}

                {/* AI Resolution Recommendation & Investigation Areas */}
                {resolutionAid && (
                  <div className="p-3.5 bg-white rounded-lg border border-purple-200 text-xs space-y-3 animate-in fade-in">
                    {/* Disclaimer Banner */}
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold">AI Suggested Resolution:</strong> These recommendations and investigation areas are suggestions only to assist developers. The developer remains responsible for determining the actual root cause.
                      </div>
                    </div>

                    {/* Recommendation Steps */}
                    {resolutionAid.recommendation_steps && resolutionAid.recommendation_steps.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase text-purple-700 tracking-wider">Recommended Resolution Steps:</span>
                        <div className="space-y-1 mt-1 text-slate-700 text-[11px]">
                          {resolutionAid.recommendation_steps.map((step, sIdx) => (
                            <div key={sIdx} className="flex items-start gap-1.5 p-1 bg-purple-50/60 rounded border border-purple-100">
                              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                              <span className="font-medium">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Possible Resolution Strategy */}
                    <div>
                      <span className="text-[10px] font-bold uppercase text-purple-700 tracking-wider">Possible Resolution:</span>
                      <p className="font-semibold text-slate-800 text-xs mt-0.5 p-2 bg-slate-50 rounded border border-slate-200">
                        {resolutionAid.possible_resolution || resolutionAid.recommended_fix}
                      </p>
                    </div>

                    {/* Similar Defect Insights */}
                    {resolutionAid.similar_defect_insights && (
                      <div className="p-2 bg-indigo-50/70 rounded border border-indigo-100 text-[11px] text-indigo-950">
                        <strong className="font-semibold text-indigo-800">Historical Defect Insight:</strong> {resolutionAid.similar_defect_insights}
                      </div>
                    )}

                    {/* Root Cause Investigation Areas */}
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Root Cause Investigation Areas:</span>
                      <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px] mt-1">
                        {(resolutionAid.investigation_areas || []).map((area, i) => (
                          <li key={i}>{area}</li>
                        ))}
                      </ul>
                    </div>

                    {resolutionAid.relevant_files_hint && resolutionAid.relevant_files_hint.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1">
                        <span className="font-bold text-slate-600">Likely Source Files:</span>
                        <div className="flex flex-wrap gap-1">
                          {resolutionAid.relevant_files_hint.map((f, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-slate-100 font-mono text-slate-700 rounded border border-slate-200">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Historical Similar Resolutions from PostgreSQL */}
                {historicalResolutions && historicalResolutions.length > 0 && (
                  <div className="p-3 bg-white rounded-lg border border-indigo-200 text-xs space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-indigo-900 font-bold text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Archive className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Historical Resolved Defect Matches ({historicalResolutions.length})</span>
                      </span>
                      <span className="text-[10px] text-indigo-500 font-normal">Ranked by PostgreSQL vector similarity</span>
                    </div>

                    <div className="space-y-2">
                      {historicalResolutions.map((item, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-800">{item.key || '#' + item.id}: {item.title}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              {item.similarityPercentage ?? Math.round((item.similarityScore ?? 0) * 100)}% match
                            </span>
                          </div>
                          {item.rootCause && (
                            <p className="text-[11px] text-slate-700">
                              <strong className="text-amber-800">Root Cause:</strong> {item.rootCause}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-600">
                            <strong className="text-slate-700">Resolution:</strong> {item.resolutionNotes || 'No resolution notes recorded.'}
                          </p>
                          {(item.developerComments || (item.comments && item.comments.length > 0)) && (
                            <p className="text-[10px] text-slate-500 italic">
                              <strong>Developer Comments:</strong> {item.developerComments || item.comments.map(c => `"${c.body}" - ${c.userName}`).join('; ')}
                            </p>
                          )}
                          <div className="text-[10px] text-slate-400 pt-0.5">
                            Resolved by: <span className="text-slate-600 font-medium">{item.resolvedBy || 'Developer'}</span> • Category: <span className="text-slate-600 font-medium">{item.category}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historical resolutions empty state message */}
                {historicalMessage && (
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-500 text-center animate-in fade-in">
                    {historicalMessage}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Description</h4>
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 whitespace-pre-wrap font-sans">
                  {selectedIssue.description}
                </div>
              </div>

              {/* Attachments Section with Real Computer File Upload & Actions */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                    <span>Real File Attachments ({selectedIssue.attachments?.length || 0})</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">Max 20MB / file • Stored on Server & PG</span>
                </div>

                {/* Attachments List */}
                <div className="space-y-2 mb-3">
                  {(selectedIssue.attachments || []).map((att, idx) => {
                    const isImg = (att.fileType || '').startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(att.originalName || att.fileName);
                    const isPdf = (att.fileType || '').includes('pdf') || (att.originalName || att.fileName || '').endsWith('.pdf');
                    const isZip = (att.fileType || '').includes('zip') || (att.originalName || att.fileName || '').endsWith('.zip');

                    return (
                      <div
                        key={att.id || idx}
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isImg ? 'bg-emerald-100 text-emerald-700' : isPdf ? 'bg-red-100 text-red-700' : isZip ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isImg ? <FileImage className="w-4 h-4" /> : isPdf ? <FileText className="w-4 h-4" /> : isZip ? <FileArchive className="w-4 h-4" /> : <File className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 truncate text-xs">
                                {att.originalName || att.fileName}
                              </span>
                              <span className="text-slate-400 text-[10px] shrink-0 font-mono">
                                ({Math.round((att.fileSize || 1024) / 1024)} KB)
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>Uploaded by: <strong className="text-slate-700">{att.uploadedByName || att.uploadedBy || 'User'}</strong></span>
                              {att.createdAt && (
                                <span className="text-slate-400">• {new Date(att.createdAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions: Download / View / Delete */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {att.fileUrl && att.fileUrl !== '#' && (
                            <a
                              href={att.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Open/Preview in new tab"
                            >
                              <Eye className="w-3 h-3 text-slate-500" />
                              <span>View</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(att)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                            title="Download file to computer"
                          >
                            <Download className="w-3 h-3 text-blue-600" />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att.id, att.originalName || att.fileName)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                            title="Delete attachment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(!selectedIssue.attachments || selectedIssue.attachments.length === 0) && (
                    <div className="p-3 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-400 bg-slate-50/50">
                      No files attached to this defect yet.
                    </div>
                  )}
                </div>

                {/* Real File Upload Trigger & Drag and Drop Zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleUploadSelectedFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition ${isDraggingFile ? 'border-blue-500 bg-blue-50/80' : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-slate-400'}`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUploadSelectedFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                    accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.log,.json,.csv,.doc,.docx,.xls,.xlsx,.zip,.tar,.gz"
                  />

                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                      {isUploadingAttachment ? <Clock className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {isUploadingAttachment ? 'Uploading and validating file in PostgreSQL...' : 'Drag & drop defect artifact, or browse from computer'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Supported: PNG, JPG, GIF, PDF, TXT, LOG, DOCX, XLSX, ZIP (Max 20MB)
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isUploadingAttachment}
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isUploadingAttachment ? 'Uploading...' : 'Attach File from Computer'}</span>
                    </button>
                  </div>
                </div>

                {uploadError && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
              </div>

              {/* Audit History */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Activity History (PostgreSQL Audit Log)</h4>
                <div className="space-y-1.5 border-l-2 border-slate-200 ml-2 pl-3">
                  {(selectedIssue.activityLogs || []).map((log, idx) => (
                    <div key={idx} className="text-xs text-slate-600">
                      <span className="font-bold text-slate-800">{log.userName || 'User'}</span>: {log.actionType || 'UPDATED'} - {log.newValue || log.newStatus}
                      <div className="text-[10px] text-slate-400 font-mono">{new Date(log.timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comments Section */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Comments ({selectedIssue.comments?.length || 0})</h4>
                <div className="space-y-2 mb-3">
                  {(selectedIssue.comments || []).map((c, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-bold">
                        <span className="text-blue-700">{c.userName}</span>
                        <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-700">{c.body}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold cursor-pointer shadow-2xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>

              {/* Admin Deletion Action */}
              {isAdmin && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleDeleteIssue(selectedIssue.id)}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>👑 Admin Action: Delete Defect Permanently</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE ISSUE                                       */}
      {/* ========================================================= */}
      {isNewIssueOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Bug className="w-4 h-4 text-blue-600" />
                <span>Create New Defect</span>
              </div>
              <button onClick={() => setIsNewIssueOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateIssue} className="p-5 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Defect Title *</label>
                <input
                  type="text"
                  required
                  value={newIssueTitle}
                  onChange={(e) => setNewIssueTitle(e.target.value)}
                  placeholder="e.g. Payment gateway 504 timeout during checkout"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium focus:outline-none focus:border-blue-500 text-slate-900"
                />
              </div>

              {/* Similar Defects Warning Alert */}
              {similarDefects.length > 0 && (
                <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>⚠️ Similar Existing Defect(s) in PostgreSQL</span>
                    </div>
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                      pgvector Semantic Cosine
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {similarDefects.map(sim => {
                      const pct = sim.similarity_percentage ?? Math.round((sim.similarity_score || 0) * 100);
                      const isHighDup = pct >= 80;
                      return (
                        <div key={sim.id} className="text-[11px] text-amber-950 flex justify-between items-center bg-white p-2 rounded-md border border-amber-200 shadow-2xs">
                          <div className="flex-1 mr-2 leading-snug">
                            <span className="font-bold text-slate-900">{sim.key}:</span> <span className="text-slate-800">{sim.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              isHighDup
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : pct >= 70
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {pct}% {isHighDup ? 'Duplicate' : 'Match'}
                            </span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {sim.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI Auto-Enhance Button */}
              <button
                type="button"
                onClick={handleAiEnhanceIssue}
                disabled={isEnhancingAi || !newIssueTitle.trim()}
                className="w-full py-2 px-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isEnhancingAi ? 'AI Drafting Specifications...' : '✨ Enhance Description & Fields with AI'}</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={newIssuePriority}
                    onChange={(e) => setNewIssuePriority(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold focus:outline-none"
                  >
                    <option value="Critical">🔴 Critical</option>
                    <option value="High">🟠 High</option>
                    <option value="Medium">🟡 Medium</option>
                    <option value="Low">🔵 Low</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Severity</label>
                  <select
                    value={newIssueSeverity}
                    onChange={(e) => setNewIssueSeverity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold focus:outline-none"
                  >
                    <option value="Critical">🔥 Critical</option>
                    <option value="High">⚠️ High</option>
                    <option value="Medium">🟡 Medium</option>
                    <option value="Low">🔹 Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Project</label>
                  <select
                    value={newIssueProject}
                    onChange={(e) => setNewIssueProject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold focus:outline-none"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sprint (Optional)</label>
                  <select
                    value={newIssueSprint}
                    onChange={(e) => setNewIssueSprint(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold focus:outline-none"
                  >
                    <option value="">Backlog (No Sprint)</option>
                    {sprints.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Detailed Description (Markdown)</label>
                <textarea
                  rows={5}
                  value={newIssueDesc}
                  onChange={(e) => setNewIssueDesc(e.target.value)}
                  placeholder="### 📌 Overview&#10;### 🔁 Steps to Reproduce&#10;### 🎯 Expected Result&#10;### ⚠️ Actual Result"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Initial File Attachments (Computer File Picker) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-700">Attach Files / Defect Artifacts</label>
                  <span className="text-[10px] text-slate-400">PNG, JPG, PDF, TXT, DOCX, ZIP (Max 20MB)</span>
                </div>
                
                <input
                  type="file"
                  ref={newIssueFileInputRef}
                  multiple
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const selected = Array.from(e.target.files);
                      setNewIssueFiles(prev => [...prev, ...selected]);
                    }
                  }}
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.json,.csv,.doc,.docx,.xls,.xlsx,.zip,.tar,.gz"
                />

                <div className="space-y-2">
                  {newIssueFiles.length > 0 && (
                    <div className="space-y-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      {newIssueFiles.map((file, idx) => (
                        <div key={idx} className="flex justify-between items-center p-1.5 bg-white border border-slate-200 rounded text-xs">
                          <div className="flex items-center gap-1.5 truncate">
                            <Paperclip className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="font-semibold text-slate-800 truncate">{file.name}</span>
                            <span className="text-slate-400 text-[10px]">({Math.round(file.size / 1024)} KB)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewIssueFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700 text-xs px-1.5 font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => newIssueFileInputRef.current && newIssueFileInputRef.current.click()}
                    className="w-full py-2 border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 rounded-lg text-slate-600 hover:text-blue-700 transition flex items-center justify-center gap-2 cursor-pointer font-semibold text-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Attachment from Computer</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewIssueOpen(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  Save Defect to PostgreSQL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE SPRINT                                      */}
      {/* ========================================================= */}
      {isNewSprintOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-600" />
                <span>Create New Sprint</span>
              </h3>
              <button onClick={() => setIsNewSprintOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSprint} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Sprint Name *</label>
                <input
                  type="text"
                  required
                  value={newSprintName}
                  onChange={(e) => setNewSprintName(e.target.value)}
                  placeholder="e.g. Sprint 16: Authentication Hardening"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Sprint Goal</label>
                <textarea
                  rows={2}
                  value={newSprintGoal}
                  onChange={(e) => setNewSprintGoal(e.target.value)}
                  placeholder="e.g. Close OAuth redirect bugs and implement rate-limiting"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newSprintStartDate}
                    onChange={(e) => setNewSprintStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newSprintEndDate}
                    onChange={(e) => setNewSprintEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewSprintOpen(false)}
                  className="px-3 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Create Sprint in PostgreSQL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Floating Bottom-Right AI Assistant Trigger */}
      <button
        onClick={() => {
          setChatDefectContext(null);
          setIsChatOpen(true);
        }}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-purple-700 via-indigo-700 to-slate-900 hover:scale-105 active:scale-95 text-white rounded-full shadow-xl border border-purple-400/30 font-bold text-xs cursor-pointer transition-all duration-150 group"
        title="Open AI Defect Resolution Assistant"
      >
        <Bot className="w-4 h-4 text-purple-300 group-hover:rotate-12 transition-transform animate-pulse" />
        <span>Ask AI Assistant</span>
      </button>

      {/* AI Defect Resolution Assistant Drawer */}
      <AIChatDrawer
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false);
          setChatDefectContext(null);
        }}
        issues={issues}
        projects={projects}
        sprints={sprints}
        currentDefect={chatDefectContext}
        onSelectDefect={(defect) => {
          setSelectedIssue(defect);
          setChatDefectContext(defect);
        }}
        userSession={userSession}
      />
    </div>
  );
}
