import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Circle,
  FileText,
  Terminal,
  Cpu,
  Database,
  Key,
  Lock,
  MessageSquare,
  BookOpen,
  RefreshCw,
  Search,
  UserCheck,
  Zap,
  Layers,
  Sparkles,
  ArrowRight,
  Code2,
  AlertTriangle,
  Info,
  ExternalLink,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';

interface UserProfile {
  email: string;
  jwt_payload?: any;
}

interface DocInfo {
  filename: string;
  size_bytes: number;
}

interface VectorHit {
  id: string;
  source: string;
  chunk_index: number;
  content: string;
  score: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  executionTrace?: string[];
  retryCount?: number;
  timestamp: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'auth' | 'ingest' | 'mcp' | 'chat' | 'readme'>('chat');
  
  // Auth state
  const [token, setToken] = useState<string>(() => localStorage.getItem('access_token') || '');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string>('');
  const [authSuccess, setAuthSuccess] = useState<string>('');

  // Register form
  const [regEmail, setRegEmail] = useState('support.agent@company.com');
  const [regPassword, setRegPassword] = useState('SecurePass123!');

  // Login form
  const [loginEmail, setLoginEmail] = useState('support.agent@company.com');
  const [loginPassword, setLoginPassword] = useState('SecurePass123!');

  // Ingestion & Vector state
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string>('');
  const [docContent, setDocContent] = useState<string>('');
  const [vectorQuery, setVectorQuery] = useState('JWT secret environment key');
  const [vectorHits, setVectorHits] = useState<VectorHit[]>([]);
  const [ingestStatus, setIngestStatus] = useState<string>('');
  const [isIngesting, setIsIngesting] = useState<boolean>(false);

  // MCP Inspector state
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [mcpSelectedTool, setMcpSelectedTool] = useState<string>('search_docs');
  const [mcpQueryArg, setMcpQueryArg] = useState('fastapi bearer authentication');
  const [mcpKArg, setMcpKArg] = useState<number>(3);
  const [mcpDocArg, setMcpDocArg] = useState('fastapi_security.md');
  const [mcpResult, setMcpResult] = useState<string>('');
  const [mcpLoading, setMcpLoading] = useState<boolean>(false);

  // Chat / LangGraph state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: 'Hello! I am your Secure Internal Document Q&A Assistant. Ask me any question regarding internal documentation, security, FastAPI, LangGraph, or MCP architecture.',
      sources: ['architecture_overview.md'],
      executionTrace: ['START', 'retrieve', 'grade_documents', 'generate'],
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // System status
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Read README content
  const [readmeText, setReadmeText] = useState<string>('');

  useEffect(() => {
    fetchDocsList();
    fetchMcpTools();
    verifyToken();
  }, []);

  const verifyToken = async (overrideToken?: string) => {
    const savedToken = overrideToken || localStorage.getItem('access_token');
    if (!savedToken) return;
    try {
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser({ email: data.email, jwt_payload: data.jwt_payload });
        setServerOnline(true);
      } else {
        localStorage.removeItem('access_token');
        setToken('');
      }
    } catch {
      setServerOnline(false);
    }
  };

  const fetchDocsList = async () => {
    try {
      const res = await fetch('/api/docs-list');
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents || []);
        if (data.documents?.length > 0) {
          setSelectedDoc(data.documents[0].filename);
          loadDocContent(data.documents[0].filename);
        }
        setServerOnline(true);
      }
    } catch {
      setServerOnline(false);
    }
  };

  const loadDocContent = async (filename: string) => {
    try {
      const res = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'get_doc', arguments: { filename } })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        setDocContent(text);
      }
    } catch (err: any) {
      setDocContent('Error loading document content: ' + err.message);
    }
  };

  const fetchMcpTools = async () => {
    try {
      const res = await fetch('/api/mcp/tools');
      if (res.ok) {
        const data = await res.json();
        setMcpTools(data.tools || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegister = async (e?: React.FormEvent, customEmail?: string, customPassword?: string) => {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const targetEmail = (customEmail || regEmail || '').trim();
    const targetPassword = customPassword || regPassword || '';

    if (!targetEmail || !targetPassword) {
      setAuthError('Please enter both an email address and a password.');
      return;
    }

    if (targetPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setAuthSuccess(`User "${data.user?.email || targetEmail}" registered in SQLite! Auto-logging in...`);
        setLoginEmail(targetEmail);
        setLoginPassword(targetPassword);
        // Automatically perform login
        await handleLogin(undefined, targetEmail, targetPassword);
      } else {
        const errorDetail = typeof data.detail === 'string' 
          ? data.detail 
          : Array.isArray(data.detail) 
            ? data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ') 
            : JSON.stringify(data.detail || 'Registration failed');
        
        if (errorDetail.includes('already exists')) {
          setAuthSuccess(`Note: "${targetEmail}" is already registered. Attempting auto-login...`);
          setLoginEmail(targetEmail);
          setLoginPassword(targetPassword);
          await handleLogin(undefined, targetEmail, targetPassword);
        } else {
          setAuthError(errorDetail);
        }
      }
    } catch (err: any) {
      setAuthError('Error connecting to authentication service: ' + err.message);
    }
  };

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPassword?: string) => {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const targetEmail = (customEmail || loginEmail || '').trim();
    const targetPassword = customPassword || loginPassword || '';

    if (!targetEmail || !targetPassword) {
      setAuthError('Please enter both email and password to log in.');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPassword })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        setToken(data.access_token);
        setAuthSuccess(`Logged in successfully as ${data.email || targetEmail}! JWT Token generated.`);
        verifyToken(data.access_token);
      } else {
        const rawDetail = data.detail || data.error || data.message;
        const errorDetail = typeof rawDetail === 'string' 
          ? rawDetail 
          : Array.isArray(rawDetail) 
            ? rawDetail.map((d: any) => d.msg || JSON.stringify(d)).join(', ') 
            : rawDetail ? JSON.stringify(rawDetail) : 'Login failed or token was not returned.';
        setAuthError(errorDetail);
      }
    } catch (err: any) {
      setAuthError('Login request error: ' + err.message);
    }
  };

  const generateRandomUser = () => {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const newEmail = `intern.dev.${randomId}@company.com`;
    const newPassword = `SecretPass${randomId}!`;
    setRegEmail(newEmail);
    setRegPassword(newPassword);
    setLoginEmail(newEmail);
    setLoginPassword(newPassword);
    setAuthSuccess(`Generated fresh credentials: ${newEmail} / ${newPassword}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setToken('');
    setCurrentUser(null);
    setAuthSuccess('Logged out successfully.');
  };

  const handleIngest = async () => {
    setIsIngesting(true);
    setIngestStatus('Running chunking pipeline (500-char size, 100-char overlap)...');
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setIngestStatus(data.message);
        fetchDocsList();
      } else {
        setIngestStatus('Ingestion failed: ' + data.detail);
      }
    } catch (err: any) {
      setIngestStatus('Error running ingestion: ' + err.message);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleVectorSearch = async () => {
    if (!vectorQuery.trim()) return;
    try {
      const res = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'search_docs', arguments: { query: vectorQuery, k: 4 } })
      });
      if (res.ok) {
        const data = await res.json();
        const rawJson = data.content?.[0]?.text;
        const parsed: VectorHit[] = JSON.parse(rawJson || '[]');
        setVectorHits(parsed);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleCallMcpTool = async () => {
    setMcpLoading(true);
    setMcpResult('');
    try {
      const args = mcpSelectedTool === 'search_docs' 
        ? { query: mcpQueryArg, k: mcpKArg }
        : { filename: mcpDocArg };

      const res = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mcpSelectedTool, arguments: args })
      });
      const data = await res.json();
      setMcpResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setMcpResult('Error calling MCP tool: ' + err.message);
    } finally {
      setMcpLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    if (!token) {
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'user',
          content: chatInput,
          timestamp: new Date().toLocaleTimeString()
        },
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: '⚠️ Authentication Required: You must log in via the JWT Auth Workbench tab first to access the protected /chat endpoint.',
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
      setChatInput('');
      return;
    }

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: chatInput,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    const currentQuery = chatInput;
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ query: currentQuery })
      });

      if (res.ok) {
        const data = await res.json();
        const botMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
          executionTrace: data.execution_trace,
          retryCount: data.retry_count,
          timestamp: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, botMsg]);
      } else {
        const errData = await res.json();
        const errorMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: `❌ Error (${res.status}): ${errData.detail || 'Failed to execute query'}`,
          timestamp: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: `❌ Request Error: ${err.message}`,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Secure Document Q&A Service
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                FastAPI (JWT) + LangGraph StateGraph + MCP Stdio Protocol + Chroma RAG
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* System Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-mono">
              <span className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-slate-300">FastAPI Backend:</span>
              <span className={serverOnline ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                {serverOnline ? 'Connected' : 'Connecting'}
              </span>
            </div>

            {/* Auth status indicator */}
            {currentUser ? (
              <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1.5 rounded-lg text-xs">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-mono">{currentUser.email}</span>
                <button
                  onClick={handleLogout}
                  className="ml-2 text-slate-400 hover:text-white underline text-[11px]"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab('auth')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                Login / Auth
              </button>
            )}
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto gap-1 border-t border-slate-800/60 py-1">
          <button
            onClick={() => setActiveTab('auth')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              activeTab === 'auth'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Key className="w-4 h-4" />
            JWT Auth Workbench (M1)
          </button>

          <button
            onClick={() => setActiveTab('ingest')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              activeTab === 'ingest'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Database className="w-4 h-4" />
            Corpus & Vector Ingestion (M2)
          </button>

          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              activeTab === 'mcp'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Terminal className="w-4 h-4" />
            MCP Stdio Protocol Inspector (M3)
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            LangGraph Agent Chat (M4/M5)
          </button>

          <button
            onClick={() => setActiveTab('readme')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
              activeTab === 'readme'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            README & Architecture
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 1: JWT AUTH WORKBENCH (M1) */}
        {activeTab === 'auth' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Registration Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">1. User Registration (`POST /auth/register`)</h3>
                    <p className="text-xs text-slate-400">Hashes password using bcrypt and stores in SQLite database</p>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-3 text-xs text-indigo-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Quick Demo Helper:
                </div>
                <p className="text-slate-300">Click below to generate a brand new user or use auto-registration:</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={generateRandomUser}
                    className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded text-[11px] font-medium transition-colors"
                  >
                    🎲 Generate Fresh Random Email & Password
                  </button>
                </div>
              </div>

              <form onSubmit={(e) => handleRegister(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    placeholder="e.g. intern@company.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password (min 6 chars)</label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  Register User in SQLite & Auto-Login
                </button>
              </form>
            </div>

            {/* Login Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">2. User Login (`POST /auth/login`)</h3>
                    <p className="text-xs text-slate-400">Verifies bcrypt hash & generates HS256 JWT access token</p>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-3 text-xs text-emerald-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Seeded Support Account:
                </div>
                <p className="text-slate-300">The database comes pre-seeded with a default support account:</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('support.agent@company.com');
                      setLoginPassword('SecurePass123!');
                      handleLogin(undefined, 'support.agent@company.com', 'SecurePass123!');
                    }}
                    className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 rounded text-[11px] font-medium transition-colors"
                  >
                    🔑 Instant Login as support.agent@company.com
                  </button>
                </div>
              </div>

              <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    placeholder="support.agent@company.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Obtain JWT Access Token
                </button>
              </form>
            </div>

            {/* Feedback Banners */}
            {authError && (
              <div className="lg:col-span-2 bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 flex items-center gap-3 text-rose-300 text-xs">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div>{authError}</div>
              </div>
            )}

            {authSuccess && (
              <div className="lg:col-span-2 bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-4 flex items-center gap-3 text-emerald-300 text-xs">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <div>{authSuccess}</div>
              </div>
            )}

            {/* Token Inspector & Protected Route Test */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">Active JWT Token & Claims Inspector</h3>
                </div>
                <button
                  onClick={verifyToken}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-md flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Test `GET /me`
                </button>
              </div>

              {token ? (
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-slate-400">Raw JWT Token String:</span>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 break-all overflow-x-auto mt-1 max-h-24">
                      {token}
                    </div>
                  </div>

                  {currentUser?.jwt_payload && (
                    <div>
                      <span className="text-slate-400">Decoded JWT Payload (Verified by HTTPBearer):</span>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-emerald-400 mt-1 overflow-x-auto">
                        {JSON.stringify(currentUser.jwt_payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No active JWT token. Please register and log in above to generate a verified token.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CORPUS & VECTOR INGESTION (M2) */}
        {activeTab === 'ingest' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    Corpus Documentation & Chroma Ingestion Engine
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Chunking policy: <strong>500 characters chunk size</strong>, <strong>100 characters overlap</strong>
                  </p>
                </div>

                <button
                  onClick={handleIngest}
                  disabled={isIngesting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isIngesting ? 'animate-spin' : ''}`} />
                  {isIngesting ? 'Ingesting...' : 'Run Ingestion Pipeline'}
                </button>
              </div>

              {ingestStatus && (
                <div className="bg-slate-950 border border-indigo-500/30 p-3 rounded-lg text-xs text-indigo-300 font-mono">
                  {ingestStatus}
                </div>
              )}

              {/* Document Files Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 max-h-96 overflow-y-auto">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Ingested Markdown Docs ({docs.length})
                  </h4>
                  {docs.map((doc) => (
                    <button
                      key={doc.filename}
                      onClick={() => {
                        setSelectedDoc(doc.filename);
                        loadDocContent(doc.filename);
                      }}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs font-mono transition-all flex items-center justify-between ${
                        selectedDoc === doc.filename
                          ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="truncate">{doc.filename}</span>
                      <span className="text-[10px] text-slate-500">{doc.size_bytes}B</span>
                    </button>
                  ))}
                </div>

                {/* Doc Content Preview */}
                <div className="md:col-span-2 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col max-h-96 overflow-y-auto">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>File Preview: {selectedDoc}</span>
                    <span className="text-[10px] text-indigo-400 font-mono">Raw Markdown</span>
                  </h4>
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed flex-1">
                    {docContent || 'Loading document content...'}
                  </pre>
                </div>
              </div>
            </div>

            {/* Vector Search Playground */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-400" />
                Vector Similarity Search Playground
              </h3>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={vectorQuery}
                  onChange={(e) => setVectorQuery(e.target.value)}
                  placeholder="Enter query to test cosine similarity search..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleVectorSearch}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Search Vectors
                </button>
              </div>

              {/* Hits Output */}
              {vectorHits.length > 0 && (
                <div className="space-y-3 mt-4">
                  <h4 className="text-xs font-semibold text-slate-400">Top Matching Vector Chunks:</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {vectorHits.map((hit) => (
                      <div key={hit.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-1.5 font-mono text-xs">
                        <div className="flex items-center justify-between text-indigo-400">
                          <span className="font-bold">Source: [{hit.source}]</span>
                          <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                            Similarity Score: {hit.score}
                          </span>
                        </div>
                        <div className="text-slate-300 text-xs leading-relaxed pt-1">{hit.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: MCP STDIO PROTOCOL INSPECTOR (M3) */}
        {activeTab === 'mcp' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-indigo-400" />
                    Model Context Protocol (MCP) Stdio Subprocess Inspector
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Isolated subprocess (`src/mcp_server.py`) communicating over stdio JSON-RPC 2.0 messages
                  </p>
                </div>

                <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono rounded-lg">
                  Protocol: stdio (JSON-RPC 2.0)
                </div>
              </div>

              {/* Tool Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Select MCP Tool</label>
                  <select
                    value={mcpSelectedTool}
                    onChange={(e) => setMcpSelectedTool(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="search_docs">search_docs(query, k)</option>
                    <option value="get_doc">get_doc(filename)</option>
                  </select>
                </div>

                {mcpSelectedTool === 'search_docs' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300">Query Argument</label>
                    <input
                      type="text"
                      value={mcpQueryArg}
                      onChange={(e) => setMcpQueryArg(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300">Filename Argument</label>
                    <input
                      type="text"
                      value={mcpDocArg}
                      onChange={(e) => setMcpDocArg(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleCallMcpTool}
                disabled={mcpLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Terminal className="w-4 h-4" />
                {mcpLoading ? 'Invoking MCP Stdio Subprocess...' : 'Execute Tool Call over Stdio Pipe'}
              </button>

              {/* Tool Output */}
              {mcpResult && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-slate-400">Raw MCP JSON-RPC Stdio Response:</span>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto max-h-96">
                    {mcpResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: LANGGRAPH AGENT CHAT (M4/M5) */}
        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Graph Visualizer Panel */}
            <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  LangGraph Agent Workflow
                </h3>

                <div className="space-y-3 mt-4 text-xs">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="text-indigo-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      1. Retrieve Node
                    </div>
                    <p className="text-slate-400 text-[11px]">Calls MCP stdio subprocess `search_docs` tool.</p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="text-amber-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      2. Grade Node (M5)
                    </div>
                    <p className="text-slate-400 text-[11px]">Grades document chunk relevance. Rewrites query if irrelevant (cap 1 retry).</p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      3. Generate Node
                    </div>
                    <p className="text-slate-400 text-[11px]">Synthesizes answer with explicit markdown source citations.</p>
                  </div>
                </div>
              </div>

              {/* Sample Questions */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-400">Sample Technical Queries:</span>
                <div className="space-y-1.5">
                  {[
                    'How is JWT authentication configured in FastAPI?',
                    'What is the chunk size and overlap ratio for ingestion?',
                    'Why does document retrieval sit behind an MCP server?',
                    'What is the password reset procedure in support?'
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setChatInput(q);
                      }}
                      className="w-full text-left p-2 rounded bg-slate-950 hover:bg-slate-800 text-[11px] text-slate-300 transition-colors border border-slate-800/60 truncate"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat Box */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col h-[600px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-400" />
                  Protected Support Q&A Chat
                </h3>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/50 px-2.5 py-1 rounded border border-emerald-800/60">
                  JWT Authorization Enforced
                </span>
              </div>

              {/* Message List */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-2 ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] text-indigo-400 font-bold">Sources:</span>
                          {msg.sources.map((src) => (
                            <span
                              key={src}
                              className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800 font-mono"
                            >
                              [{src}]
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.executionTrace && (
                        <div className="text-[10px] text-slate-500 font-mono pt-1">
                          Trace: {msg.executionTrace.join(' ➔ ')}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 font-mono px-1">{msg.timestamp}</span>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex items-center gap-2 text-xs text-indigo-400 font-mono bg-slate-950 p-3 rounded-xl border border-slate-800 w-fit">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Executing LangGraph StateGraph (Retrieve ➔ Grade ➔ Generate)...
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="pt-3 border-t border-slate-800 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question about internal documentation..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={chatLoading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  Ask Agent
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 6: README & ARCHITECTURE */}
        {activeTab === 'readme' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Project Requirements & Architecture Documentation
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-indigo-400 uppercase tracking-wider">Chunking Policy</h4>
                <p className="text-slate-300 leading-relaxed">
                  <strong>500 characters size with 100 characters overlap.</strong> Chosen because standard support documentation paragraphs average 300-600 characters, isolating semantic units cleanly without diluting vector embeddings.
                </p>
              </div>

              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-indigo-400 uppercase tracking-wider">MCP Stdio Isolation</h4>
                <p className="text-slate-300 leading-relaxed">
                  Retrieval sits behind an isolated stdio MCP server (`src/mcp_server.py`) to provide process sandboxing, cross-client tool standardization, decoupled microservice scaling, and independent tool testability via `mcp dev`.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
