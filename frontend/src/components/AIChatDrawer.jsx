import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  User as UserIcon,
  Sparkles,
  Send,
  X,
  Trash2,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Archive,
  Zap,
  HelpCircle,
  Database,
  Layers,
  ChevronDown,
  Shield,
  FileText,
  Copy,
  Check,
  CornerDownLeft
} from 'lucide-react';

export default function AIChatDrawer({
  isOpen,
  onClose,
  issues = [],
  projects = [],
  sprints = [],
  currentDefect = null,
  onSelectDefect,
  userSession
}) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContextDefect, setSelectedContextDefect] = useState(null);
  const [sessionId] = useState(() => {
    try {
      const saved = localStorage.getItem('bugflow_chat_session_id');
      if (saved) return saved;
      const newId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem('bugflow_chat_session_id', newId);
      return newId;
    } catch {
      return `session_${Date.now()}`;
    }
  });
  const [copiedIndex, setCopiedIndex] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Sync with currentDefect prop if opened from issue details modal
  useEffect(() => {
    if (currentDefect) {
      setSelectedContextDefect(currentDefect);
    }
  }, [currentDefect]);

  // Load chat history from backend on open
  useEffect(() => {
    if (isOpen) {
      fetchChatHistory();
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, sessionId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const getAuthHeaders = (extra = {}) => {
    const token = userSession?.token || localStorage.getItem('bugflow_jwt_token');
    const headers = {
      'x-user-name': userSession?.name || 'Developer',
      'x-user-role': userSession?.role || 'Developer',
      'x-user-id': String(userSession?.id || 2),
      ...extra
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`/api/ai/chat/history?session_id=${encodeURIComponent(sessionId)}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          const formatted = [];
          data.messages.forEach(m => {
            formatted.push({
              role: 'user',
              content: m.message,
              time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Earlier'
            });
            formatted.push({
              role: 'assistant',
              content: m.response,
              defectContext: m.defectContext,
              time: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Earlier'
            });
          });
          setMessages(formatted);
          return;
        }
      }
    } catch (e) {
      console.warn('Could not load chat history:', e);
    }

    // Default welcoming message if no prior messages
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `Hello ${userSession?.name || 'there'}! I am your **BugFlow AI Defect Resolution Assistant**, directly connected to your live **PostgreSQL database**.

I can assist you with:
- **Defect Analysis**: Deep dive into specific defects (e.g. \`BF-1482\`, \`BF-1905\`, \`BF-2492\`)
- **Similar Defect Search**: Find duplicates and semantic matches using pgvector cosine embeddings
- **Resolution Suggestions**: Suggest actionable root-cause investigation checklists
- **Previous Resolutions**: Retrieve historical fixes and developer comments from resolved defects
- **Project Statistics**: Query real defect counts, sprint progress, and developer workloads
- **General Software Knowledge**: Answer HTTP, database, and system architecture questions

How can I help you investigate or manage defects today?`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    const userMsg = {
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          defect_context: selectedContextDefect ? selectedContextDefect.key || selectedContextDefect.id : null,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg = {
        role: 'assistant',
        content: data.response || 'No response generated.',
        defectContext: data.defectContext,
        targetDefect: data.targetDefect,
        similarDefects: data.similarDefects || [],
        historicalResolutions: data.historicalResolutions || [],
        provider: data.provider,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);

      // If backend identified a specific defect, highlight it as the active context
      if (data.targetDefect && !selectedContextDefect) {
        const fullDefect = issues.find(i => i.key === data.targetDefect.key || i.id === data.targetDefect.id);
        if (fullDefect) {
          setSelectedContextDefect(fullDefect);
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ **Unable to retrieve project information at the moment.** Please ensure the PostgreSQL connection is healthy and try again.',
          isError: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch(`/api/ai/chat/history?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      setMessages([
        {
          role: 'assistant',
          content: '🧹 Chat history has been cleared. What would you like to investigate next?',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (e) {
      console.error('Failed to clear chat history:', e);
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!isOpen) return null;

  // Format message text with markdown-like highlights
  const renderFormattedContent = (content) => {
    if (!content) return null;

    // Split paragraphs
    const lines = content.split('\n');

    return (
      <div className="space-y-2 text-xs leading-relaxed text-slate-800">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-1.5" />;
          }

          // Section headers with emoji
          if (/^(\uD83D[\uDE00-\uDE4F]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uD000-\uDFFF]|\uD83E[\uDD00-\uDDFF]|🔎|⚠️|👨‍💻|🔍|📜|🛠️|💡|📊|🤖|📌|🔁|🎯|💥)\s*\*\*/.test(trimmed) || /^###\s*/.test(trimmed)) {
            const cleanHeader = trimmed.replace(/^###\s*/, '').replace(/\*\*/g, '');
            return (
              <div key={idx} className="font-bold text-slate-900 pt-2 pb-0.5 text-[13px] border-b border-slate-100 flex items-center gap-1.5">
                <span>{cleanHeader}</span>
              </div>
            );
          }

          // Bullet points
          if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
            const bulletText = trimmed.replace(/^[•\-\d\.]+\s*/, '');
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-blue-500 font-bold shrink-0">•</span>
                <span className="flex-1" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(bulletText) }} />
              </div>
            );
          }

          return (
            <p key={idx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(trimmed) }} />
          );
        })}
      </div>
    );
  };

  const formatInlineMarkdown = (str) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 text-purple-700 font-mono text-[11px] rounded border border-slate-200">$1</code>')
      .replace(/\*(.*?)\*/g, '<em class="text-slate-600 italic">$1</em>');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in">
      {/* Click outside to close backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Slide-over Drawer */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 z-10 animate-in slide-in-from-right duration-200">
        
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-200 shadow-inner">
              <Bot className="w-5 h-5 text-purple-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white tracking-tight">AI Defect Resolution Assistant</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  PostgreSQL Active
                </span>
              </div>
              <p className="text-[11px] text-purple-200/80">Intelligent Software Defect Tracking & Resolution System</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleClearHistory}
              className="p-1.5 text-purple-200/70 hover:text-white hover:bg-white/10 rounded-lg transition text-xs font-medium flex items-center gap-1 cursor-pointer"
              title="Clear chat history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-purple-200/70 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
              title="Close Assistant"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Defect Context Selector Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-slate-500 text-[11px] uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Focus Context:
            </span>

            {selectedContextDefect ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-100 text-purple-900 border border-purple-200 font-medium text-xs truncate">
                <span className="font-bold font-mono text-purple-700">{selectedContextDefect.key || '#' + selectedContextDefect.id}</span>
                <span className="truncate max-w-[200px] text-slate-700">{selectedContextDefect.title}</span>
                <button
                  onClick={() => setSelectedContextDefect(null)}
                  className="p-0.5 hover:bg-purple-200 rounded text-purple-600 cursor-pointer ml-1"
                  title="Clear defect focus (search all project issues)"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className="text-slate-500 font-medium italic text-xs">
                All Project Defects ({issues.length} total in PostgreSQL)
              </span>
            )}
          </div>

          {/* Quick context dropdown */}
          <div className="relative">
            <select
              value={selectedContextDefect ? selectedContextDefect.id : ''}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  setSelectedContextDefect(null);
                } else {
                  const found = issues.find(i => String(i.id) === String(id));
                  if (found) setSelectedContextDefect(found);
                }
              }}
              className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-purple-500 cursor-pointer max-w-[180px] truncate"
            >
              <option value="">🎯 Switch Defect...</option>
              {issues.map(iss => (
                <option key={iss.id} value={iss.id}>
                  {iss.key || '#' + iss.id}: {iss.title.substring(0, 30)}...
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';

            return (
              <div
                key={index}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-2xs space-y-2 text-xs ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-xs'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                }`}>
                  {/* User message */}
                  {isUser ? (
                    <div className="text-xs font-normal whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  ) : (
                    <>
                      {/* Highlight card if specific target defect is active */}
                      {msg.targetDefect && (
                        <div className="p-2 bg-purple-50 rounded-lg border border-purple-200 flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-bold text-purple-900 font-mono">[{msg.targetDefect.key}]</span>
                            <span className="font-semibold text-slate-800 truncate">{msg.targetDefect.title}</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-purple-200/80 text-purple-900 font-bold text-[10px] shrink-0">
                            {msg.targetDefect.status}
                          </span>
                        </div>
                      )}

                      {/* Main Assistant Body */}
                      <div className="prose prose-xs max-w-none">
                        {renderFormattedContent(msg.content)}
                      </div>

                      {/* Embedded Similar Defects Cards if returned */}
                      {msg.similarDefects && msg.similarDefects.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase text-purple-700 tracking-wider flex items-center gap-1">
                            <Search className="w-3 h-3 text-purple-600" />
                            PostgreSQL pgvector Similar Matches:
                          </span>
                          <div className="space-y-1">
                            {msg.similarDefects.map((sim, sIdx) => (
                              <div
                                key={sIdx}
                                onClick={() => {
                                  if (onSelectDefect) {
                                    const full = issues.find(i => i.key === sim.key || i.id === sim.id);
                                    if (full) onSelectDefect(full);
                                  }
                                }}
                                className="p-2 bg-slate-50 hover:bg-purple-50/60 border border-slate-200 hover:border-purple-300 rounded-lg flex items-center justify-between text-[11px] cursor-pointer transition group"
                              >
                                <div className="truncate pr-2">
                                  <span className="font-bold text-slate-800 font-mono group-hover:text-purple-700 mr-1.5">
                                    {sim.key || '#' + sim.id}
                                  </span>
                                  <span className="text-slate-600">{sim.title}</span>
                                </div>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] shrink-0 font-mono">
                                  {sim.similarityPercentage}% match
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Embedded Historical Resolutions if returned */}
                      {msg.historicalResolutions && msg.historicalResolutions.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase text-indigo-700 tracking-wider flex items-center gap-1">
                            <Archive className="w-3 h-3 text-indigo-600" />
                            Archived Defect Resolutions:
                          </span>
                          <div className="space-y-1">
                            {msg.historicalResolutions.map((hist, hIdx) => (
                              <div key={hIdx} className="p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg text-[11px] space-y-0.5">
                                <div className="flex justify-between font-bold text-slate-800">
                                  <span>{hist.key}: {hist.title}</span>
                                  <span className="text-[10px] text-indigo-600 font-normal">By {hist.resolvedBy || 'Dev'}</span>
                                </div>
                                <p className="text-slate-600 text-[10px]">{hist.resolutionNotes}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Footer actions */}
                      <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 border-t border-slate-50">
                        <span className="text-[9px]">{msg.provider || 'PostgreSQL + Gemini AI'}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(msg.content, index)}
                            className="p-1 hover:text-slate-700 rounded transition cursor-pointer flex items-center gap-0.5"
                            title="Copy response"
                          >
                            {copiedIndex === index ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedIndex === index ? 'Copied' : 'Copy'}</span>
                          </button>
                          <span>{msg.time}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5 font-bold text-xs">
                    {userSession?.avatar || 'U'}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 justify-start animate-in fade-in">
              <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-3.5 shadow-2xs space-y-2 max-w-[80%]">
                <div className="flex items-center gap-2 text-purple-700 font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>Retrieving PostgreSQL data & generating guidance...</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 bg-slate-100 rounded-full w-48 animate-pulse" />
                  <div className="h-2 bg-slate-100 rounded-full w-36 animate-pulse" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-200 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
            <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0 mr-1 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              Suggestions:
            </span>

            {selectedContextDefect ? (
              <>
                <button
                  onClick={() => handleSendMessage(`What should I check or investigate for ${selectedContextDefect.key}?`)}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>🛠️ What to investigate?</span>
                </button>
                <button
                  onClick={() => handleSendMessage(`Are there similar defects to ${selectedContextDefect.key}?`)}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>🔍 Similar defects</span>
                </button>
                <button
                  onClick={() => handleSendMessage(`Was a similar defect solved before for ${selectedContextDefect.key}?`)}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>📜 Previous resolutions</span>
                </button>
                <button
                  onClick={() => handleSendMessage(`Who is assigned to ${selectedContextDefect.key} and what is its status?`)}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <span>👨‍💻 Assignment & status</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleSendMessage("How many open defects are currently in the database?")}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer"
                >
                  📊 How many open defects?
                </button>
                <button
                  onClick={() => handleSendMessage("How many critical defects are currently open?")}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-800 border border-red-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer"
                >
                  ⚠️ Critical open defects
                </button>
                <button
                  onClick={() => handleSendMessage("Which developer has the most assigned defects?")}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer"
                >
                  👨‍💻 Developer workload
                </button>
                <button
                  onClick={() => handleSendMessage("What does HTTP 500 error mean and how should I debug it?")}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-medium shrink-0 transition shadow-2xs cursor-pointer"
                >
                  💡 What is HTTP 500?
                </button>
              </>
            )}
          </div>
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3.5 bg-white border-t border-slate-200 shrink-0 space-y-1.5"
        >
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-300 rounded-xl p-1.5 focus-within:border-purple-600 focus-within:ring-2 focus-within:ring-purple-100 transition shadow-inner">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                selectedContextDefect 
                  ? `Ask anything about ${selectedContextDefect.key} (e.g. "What should I investigate?")`
                  : "Ask about defects, similar bugs, resolutions, or stats..."
              }
              rows={2}
              className="w-full bg-transparent border-0 focus:outline-hidden text-xs text-slate-800 placeholder-slate-400 resize-none px-2 py-1 leading-relaxed"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
              title="Send message (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
            <span>Press <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px] text-slate-600">Enter</kbd> to send</span>
            <span className="flex items-center gap-1 text-slate-500">
              <Database className="w-3 h-3 text-emerald-600" />
              Grounded in PostgreSQL & Gemini AI
            </span>
          </div>
        </form>

      </div>
    </div>
  );
}
