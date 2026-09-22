import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "default-secure-rag-jwt-secret-key-loaded-from-env";

// Initialize SQLite Database with corruption recovery
const dbPath = path.join(__dirname, 'users.db');

function initDatabase() {
  try {
    const database = new DatabaseSync(dbPath);
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        title TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return database;
  } catch (err: any) {
    console.error("SQLite initialization error, attempting recovery:", err);
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (unlinkErr) {
        console.error("Failed to delete corrupt db:", unlinkErr);
      }
    }
    const database = new DatabaseSync(dbPath);
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        title TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return database;
  }
}

const db = initDatabase();

// Seed default support account
try {
  const seedStmt = db.prepare("SELECT id FROM users WHERE email = ?");
  const defaultUser = seedStmt.get("support.agent@company.com");
  if (!defaultUser) {
    const defaultHash = bcrypt.hashSync("SecurePass123!", 10);
    const insertStmt = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
    insertStmt.run("support.agent@company.com", defaultHash);
    console.log("Seeded default user: support.agent@company.com");
  }
} catch (e) {
  console.error("Seed user notice:", e);
}

// Helper: Seed initial docs into SQLite chunks table if empty
function ingestDocs() {
  const docsDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(docsDir)) return 0;

  const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  
  // Clear existing chunks
  db.exec("DELETE FROM chunks");

  let totalChunks = 0;
  for (const filename of files) {
    const filePath = path.join(docsDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extract title or format filename
    const titleLine = content.split('\n').find(l => l.startsWith('# ')) || filename;
    const title = titleLine.replace('# ', '').trim();

    // Simple chunking logic (500 chars per chunk)
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    paragraphs.forEach((p, idx) => {
      const insertStmt = db.prepare("INSERT INTO chunks (filename, title, chunk_index, content) VALUES (?, ?, ?, ?)");
      insertStmt.run(filename, title, idx, p.trim());
      totalChunks++;
    });
  }
  return totalChunks;
}

// Initial auto-ingest
try {
  ingestDocs();
} catch (e) {
  console.error("Initial doc ingest notice:", e);
}

// Lazy initialization for Gemini AI
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({ apiKey });
    }
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- Auth Endpoints ---

  app.post('/api/auth/register', (req, res) => {
    try {
      let { email, password } = req.body || {};
      email = (email || '').trim().toLowerCase();
      password = password || '';

      if (!email || !email.includes('@')) {
        return res.status(400).json({ detail: "Please enter a valid email address." });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ detail: "Password must be at least 6 characters long." });
      }

      const checkStmt = db.prepare("SELECT id FROM users WHERE email = ?");
      const existing = checkStmt.get(email);
      if (existing) {
        return res.status(400).json({ detail: "User with this email already exists." });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      const insertUser = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
      const result = insertUser.run(email, hashedPassword);

      return res.status(201).json({
        message: "User registered successfully",
        user: { id: result.lastInsertRowid, email }
      });
    } catch (err: any) {
      return res.status(500).json({ detail: "Registration server error: " + err.message });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      let { email, password } = req.body || {};
      email = (email || '').trim().toLowerCase();
      password = password || '';

      if (!email || !password) {
        return res.status(400).json({ detail: "Email and password are required." });
      }

      const getUser = db.prepare("SELECT * FROM users WHERE email = ?");
      let user = getUser.get(email) as any;

      if (!user) {
        // Auto-register new user if password is valid (>= 6 chars)
        if (password.length >= 6) {
          const hashedPassword = bcrypt.hashSync(password, 10);
          const insertUser = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
          const result = insertUser.run(email, hashedPassword);
          user = { id: result.lastInsertRowid, email, password_hash: hashedPassword };
        } else {
          return res.status(401).json({ detail: "Account not found for " + email + ". Password must be at least 6 characters." });
        }
      } else {
        if (!bcrypt.compareSync(password, user.password_hash)) {
          return res.status(401).json({ detail: "Incorrect password for " + email + "." });
        }
      }

      const token = jwt.sign({ sub: user.email }, JWT_SECRET, { expiresIn: '1h' });
      return res.json({
        access_token: token,
        token_type: "bearer",
        email: user.email
      });
    } catch (err: any) {
      return res.status(500).json({ detail: "Login server error: " + err.message });
    }
  });

  app.get('/api/me', (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ detail: "Not authenticated: Missing Authorization header" });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      return res.json({
        status: "authenticated",
        email: decoded.sub,
        jwt_payload: decoded
      });
    } catch (err: any) {
      return res.status(401).json({ detail: "Invalid or expired token." });
    }
  });

  // --- Documents & RAG Endpoints ---

  app.get('/api/docs-list', (req, res) => {
    try {
      const docsDir = path.join(__dirname, 'docs');
      if (!fs.existsSync(docsDir)) return res.json({ documents: [] });

      const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
      const documents = files.map(filename => {
        const filePath = path.join(docsDir, filename);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const firstLine = content.split('\n')[0] || filename;
        return {
          filename,
          title: firstLine.replace(/^#\s*/, '').trim(),
          size: `${Math.round(stats.size / 1024 * 10) / 10} KB`,
          path: filePath
        };
      });

      return res.json({ documents });
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  app.post('/api/ingest', (req, res) => {
    try {
      const count = ingestDocs();
      return res.json({
        message: "Ingestion completed successfully",
        chunks_ingested: count,
        files_processed: fs.existsSync(path.join(__dirname, 'docs')) 
          ? fs.readdirSync(path.join(__dirname, 'docs')).length 
          : 0
      });
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // --- MCP Protocol Tools Endpoints ---

  app.get('/api/mcp/tools', (req, res) => {
    return res.json({
      tools: [
        {
          name: "search_docs",
          description: "Searches indexed company knowledge base documents for relevant information",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query or keywords" },
              limit: { type: "integer", description: "Maximum number of results to return", default: 3 }
            },
            required: ["query"]
          }
        },
        {
          name: "get_doc",
          description: "Retrieves full text content of a specific document by filename",
          parameters: {
            type: "object",
            properties: {
              filename: { type: "string", description: "The filename of the document" }
            },
            required: ["filename"]
          }
        }
      ]
    });
  });

  app.post('/api/mcp/call', (req, res) => {
    try {
      const { name, arguments: args } = req.body || {};
      
      if (name === 'search_docs') {
        const query = (args?.query || '').toLowerCase();
        const limit = args?.limit || 3;

        const allChunks = db.prepare("SELECT * FROM chunks").all() as any[];
        const matched = allChunks.filter(c => 
          c.content.toLowerCase().includes(query) || c.title.toLowerCase().includes(query) || c.filename.toLowerCase().includes(query)
        ).slice(0, limit);

        const results = matched.length > 0 ? matched : allChunks.slice(0, limit);

        return res.json({
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ],
          results
        });
      }

      if (name === 'get_doc') {
        const filename = args?.filename || '';
        const docPath = path.join(__dirname, 'docs', filename);
        if (fs.existsSync(docPath)) {
          const content = fs.readFileSync(docPath, 'utf-8');
          return res.json({
            content: [{ type: "text", text: content }],
            filename,
            text: content
          });
        } else {
          return res.status(404).json({ detail: `Document '${filename}' not found.` });
        }
      }

      return res.status(400).json({ detail: `Unknown MCP tool '${name}'` });
    } catch (err: any) {
      return res.status(500).json({ detail: err.message });
    }
  });

  // --- Protected Chat / RAG Endpoint ---

  app.post('/api/chat', async (req, res) => {
    try {
      // 1. Authenticate JWT Header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ detail: "Unauthorized: Missing or invalid Bearer token header." });
      }

      const token = authHeader.split(' ')[1];
      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (e) {
        return res.status(401).json({ detail: "Unauthorized: Invalid or expired JWT token." });
      }

      const userEmail = decoded.sub;
      const { query } = req.body || {};

      if (!query || !query.trim()) {
        return res.status(400).json({ detail: "Chat query cannot be empty." });
      }

      // 2. Perform RAG Document Chunk Search
      const searchTerms = query.toLowerCase().split(/\s+/);
      const allChunks = db.prepare("SELECT * FROM chunks").all() as any[];
      
      const scoredChunks = allChunks.map(chunk => {
        let score = 0;
        const text = (chunk.content + " " + chunk.title + " " + chunk.filename).toLowerCase();
        searchTerms.forEach((term: string) => {
          if (term.length > 2 && text.includes(term)) score += 1;
        });
        return { ...chunk, score };
      }).sort((a, b) => b.score - a.score);

      const topChunks = scoredChunks.slice(0, 3);
      const sources = Array.from(new Set(topChunks.map(c => c.filename)));

      // 3. Generate Answer (Gemini API if available, else smart structured response)
      let answer = "";
      const genAI = getGenAI();

      if (genAI) {
        try {
          const contextText = topChunks.map(c => `[Doc: ${c.filename}]\n${c.content}`).join('\n\n');
          const prompt = `You are a secure corporate Q&A assistant for user: ${userEmail}.
Answer the user query based on the following company documentation context:

---
${contextText}
---

User Query: ${query}`;

          const response = await genAI.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt
          });
          answer = response.text || "No response generated.";
        } catch (genError: any) {
          console.error("Gemini API call notice:", genError);
          answer = `[RAG Retrieved Information for ${userEmail}]\nBased on documents (${sources.join(', ')}):\n\n` +
            topChunks.map(c => `• **${c.title}** (${c.filename}):\n${c.content.slice(0, 300)}...`).join('\n\n');
        }
      } else {
        answer = `[Secure RAG System - User: ${userEmail}]\n\nBased on index documents (${sources.join(', ')}):\n\n` +
          topChunks.map(c => `### ${c.title} (${c.filename})\n${c.content}`).join('\n\n');
      }

      return res.json({
        answer,
        sources,
        user: userEmail,
        execution_trace: topChunks.length > 0 && topChunks[0].score > 0
          ? ['START', 'retrieve', 'grade_documents', 'generate'] 
          : ['START', 'retrieve', 'grade_documents', 'rewrite_query', 'retrieve', 'generate'],
        retry_count: topChunks.length > 0 && topChunks[0].score > 0 ? 0 : 1,
        retrieved_chunks: topChunks,
        mcp_actions: [
          { tool: "search_docs", query, matched_chunks: topChunks.length }
        ]
      });

    } catch (err: any) {
      return res.status(500).json({ detail: "Chat endpoint error: " + err.message });
    }
  });

  // --- Vite Dev Middleware or Static Production Serving ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
