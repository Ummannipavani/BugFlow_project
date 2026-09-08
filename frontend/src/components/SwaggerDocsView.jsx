import React, { useState } from 'react';
import { 
  FileCode, 
  ExternalLink, 
  Copy, 
  Check, 
  BookOpen, 
  Terminal, 
  Shield, 
  Sparkles, 
  Database,
  Layers,
  Send,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function SwaggerDocsView({ userSession, showToast }) {
  const [activeSubView, setActiveSubView] = useState('iframe'); // 'iframe' | 'explorer'
  const [copiedToken, setCopiedToken] = useState(false);
  const [testEndpointResult, setTestEndpointResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  const token = userSession?.token || localStorage.getItem('bugflow_jwt_token') || '';

  const handleCopyToken = () => {
    if (!token) {
      showToast?.('No active token found. Please sign in to generate a JWT token.', true);
      return;
    }
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    showToast?.('Copied Bearer JWT Token for Swagger Authorization!');
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleTestCall = async (url, method = 'GET', body = null) => {
    setIsTesting(true);
    setTestEndpointResult(null);
    try {
      const headers = {
        'Accept': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userSession?.role) headers['x-user-role'] = userSession.role;
      if (body) headers['Content-Type'] = 'application/json';

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      setTestEndpointResult({
        url,
        status: res.status,
        statusText: res.statusText,
        data
      });
    } catch (err) {
      setTestEndpointResult({
        url,
        status: 500,
        statusText: 'Fetch Error',
        data: { error: String(err) }
      });
    } finally {
      setIsTesting(false);
    }
  };

  const sampleEndpoints = [
    {
      group: 'Authentication & Session',
      method: 'GET',
      path: '/api/auth/me',
      desc: 'Retrieve active authenticated user profile, PostgreSQL record, and role permissions.'
    },
    {
      group: 'System Health & Engine',
      method: 'GET',
      path: '/api/health',
      desc: 'Query live PostgreSQL database connection status, schema tables, and Gemini AI status.'
    },
    {
      group: 'Defects & Issues',
      method: 'GET',
      path: '/api/issues',
      desc: 'List all defect records with project, sprint, status, severity, and assignee details.'
    },
    {
      group: 'Projects & Repositories',
      method: 'GET',
      path: '/api/projects',
      desc: 'Retrieve all managed projects and repositories stored in PostgreSQL.'
    },
    {
      group: 'Sprint Management',
      method: 'GET',
      path: '/api/sprints',
      desc: 'Retrieve active and planned agile sprints along with defect allocations.'
    },
    {
      group: 'Analytics & Metrics',
      method: 'GET',
      path: '/api/analytics/severity',
      desc: 'Query live PostgreSQL defect distribution aggregated by severity.'
    }
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col">
      {/* Top Banner & Action Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs">
              <FileCode className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  Swagger UI & OpenAPI 3.0 Documentation
                </h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-emerald-200">
                  v2.0.0 OAS
                </span>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                  Interactive UI
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete REST API specification for defects, projects, sprints, attachments, and AI resolution engine.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Copy Token Button */}
            <button
              onClick={handleCopyToken}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition cursor-pointer"
              title="Copy your active JWT token to paste into Swagger Authorize"
            >
              {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedToken ? 'Token Copied!' : 'Copy JWT Token'}</span>
            </button>

            {/* View JSON Spec */}
            <a
              href="/api-docs.json"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition"
              title="Open raw OpenAPI 3.0 JSON specification"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-600" />
              <span>Raw JSON</span>
            </a>

            {/* Open Standalone Swagger UI */}
            <a
              href="/api-docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition"
              title="Open Swagger UI full screen in new browser tab"
            >
              <span>Open in New Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Sub-view Navigation Tabs */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => setActiveSubView('iframe')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
              activeSubView === 'iframe'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Interactive Swagger UI Frame
          </button>
          <button
            onClick={() => setActiveSubView('explorer')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
              activeSubView === 'explorer'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Quick API Explorer & Test Console
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeSubView === 'iframe' ? (
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              <span>Loaded endpoint: <strong className="text-slate-800">/api-docs</strong></span>
            </div>
            <span className="text-[11px] text-slate-400">
              Click "Authorize" at the top-right of Swagger to paste your JWT token.
            </span>
          </div>
          <iframe
            src="/api-docs"
            title="Swagger UI Interactive API Specification"
            className="w-full flex-1 border-0 bg-[#fafafa]"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Quick Test Console */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Endpoints List */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-600" />
                <span>Quick Endpoint Tester</span>
              </h2>
              <p className="text-xs text-slate-500">
                Execute live requests against the BugFlow backend with your current session credentials.
              </p>

              <div className="space-y-2 mt-2">
                {sampleEndpoints.map((ep, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 flex items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          {ep.method}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-800 truncate">
                          {ep.path}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                        {ep.desc}
                      </p>
                    </div>

                    <button
                      onClick={() => handleTestCall(ep.path, ep.method)}
                      disabled={isTesting}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Send className="w-3 h-3" />
                      <span>Test</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Results Output Panel */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Response Output</span>
                </span>
                {testEndpointResult && (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    testEndpointResult.status >= 200 && testEndpointResult.status < 300
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    HTTP {testEndpointResult.status} {testEndpointResult.statusText}
                  </span>
                )}
              </h2>

              {testEndpointResult ? (
                <div className="flex-1 flex flex-col min-h-[300px]">
                  <div className="text-[11px] font-mono text-slate-500 mb-2">
                    URL: <span className="text-slate-800 font-semibold">{testEndpointResult.url}</span>
                  </div>
                  <pre className="flex-1 p-3 bg-slate-900 text-emerald-400 rounded-lg text-xs font-mono overflow-auto max-h-[450px]">
                    {JSON.stringify(testEndpointResult.data, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                  <FileCode className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-xs font-medium">Click "Test" on any endpoint to view live server JSON responses.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Or switch to "Interactive Swagger UI Frame" to test the full schema suite.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
