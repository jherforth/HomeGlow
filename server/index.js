// File: server/index.js
const fastify = require('fastify')({ logger: true });
const Database = require('better-sqlite3');
const ical = require('ical-generator');
const node_ical = require('node-ical');
const path = require('path');
const fs = require('fs').promises;
const multipart = require('@fastify/multipart');
const crypto = require('crypto');
require('dotenv').config();

// NEW: Import axios for HTTP requests and ical.js for parsing
const axios = require('axios');
const ICAL = require('ical.js');
// For widget upload and registry
const widgetRegistryPath = path.join(__dirname, 'widgets_registry.json');

// GitHub API configuration
const GITHUB_REPO_OWNER = 'jherforth';
const GITHUB_REPO_NAME = 'HomeGlowPlugins';
const GITHUB_API_BASE = 'https://api.github.com';

// Encryption utilities for calendar credentials
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'homeglow-default-key-change-in-production-32bytes';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

function encryptPassword(password) {
  if (!password) return null;
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPassword(encryptedPassword) {
  if (!encryptedPassword) return null;
  try {
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const parts = encryptedPassword.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Error decrypting password:', error);
    return null;
  }
}

// Initialize Fastify with CORS
fastify.register(require('@fastify/cors'), {
  origin: '*', // Allow all origins for development. Consider restricting in production.
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Explicitly allow PATCH
  allowedHeaders: ['Content-Type', 'Authorization'], // Add any other headers your client might send
});

fastify.register(multipart);

// Add a preHandler hook to log all incoming requests
fastify.addHook('preHandler', (request, reply, done) => {
  console.log(`Incoming request: ${request.method} ${request.url}`);
  done();
});

// Serve static files for uploads
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'uploads'),
  prefix: '/Uploads/',
  decorateReply: false,
  maxAge: 86400000, // 1 day cache
  setHeaders: (res, path) => {
    // Minimize headers to avoid "Request Header Fields Too Large" error
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
});

// Additional static route specifically for user uploads
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'uploads', 'users'),
  prefix: '/Uploads/users/',
  decorateReply: false,
  maxAge: 86400000, // 1 day cache
  setHeaders: (res, path) => {
    // Minimize headers to avoid "Request Header Fields Too Large" error
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
});

// Serve static files for widgets
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'widgets'),
  prefix: '/widgets/',
  decorateReply: false
});

// Add debugging for widget file requests
fastify.get('/widgets/:filename', async (request, reply) => {
  const { filename } = request.params;
  const filePath = path.join(__dirname, 'widgets', filename);
  
  console.log(`Widget request for: ${filename}`);
  console.log(`Looking for file at: ${filePath}`);
  
  try {
    const stats = await fs.stat(filePath);
    console.log(`File exists, size: ${stats.size} bytes`);
    
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`File content preview: ${content.substring(0, 100)}...`);
    
    reply.header('Content-Type', 'text/html');
    return content;
  } catch (error) {
    console.error(`Error serving widget ${filename}:`, error);
    reply.status(404).send(`Widget file not found: ${filename}`);
  }
});

// Add a simple test endpoint
fastify.get('/api/test', async (request, reply) => {
  return { 
    message: 'Server is working!', 
    timestamp: new Date().toISOString(),
    widgetsDir: path.join(__dirname, 'widgets')
  };
});

// Serve the main CSS file for widgets
fastify.get('/index.css', async (request, reply) => {
  try {
    // Try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '..', 'client', 'src', 'index.css'),
      path.join(__dirname, 'client', 'src', 'index.css'),
      '/app/client/src/index.css',
      path.join(process.cwd(), 'client', 'src', 'index.css')
    ];
    
    console.log('Looking for CSS file in paths:', possiblePaths);
    console.log('Current working directory:', process.cwd());
    console.log('__dirname:', __dirname);
    
    let cssContent = null;
    let successPath = null;
    
    for (const cssPath of possiblePaths) {
      try {
        cssContent = await fs.readFile(cssPath, 'utf-8');
        successPath = cssPath;
        console.log('Successfully found CSS at:', cssPath);
        break;
      } catch (pathError) {
        console.log('Failed to read CSS from:', cssPath, pathError.message);
      }
    }
    
    if (cssContent) {
      reply.header('Content-Type', 'text/css');
      reply.header('Access-Control-Allow-Origin', '*');
      return cssContent;
    }
    
    throw new Error('CSS file not found in any expected location');
  } catch (error) {
    console.error('Error serving index.css:', error);
    
    // Fallback: serve minimal CSS for widgets
    const fallbackCSS = `
      :root {
        --background: #f4f4f9;
        --card-bg: rgba(255, 255, 255, 0.8);
        --card-border: rgba(255, 255, 255, 0.2);
        --text-color: #1a1a2e;
        --text-color-rgb: 26, 26, 46;
        --accent: #6e44ff;
        --accent-rgb: 110, 68, 255;
        --shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        --backdrop-blur: blur(10px);
        --dynamic-text-size: 16px;
        --dynamic-card-width: 300px;
        --dynamic-card-padding: 20px;
        --error-color: #ff4444;
        --light-gradient-start: #00ddeb;
        --light-gradient-end: #ff6b6b;
        --dark-gradient-start: #2e2767;
        --dark-gradient-end: #620808;
        --light-button-gradient-start: #00ddeb;
        --light-button-gradient-end: #ff6b6b;
        --dark-button-gradient-start: #2e2767;
        --dark-button-gradient-end: #620808;
        --gradient: linear-gradient(45deg, var(--light-gradient-start), var(--light-gradient-end));
      }
      
      [data-theme="dark"] {
        --background: #0a0a1a;
        --card-bg: rgba(30, 30, 50, 0.7);
        --card-border: rgba(100, 100, 150, 0.3);
        --text-color: #a6a6d1;
        --text-color-rgb: 166, 166, 209;
        --accent: #00ddeb;
        --accent-rgb: 0, 221, 235;
        --shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        --gradient: linear-gradient(45deg, var(--dark-gradient-start), var(--dark-gradient-end));
      }
      
      html, body {
        margin: 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: var(--background);
        color: var(--text-color);
        transition: background 0.3s ease, color 0.3s ease;
        touch-action: manipulation;
        width: 100%;
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        font-size: var(--dynamic-text-size);
      }
      
      .card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: var(--dynamic-card-padding);
        backdrop-filter: var(--backdrop-blur);
        box-shadow: var(--shadow);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        width: 100%;
        max-width: var(--dynamic-card-width);
        touch-action: manipulation;
      }
      
      .card:hover {
        transform: translateY(-5px);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
      }
      
      h1, h2, h3, h4, h5, h6 {
        font-weight: 700;
        letter-spacing: 0.5px;
        color: var(--text-color);
      }
      
      button {
        background: linear-gradient(45deg, var(--light-button-gradient-start), var(--light-button-gradient-end));
        color: var(--text-color);
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 600;
        transition: background 0.3s ease;
        touch-action: manipulation;
      }
      
      [data-theme="dark"] button {
        background: linear-gradient(45deg, var(--dark-button-gradient-start), var(--dark-button-gradient-end));
      }
      
      button:hover {
        filter: brightness(1.1);
      }
    `;
    
    console.log('Serving fallback CSS');
    reply.header('Content-Type', 'text/css');
    reply.header('Access-Control-Allow-Origin', '*');
    return fallbackCSS;
  }
});

// --- Widget Upload Endpoint and Registry ---

// Helper: Load widget registry
async function loadWidgetRegistry() {
  try {
    const data = await fs.readFile(widgetRegistryPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// Helper: Save widget registry
async function saveWidgetRegistry(registry) {
  await fs.writeFile(widgetRegistryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

// Endpoint: Upload a widget (HTML file)
fastify.post('/api/widgets/upload', async (request, reply) => {
  try {
    const data = await request.file();
    if (!data || !data.filename.endsWith('.html')) {
      return reply.status(400).send({ error: 'Only HTML widget files are allowed.' });
    }

    const widgetName = data.filename.replace(/[^a-zA-Z0-9-._]/g, '_');
    const savePath = path.join(__dirname, 'widgets', widgetName);

    // Save the file
    await fs.writeFile(savePath, await data.toBuffer());

    // Update registry
    const registry = await loadWidgetRegistry();
    if (!registry.find(w => w.filename === widgetName)) {
      registry.push({
        name: widgetName.replace('.html', ''),
        filename: widgetName,
        uploadedAt: new Date().toISOString()
      });
      await saveWidgetRegistry(registry);
    }

    return { success: true, message: 'Widget uploaded!', widget: widgetName };
  } catch (err) {
    console.error('Widget upload error:', err);
    reply.status(500).send({ error: 'Failed to upload widget.' });
  }
});

// Endpoint: List widgets
fastify.get('/api/widgets', async (request, reply) => {
  try {
    const registry = await loadWidgetRegistry();
    return registry;
  } catch (err) {
    reply.status(500).send({ error: 'Failed to load widget registry.' });
  }
});

// Endpoint: Delete a widget
fastify.delete('/api/widgets/:filename', async (request, reply) => {
  const { filename } = request.params;
  try {
    const filePath = path.join(__dirname, 'widgets', filename);
    await fs.unlink(filePath);

    // Update registry
    let registry = await loadWidgetRegistry();
    registry = registry.filter(w => w.filename !== filename);
    await saveWidgetRegistry(registry);

    return { success: true, message: 'Widget deleted.' };
  } catch (err) {
    reply.status(500).send({ error: 'Failed to delete widget.' });
  }
});

// Debug endpoint to list widget files
fastify.get('/api/widgets/debug', async (request, reply) => {
  try {
    const widgetsDir = path.join(__dirname, 'widgets');
    console.log(`Checking widgets directory: ${widgetsDir}`);
    
    const files = await fs.readdir(widgetsDir);
    console.log(`Files in widgets directory:`, files);
    
    const fileDetails = [];
    for (const file of files) {
      const filePath = path.join(widgetsDir, file);
      try {
        const stats = await fs.stat(filePath);
        fileDetails.push({
          name: file,
          size: stats.size,
          isFile: stats.isFile(),
          modified: stats.mtime
        });
      } catch (err) {
        fileDetails.push({
          name: file,
          error: err.message
        });
      }
    }
    
    return {
      directory: widgetsDir,
      files: fileDetails,
      registry: await loadWidgetRegistry()
    };
  } catch (error) {
    console.error('Error reading widgets directory:', error);
    return { error: error.message };
  }
});

// Endpoint: List available widgets from GitHub repository
fastify.get('/api/widgets/github', async (request, reply) => {
  try {
    console.log('Fetching widgets from GitHub repository...');
    
    // Get repository contents
    const repoUrl = `${GITHUB_API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents`;
    const response = await axios.get(repoUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'HomeGlow-Server/1.0'
      },
      timeout: 10000
    });

    // Filter for HTML files and directories
    const items = response.data.filter(item => 
      item.type === 'file' && item.name.endsWith('.html') ||
      item.type === 'dir'
    );

    const widgets = [];
    
    for (const item of items) {
      if (item.type === 'file' && item.name.endsWith('.html')) {
        // Direct HTML file in root
        widgets.push({
          name: item.name.replace('.html', ''),
          filename: item.name,
          description: `Widget: ${item.name.replace('.html', '')}`,
          download_url: item.download_url,
          path: item.path,
          size: item.size,
          type: 'file'
        });
      } else if (item.type === 'dir') {
        // Check if directory contains HTML files
        try {
          const dirUrl = `${GITHUB_API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${item.path}`;
          const dirResponse = await axios.get(dirUrl, {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'HomeGlow-Server/1.0'
            },
            timeout: 5000
          });
          
          const htmlFiles = dirResponse.data.filter(file => 
            file.type === 'file' && file.name.endsWith('.html')
          );
          
          for (const htmlFile of htmlFiles) {
            widgets.push({
              name: `${item.name}/${htmlFile.name.replace('.html', '')}`,
              filename: htmlFile.name,
              description: `Widget from ${item.name} folder`,
              download_url: htmlFile.download_url,
              path: htmlFile.path,
              size: htmlFile.size,
              type: 'file',
              folder: item.name
            });
          }
        } catch (dirError) {
          console.warn(`Could not read directory ${item.name}:`, dirError.message);
        }
      }
    }

    console.log(`Found ${widgets.length} widgets in GitHub repository`);
    return widgets;
    
  } catch (error) {
    console.error('Error fetching GitHub widgets:', error);
    if (error.response) {
      return reply.status(error.response.status).send({ 
        error: `GitHub API error: ${error.response.status} ${error.response.statusText}`,
        details: error.response.data 
      });
    }
    return reply.status(500).send({ 
      error: 'Failed to fetch widgets from GitHub repository',
      details: error.message 
    });
  }
});

// Endpoint: Install a widget from GitHub repository
fastify.post('/api/widgets/github/install', async (request, reply) => {
  try {
    const { download_url, filename, name } = request.body;
    
    if (!download_url || !filename) {
      return reply.status(400).send({ error: 'download_url and filename are required' });
    }

    console.log(`Installing widget ${filename} from GitHub...`);
    
    // Download the widget file
    const response = await axios.get(download_url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'HomeGlow-Server/1.0'
      },
      timeout: 15000
    });
    
    // Sanitize filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9-._]/g, '_');
    const savePath = path.join(__dirname, 'widgets', sanitizedFilename);
    
    // Save the widget file
    await fs.writeFile(savePath, response.data, 'utf-8');
    
    // Update registry
    const registry = await loadWidgetRegistry();
    const existingWidget = registry.find(w => w.filename === sanitizedFilename);
    
    if (!existingWidget) {
      registry.push({
        name: name || sanitizedFilename.replace('.html', ''),
        filename: sanitizedFilename,
        uploadedAt: new Date().toISOString(),
        source: 'github',
        originalUrl: download_url
      });
      await saveWidgetRegistry(registry);
    }
    
    console.log(`Successfully installed widget: ${sanitizedFilename}`);
    return { 
      success: true, 
      message: 'Widget installed successfully!', 
      widget: sanitizedFilename 
    };
    
  } catch (error) {
    console.error('Error installing GitHub widget:', error);
    if (error.response) {
      return reply.status(error.response.status).send({ 
        error: `Failed to download widget: ${error.response.status} ${error.response.statusText}`,
        details: error.response.data 
      });
    }
    return reply.status(500).send({ 
      error: 'Failed to install widget from GitHub',
      details: error.message 
    });
  }
});

// Initialize database
const dbPath = path.resolve(__dirname, 'data', 'tasks.db');
console.log('Database path:', dbPath);
let db; // Declare db variable outside to hold the single instance

async function initializeDatabase() {
  try {
    // Ensure the 'data' directory exists and is writable
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.chmod(path.dirname(dbPath), 0o777); // Ensure directory is writable
    const newDb = new Database(dbPath, { verbose: console.log });
    newDb.exec(`
      CREATE TABLE IF NOT EXISTS chores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,\
        description TEXT,\
        time_period TEXT,\
        assigned_day_of_week TEXT,\
        repeat_type TEXT,\
        completed BOOLEAN,
        clam_value INTEGER DEFAULT 0,
        expiration_date TEXT
      );\
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        username TEXT,\
        email TEXT,\
        profile_picture TEXT,\
        clam_total INTEGER DEFAULT 0
      );
      INSERT OR IGNORE INTO users (id, username, email, profile_picture, clam_total) VALUES (0, 'bonus', 'bonus@example.com', '', 0);\
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        user_id INTEGER,\
        summary TEXT,\
        start TEXT,\
        end TEXT,\
        description TEXT
      );\
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS prizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        clam_cost INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS calendar_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        username TEXT,
        password TEXT,
        color TEXT NOT NULL DEFAULT '#6e44ff',
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_sources_enabled ON calendar_sources(enabled);
      CREATE INDEX IF NOT EXISTS idx_calendar_sources_sort_order ON calendar_sources(sort_order);
      CREATE TABLE IF NOT EXISTS photo_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT,
        api_key TEXT,
        username TEXT,
        password TEXT,
        album_id TEXT,
        refresh_token TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_photo_sources_enabled ON photo_sources(enabled);
      CREATE INDEX IF NOT EXISTS idx_photo_sources_sort_order ON photo_sources(sort_order);
      CREATE TABLE IF NOT EXISTS admin_pin (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        pin_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Migration: Add repeat_type column if it doesn't exist and remove old repeats column
    try {
      // Check if repeat_type column exists
      const columns = newDb.prepare("PRAGMA table_info(chores)").all();
      const hasRepeatType = columns.some(col => col.name === 'repeat_type');
      const hasRepeats = columns.some(col => col.name === 'repeats');
      
      if (!hasRepeatType) {
        console.log('Adding repeat_type column to chores table...');
        newDb.exec('ALTER TABLE chores ADD COLUMN repeat_type TEXT DEFAULT "no-repeat"');
        
        // If old repeats column exists, migrate data
        if (hasRepeats) {
          console.log('Migrating data from repeats to repeat_type...');
          newDb.exec(`
            UPDATE chores 
            SET repeat_type = CASE 
              WHEN repeats = 1 OR repeats = 'true' THEN 'weekly'
              ELSE 'no-repeat'
            END
          `);
        }
      }
      
      // Remove old repeats column if it exists
      if (hasRepeats) {
        console.log('Removing old repeats column...');
        // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
        newDb.exec(`
          CREATE TABLE chores_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            description TEXT,
            time_period TEXT,
            assigned_day_of_week TEXT,
            repeat_type TEXT,
            completed BOOLEAN,
            clam_value INTEGER DEFAULT 0,
            expiration_date TEXT
          );
          
          INSERT INTO chores_new (id, user_id, title, description, time_period, assigned_day_of_week, repeat_type, completed, clam_value, expiration_date)
          SELECT id, user_id, title, description, time_period, assigned_day_of_week, repeat_type, completed, clam_value, expiration_date
          FROM chores;
          
          DROP TABLE chores;
          ALTER TABLE chores_new RENAME TO chores;
        `);
        console.log('Migration completed successfully!');
      }
      
    } catch (migrationError) {
      console.error('Migration error:', migrationError);
      // Continue anyway - the app might still work with the new schema
    }

    // Migration: Move existing ICS_CALENDAR_URL to calendar_sources table
    try {
      const existingCalendars = newDb.prepare('SELECT COUNT(*) as count FROM calendar_sources').get();
      if (existingCalendars.count === 0) {
        const icsUrlSetting = newDb.prepare('SELECT value FROM settings WHERE key = ?').get('ICS_CALENDAR_URL');
        if (icsUrlSetting && icsUrlSetting.value) {
          console.log('Migrating existing ICS_CALENDAR_URL to calendar_sources table...');
          newDb.prepare(`
            INSERT INTO calendar_sources (name, type, url, color, enabled, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run('Default Calendar', 'ICS', icsUrlSetting.value, '#6e44ff', 1, 0);
          console.log('ICS calendar migrated successfully!');
        }
      }
    } catch (calendarMigrationError) {
      console.error('Calendar migration error:', calendarMigrationError);
    }

    return newDb; // Return the new database instance
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// Function to prune and reset chores based on the day
async function pruneAndResetChores() {
  try {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[new Date().getDay()];
    const now = new Date();

    // Select all chores to process
    const allChores = db.prepare('SELECT id, user_id, assigned_day_of_week, repeat_type, completed, clam_value, expiration_date FROM chores').all();

    for (const chore of allChores) {
      // Handle bonus chores
      if (chore.clam_value > 0) {
        // If bonus chore is completed, delete it
        if (chore.completed) {
          db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
          console.log(`Deleted completed bonus chore ID ${chore.id}.`);
        } else if (chore.expiration_date) {
          // If bonus chore is not completed and has an expiration date
          const expirationDate = new Date(chore.expiration_date);
          if (now > expirationDate) {
            // Reassign to bonus user (ID 0) and reset completed status
            db.prepare('UPDATE chores SET user_id = 0, completed = 0, expiration_date = NULL WHERE id = ?').run(chore.id);
            console.log(`Reassigned expired bonus chore ID ${chore.id} back to bonus user.`);
          }
        }
      } else {
        // Handle regular chores (existing logic)
        if (chore.completed) {
          if (chore.repeat_type === "no-repeat") {
            // Only delete non-repeating chores if they're not for today
            if (chore.assigned_day_of_week !== currentDay) {
              db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
              console.log(`Deleted non-repeating chore ID ${chore.id}.`);
            }
          } else if (chore.repeat_type === "until-completed") {
            // Delete "until-completed" chores once they're completed
            db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
            console.log(`Deleted "until-completed" chore ID ${chore.id} after completion.`);
          } else if (chore.repeat_type === "weekly" || chore.repeat_type === "daily") {
            // For daily chores, reset every day. For weekly chores, reset when it's their assigned day again
            if (chore.repeat_type === "daily" || chore.assigned_day_of_week === currentDay) {
              db.prepare('UPDATE chores SET completed = 0 WHERE id = ?').run(chore.id);
              console.log(`Reset repeating chore ID ${chore.id} to uncompleted.`);
            }
          }
        }
        
        // Handle "until-completed" chores that need to appear on new days
        if (!chore.completed && chore.repeat_type === "until-completed") {
          // For "until-completed" chores that aren't completed, check if they should repeat daily
          if (chore.assigned_day_of_week !== currentDay) {
            // Create a new instance for today if it doesn't exist
            const existingTodayChore = db.prepare('SELECT id FROM chores WHERE user_id = ? AND title = ? AND assigned_day_of_week = ? AND repeat_type = "until-completed"').get(chore.user_id, chore.title, currentDay);
            if (!existingTodayChore) {
              db.prepare('INSERT INTO chores (user_id, title, description, time_period, assigned_day_of_week, repeat_type, completed, clam_value, expiration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
                chore.user_id, chore.title, chore.description || '', chore.time_period || 'any-time', currentDay, 'until-completed', 0, 0, null
              );
              console.log(`Created new "until-completed" chore instance for today: ${chore.title}`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during chore pruning and reset:', error);
  }
}


// Chore routes
fastify.get('/api/chores', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM chores').all(); // Use the global db instance
    return rows;
  } catch (error) {
    console.error('Error fetching chores:', error);
    reply.status(500).send({ error: 'Failed to fetch chores' });
  }
});

fastify.post('/api/chores', async (request, reply) => {
  const { user_id, title, description, time_period, assigned_day_of_week, repeat_type, completed, clam_value, expiration_date } = request.body;
  try {
    const completedInt = completed ? 1 : 0;
    const stmt = db.prepare('INSERT INTO chores (user_id, title, description, time_period, assigned_day_of_week, repeat_type, completed, clam_value, expiration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, title, description, time_period, assigned_day_of_week, repeat_type, completedInt, clam_value, expiration_date);
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding chore:', error);
    reply.status(500).send({ error: 'Failed to add chore' });
  }
});

fastify.patch('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  const { completed } = request.body;
  try {
    const completedInt = completed ? 1 : 0;
    const stmt = db.prepare('UPDATE chores SET completed = ? WHERE id = ?');
    stmt.run(completedInt, id);

    // --- Clam Reward Logic ---\
    // Get the chore details to find the user_id and assigned_day_of_week
    const chore = db.prepare('SELECT user_id, clam_value, assigned_day_of_week FROM chores WHERE id = ?').get(id);

    if (chore) {
      // 1. Reward for bonus chores
      if (completed && chore.clam_value > 0) { // Only reward if marked completed and it's a bonus chore
        const userUpdateStmt = db.prepare('UPDATE users SET clam_total = clam_total + ? WHERE id = ?');
        userUpdateStmt.run(chore.clam_value, chore.user_id);
        console.log(`User ${chore.user_id} rewarded ${chore.clam_value} clams for completing bonus chore ID ${id}.`);
      }

      // 2. Reward for completing all *regular* daily chores
      // Only apply this if the current chore is NOT a bonus chore (clam_value === 0)
      if (completed && chore.clam_value === 0) {
        // Get all *regular* chores for this user and day
        const usersRegularChoresForDay = db.prepare('SELECT completed FROM chores WHERE user_id = ? AND assigned_day_of_week = ? AND clam_value = 0').all(chore.user_id, chore.assigned_day_of_week);

        // Check if all *regular* chores for this user and day are completed
        const allRegularChoresCompleted = usersRegularChoresForDay.every(c => c.completed === 1);

        if (allRegularChoresCompleted) {
          // Reward user with 2 clams
          const userUpdateStmt = db.prepare('UPDATE users SET clam_total = clam_total + 2 WHERE id = ?');
          userUpdateStmt.run(chore.user_id);
          console.log(`User ${chore.user_id} rewarded 2 clams for completing all regular chores on ${chore.assigned_day_of_week}.`);
        }
      }
    }
    // --- End Clam Reward Logic ---\

    return { success: true };
  } catch (error) {
    console.error('Error updating chore:', error);
    reply.status(500).send({ error: 'Failed to update chore' });
  }
});

// NEW: Endpoint to delete a chore
fastify.delete('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const stmt = db.prepare('DELETE FROM chores WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Chore not found' });
    }
    return { success: true, message: 'Chore deleted successfully' };
  } catch (error) {
    console.error('Error deleting chore:', error);
    reply.status(500).send({ error: 'Failed to delete chore' });
  }
});


// NEW: Endpoint to assign a bonus chore to a user
fastify.patch('/api/chores/:id/assign', async (request, reply) => {
  const { id } = request.params;
  const { user_id } = request.body;

  try {
    // 1. Check if the chore exists and is a bonus chore (assigned to user_id 0)
    const chore = db.prepare('SELECT id, user_id, completed, clam_value FROM chores WHERE id = ?').get(id);
    if (!chore) {
      return reply.status(404).send({ error: 'Chore not found.' });
    }
    if (chore.user_id !== 0 || chore.clam_value === 0) {
      return reply.status(400).send({ error: 'This is not an unassigned bonus chore.' });
    }

    // 2. Check if the target user already has an uncompleted bonus chore
    const existingBonusChore = db.prepare('SELECT id FROM chores WHERE user_id = ? AND clam_value > 0 AND completed = 0').get(user_id);
    if (existingBonusChore) {
      return reply.status(409).send({ error: 'User already has an uncompleted bonus chore. Complete it first!' });
    }

    // 3. Assign the chore to the user and set expiration date (24 hours from now)
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 24);

    const stmt = db.prepare('UPDATE chores SET user_id = ?, completed = 0, expiration_date = ? WHERE id = ?');
    stmt.run(user_id, expirationDate.toISOString(), id);

    return { success: true, message: 'Bonus chore assigned successfully.' };
  } catch (error) {
    console.error('Error assigning bonus chore:', error);
    reply.status(500).send({ error: 'Failed to assign bonus chore.' });
  }
});


// User routes
fastify.get('/api/users', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT id, username, email, profile_picture, clam_total FROM users').all();
    return rows;
  } catch (error) {
    console.error('Error fetching users:', error);
    reply.status(500).send({ error: 'Failed to fetch users' });
  }
});

fastify.post('/api/users', async (request, reply) => {
  const { username, email, profile_picture } = request.body;
  try {
    const stmt = db.prepare('INSERT INTO users (username, email, profile_picture) VALUES (?, ?, ?)');
    const info = stmt.run(username, email, profile_picture);
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding user:', error);
    reply.status(500).send({ error: 'Failed to add user' });
  }
});

// NEW: Endpoint to update user profile
fastify.patch('/api/users/:id', async (request, reply) => {
  const { id } = request.params;
  const { username, email, profile_picture } = request.body;
  try {
    const stmt = db.prepare('UPDATE users SET username = ?, email = ?, profile_picture = ? WHERE id = ?');
    const info = stmt.run(username, email, profile_picture, id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return { success: true, message: 'User updated successfully' };
  } catch (error) {
    console.error('Error updating user:', error);
    reply.status(500).send({ error: 'Failed to update user' });
  }
});

// NEW: Endpoint to upload user profile picture
fastify.post('/api/users/:id/upload-picture', async (request, reply) => {
  try {
    const { id } = request.params;
    const data = await request.file();
    
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Only image files (JPEG, PNG, GIF) are allowed' });
    }

    // Create users directory if it doesn't exist
    const usersDir = path.join(__dirname, 'uploads', 'users');
    await fs.mkdir(usersDir, { recursive: true });

    // Generate unique filename
    const fileExtension = data.filename.split('.').pop();
    const filename = `user_${id}_${Date.now()}.${fileExtension}`;
    const filepath = path.join(usersDir, filename);

    // Save file
    await fs.writeFile(filepath, await data.toBuffer());

    // Update user record
    const stmt = db.prepare('UPDATE users SET profile_picture = ? WHERE id = ?');
    const info = stmt.run(filename, id);
    
    if (info.changes === 0) {
      // Clean up uploaded file if user doesn't exist
      await fs.unlink(filepath);
      return reply.status(404).send({ error: 'User not found' });
    }

    return { 
      success: true, 
      message: 'Profile picture uploaded successfully',
      filename: filename 
    };
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    reply.status(500).send({ error: 'Failed to upload profile picture' });
  }
});

// NEW: Endpoint to update user clam total (for manual adjustments or future use)
fastify.patch('/api/users/:id/clams', async (request, reply) => {
  const { id } = request.params;
  const { clam_total } = request.body; // Expecting the new total or a delta
  try {
    const stmt = db.prepare('UPDATE users SET clam_total = ? WHERE id = ?');
    stmt.run(clam_total, id);
    return { success: true };
  } catch (error) {
    console.error('Error updating user clams:', error);
    reply.status(500).send({ error: 'Failed to update user clams' });
  }
});

// NEW: Endpoint to delete a user
fastify.delete('/api/users/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    // Optional: Delete associated chores first if desired, or set user_id to NULL
    // db.prepare('DELETE FROM chores WHERE user_id = ?').run(id);\
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return { success: true, message: 'User deleted successfully' };
  } catch (error) {
    console.error('Error deleting user:', error);
    reply.status(500).send({ error: 'Failed to delete user' });
  }
});


// Calendar routes (existing)
fastify.get('/api/calendar', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM events').all();
    return rows;
  }  catch (error) {
    console.error('Error fetching events:', error);
    reply.status(500).send({ error: 'Failed to fetch events' });
  }
});

fastify.post('/api/calendar', async (request, reply) => {
  const { user_id, summary, start, end, description } = request.body;
  try {
    const stmt = db.prepare('INSERT INTO events (user_id, summary, start, end, description) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, summary, start, end, description);
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding event:', error);
    reply.status(500).send({ error: 'Failed to add event' });
  }
});

fastify.get('/api/calendar/ics', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM events').all();
    const calendar = ical({ name: 'HomeGlow Calendar' });
    rows.forEach((event) => {
      calendar.createEvent({
        start: new Date(event.start),
        end: new Date(event.end),
        summary: event.summary,
        description: event.description,
      });
    });
    reply.header('Content-Type', 'text/calendar');
    return calendar.toString();
  } catch (error) {
    console.error('Error generating iCalendar:', error);
    reply.status(500).send('Failed to generate iCalendar');
  }
});

// NEW: API Endpoints for Settings (including API keys)
fastify.get('/api/settings', async (request, reply) => {
  try {
    console.log('=== FETCHING SETTINGS ===');
    const rows = db.prepare('SELECT key, value FROM settings').all();
    console.log('Raw settings from database:', rows);
    // Convert array of {key, value} objects to a single object {key: value}
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    console.log('Processed settings object:', settings);
    return settings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    reply.status(500).send({ error: 'Failed to fetch settings' });
  }
});

fastify.post('/api/settings', async (request, reply) => {
  const { key, value } = request.body;
  console.log('=== SAVING SETTING ===');
  console.log('Key:', key);
  console.log('Value:', value);
  console.log('Value type:', typeof value);
  console.log('Value length:', value ? value.length : 'null/undefined');
  
  // Special logging for weather API key
  if (key === 'WEATHER_API_KEY') {
    console.log('=== WEATHER API KEY SPECIFIC LOGGING ===');
    console.log('Weather API Key received:', value);
    console.log('Is empty string?', value === '');
    console.log('Is null?', value === null);
    console.log('Is undefined?', value === undefined);
  }
  
  if (!key || value === undefined) {
    console.log('ERROR: Missing key or value');
    return reply.status(400).send({ error: 'Key and value are required.' });
  }
  try {
    // Use INSERT OR REPLACE to either insert a new setting or update an existing one
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const result = stmt.run(key, value);
    console.log('Database insert result:', result);
    
    // Verify the setting was saved
    const verification = db.prepare('SELECT key, value FROM settings WHERE key = ?').get(key);
    console.log('Verification query result:', verification);
    
    // Special verification for weather API key
    if (key === 'WEATHER_API_KEY') {
      console.log('=== WEATHER API KEY VERIFICATION ===');
      console.log('Saved value in DB:', verification ? verification.value : 'NOT FOUND');
      console.log('Value matches input?', verification && verification.value === value);
    }
    
    return { success: true, message: `Setting '${key}' saved successfully.` };
  } catch (error) {
    console.error(`Error saving setting '${key}':`, error);
    reply.status(500).send({ error: `Failed to save setting '${key}'` });
  }
});

// DEBUG: Specific endpoint to test API key saving
fastify.post('/api/test-api-key', async (request, reply) => {
  const { apiKey } = request.body;
  console.log('=== TESTING API KEY SAVE ===');
  console.log('Received API key:', apiKey);
  console.log('API key type:', typeof apiKey);
  console.log('API key length:', apiKey ? apiKey.length : 'null/undefined');
  
  try {
    // Test direct database insertion
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const result = stmt.run('WEATHER_API_KEY', apiKey);
    console.log('Direct insert result:', result);
    
    // Verify it was saved
    const verification = db.prepare('SELECT key, value FROM settings WHERE key = ?').get('WEATHER_API_KEY');
    console.log('Verification result:', verification);
    
    return { 
      success: true, 
      message: 'API key test completed',
      saved: verification 
    };
  } catch (error) {
    console.error('Test API key save error:', error);
    return reply.status(500).send({ error: error.message });
  }
});

// NEW: Generic CORS Proxy Endpoint
fastify.get('/api/proxy', async (request, reply) => {
  console.log('=== PROXY REQUEST RECEIVED ===');
  console.log('Query params:', request.query);
  console.log('Headers:', request.headers);
  
  const { targetUrl } = request.query;

  if (!targetUrl) {
    console.log('ERROR: No targetUrl provided');
    return reply.status(400).send({ error: 'targetUrl query parameter is required.' });
  }

  console.log('Target URL requested:', targetUrl);

  let whitelist = [];
  try {
    // Fetch whitelist from DB. It should be a comma-separated string of hostnames.
    const whitelistSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('PROXY_WHITELIST');
    if (whitelistSetting && whitelistSetting.value) {
      whitelist = whitelistSetting.value.split(',').map(domain => domain.trim());
    }
    console.log('Current whitelist:', whitelist);
  } catch (dbError) {
    console.error('Error fetching proxy whitelist from settings:', dbError);
    whitelist = []; // Default to empty for security
  }

  // For immediate use, we'll ensure the calendar API is always allowed.
  // A more robust solution might involve seeding this in the database on startup.
  if (!whitelist.includes('calapi.inadiutorium.cz')) {
    whitelist.push('calapi.inadiutorium.cz');
    console.log('Added calapi.inadiutorium.cz to whitelist');
  }

  try {
    const target = new URL(targetUrl);
    const targetHostname = target.hostname;
    console.log('Target hostname:', targetHostname);

    if (!whitelist.includes(targetHostname)) {
      console.warn(`Proxy request blocked for non-whitelisted domain: ${targetHostname}`);
      return reply.status(403).send({ error: 'Access to this domain is not allowed through the proxy.' });
    }

    console.log(`Proxying request to whitelisted domain: ${targetUrl}`);
    
    // Configure axios for both HTTP and HTTPS
    const axiosConfig = {
      timeout: 15000, // 15 second timeout
      headers: {
        'User-Agent': 'HomeGlow-Proxy/1.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate'
      },
      maxRedirects: 5,
      validateStatus: function (status) {
        return status < 500; // Resolve only if the status code is less than 500
      }
    };

    // For HTTP requests, ensure we don't have HTTPS-specific configurations
    if (target.protocol === 'http:') {
      console.log('Making HTTP request (not HTTPS)');
      // No special HTTPS agent needed for HTTP
    } else {
      console.log('Making HTTPS request');
      // For HTTPS, we might need to handle self-signed certificates
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Only for development
    }

    console.log('Making axios request with config:', axiosConfig);
    const response = await axios.get(targetUrl, axiosConfig);
    console.log('Axios response received:', response.status, response.statusText);
    console.log('Response data type:', typeof response.data);
    console.log('Response data preview:', JSON.stringify(response.data).substring(0, 200) + '...');

    // Forward the content type and the data from the external API
    if (response.headers['content-type']) {
      reply.header('Content-Type', response.headers['content-type']);
    }
    
    // Add CORS headers
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    console.log('Sending successful response');
    return reply.status(response.status).send(response.data);

  } catch (error) {
    console.error('Error in proxy request:', error.message);
    console.error('Full error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
      config: error.config ? {
        url: error.config.url,
        method: error.config.method,
        timeout: error.config.timeout
      } : 'No config',
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : 'No response'
    });
    
    if (error.response) {
      // Forward the error from the target server
      console.log(`Target server responded with ${error.response.status}: ${error.response.statusText}`);
      return reply.status(error.response.status).send({
        error: `Target server error: ${error.response.status} ${error.response.statusText}`,
        details: error.response.data
      });
    } else if (error.code === 'ECONNREFUSED') {
      console.log(`Connection refused to ${error.address}:${error.port}`);
      return reply.status(503).send({ 
        error: 'Unable to connect to the target server. The server may be down or unreachable.',
        details: `Connection refused to ${error.address}:${error.port}`
      });
    } else if (error.code === 'ENOTFOUND') {
      return reply.status(404).send({ error: 'Target URL not found or unreachable.' });
    } else if (error.code === 'ETIMEDOUT') {
      return reply.status(408).send({ error: 'Request to target URL timed out.' });
    } else if (error.code === 'ECONNRESET') {
      return reply.status(503).send({ error: 'Connection was reset by the target server.' });
    }
    
    // Handle other errors (e.g., network, invalid URL)
    return reply.status(500).send({ 
      error: 'Failed to proxy request.',
      details: error.message 
    });
  }
});

// Prize routes
fastify.get('/api/prizes', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM prizes').all();
    return rows;
  } catch (error) {
    console.error('Error fetching prizes:', error);
    reply.status(500).send({ error: 'Failed to fetch prizes' });
  }
});

fastify.post('/api/prizes', async (request, reply) => {
  const { name, clam_cost } = request.body;
  if (!name || !clam_cost || clam_cost <= 0) {
    return reply.status(400).send({ error: 'Prize name and a positive clam cost are required.' });
  }
  try {
    const stmt = db.prepare('INSERT INTO prizes (name, clam_cost) VALUES (?, ?)');
    const info = stmt.run(name, clam_cost);
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding prize:', error);
    reply.status(500).send({ error: 'Failed to add prize' });
  }
});

fastify.patch('/api/prizes/:id', async (request, reply) => {
  const { id } = request.params;
  const { name, clam_cost } = request.body;
  if (!name || !clam_cost || clam_cost <= 0) {
    return reply.status(400).send({ error: 'Prize name and a positive clam cost are required.' });
  }
  try {
    const stmt = db.prepare('UPDATE prizes SET name = ?, clam_cost = ? WHERE id = ?');
    const info = stmt.run(name, clam_cost, id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Prize not found' });
    }
    return { success: true, message: 'Prize updated successfully' };
  } catch (error) {
    console.error('Error updating prize:', error);
    reply.status(500).send({ error: 'Failed to update prize' });
  }
});

fastify.delete('/api/prizes/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const stmt = db.prepare('DELETE FROM prizes WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Prize not found' });
    }
    return { success: true, message: 'Prize deleted successfully' };
  } catch (error) {
    console.error('Error deleting prize:', error);
    reply.status(500).send({ error: 'Failed to delete prize' });
  }
});

// Calendar sources routes
fastify.get('/api/calendar-sources', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT id, name, type, url, username, color, enabled, sort_order, created_at FROM calendar_sources ORDER BY sort_order, id').all();
    return rows;
  } catch (error) {
    console.error('Error fetching calendar sources:', error);
    reply.status(500).send({ error: 'Failed to fetch calendar sources' });
  }
});

fastify.post('/api/calendar-sources', async (request, reply) => {
  const { name, type, url, username, password, color } = request.body;
  if (!name || !type || !url) {
    return reply.status(400).send({ error: 'Name, type, and URL are required.' });
  }
  if (!['ICS', 'CalDAV'].includes(type)) {
    return reply.status(400).send({ error: 'Type must be either ICS or CalDAV.' });
  }
  try {
    const encryptedPassword = password ? encryptPassword(password) : null;
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM calendar_sources').get();
    const nextOrder = (maxOrder.max || 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO calendar_sources (name, type, url, username, password, color, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, type, url, username || null, encryptedPassword, color || '#6e44ff', 1, nextOrder);
    return { id: info.lastInsertRowid, success: true };
  } catch (error) {
    console.error('Error adding calendar source:', error);
    reply.status(500).send({ error: 'Failed to add calendar source' });
  }
});

fastify.patch('/api/calendar-sources/:id', async (request, reply) => {
  const { id } = request.params;
  const { name, type, url, username, password, color, enabled } = request.body;

  try {
    const existing = db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Calendar source not found' });
    }

    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
    if (type !== undefined) {
      if (!['ICS', 'CalDAV'].includes(type)) {
        return reply.status(400).send({ error: 'Type must be either ICS or CalDAV.' });
      }
      updateFields.push('type = ?');
      updateValues.push(type);
    }
    if (url !== undefined) { updateFields.push('url = ?'); updateValues.push(url); }
    if (username !== undefined) { updateFields.push('username = ?'); updateValues.push(username || null); }
    if (password !== undefined && password !== '') {
      const encryptedPassword = encryptPassword(password);
      updateFields.push('password = ?');
      updateValues.push(encryptedPassword);
    }
    if (color !== undefined) { updateFields.push('color = ?'); updateValues.push(color); }
    if (enabled !== undefined) { updateFields.push('enabled = ?'); updateValues.push(enabled ? 1 : 0); }

    if (updateFields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    updateValues.push(id);
    const stmt = db.prepare(`UPDATE calendar_sources SET ${updateFields.join(', ')} WHERE id = ?`);
    const info = stmt.run(...updateValues);

    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Calendar source not found' });
    }
    return { success: true, message: 'Calendar source updated successfully' };
  } catch (error) {
    console.error('Error updating calendar source:', error);
    reply.status(500).send({ error: 'Failed to update calendar source' });
  }
});

fastify.delete('/api/calendar-sources/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const stmt = db.prepare('DELETE FROM calendar_sources WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Calendar source not found' });
    }
    return { success: true, message: 'Calendar source deleted successfully' };
  } catch (error) {
    console.error('Error deleting calendar source:', error);
    reply.status(500).send({ error: 'Failed to delete calendar source' });
  }
});

fastify.post('/api/calendar-sources/:id/test', async (request, reply) => {
  const { id } = request.params;
  try {
    const source = db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(id);
    if (!source) {
      return reply.status(404).send({ error: 'Calendar source not found' });
    }

    if (source.type === 'ICS') {
      const response = await axios.get(source.url, { timeout: 10000 });
      const jcalData = ICAL.parse(response.data);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');
      return { success: true, eventCount: vevents.length, message: 'ICS calendar connection successful' };
    } else if (source.type === 'CalDAV') {
      const decryptedPassword = decryptPassword(source.password);
      const authHeader = 'Basic ' + Buffer.from(`${source.username}:${decryptedPassword}`).toString('base64');
      const response = await axios.get(source.url, {
        headers: { 'Authorization': authHeader },
        timeout: 10000
      });
      return { success: true, message: 'CalDAV connection successful' };
    }
  } catch (error) {
    console.error('Error testing calendar source:', error);
    return reply.status(400).send({
      success: false,
      error: 'Failed to connect to calendar source',
      details: error.message
    });
  }
});


// Enhanced endpoint to fetch and parse calendar events from multiple sources
fastify.get('/api/calendar-events', async (request, reply) => {
  try {
    const sources = db.prepare('SELECT * FROM calendar_sources WHERE enabled = 1 ORDER BY sort_order, id').all();

    function makeEvent({ item, source }) {
      return {
        id: item.uid ?? item.event?.uid ?? null,
        title: item.summary ?? item.event?.summary ?? null,
        start: item.start ?? item.event.start,
        end: item.end ?? item.event.end,
        description: item.description ?? item.event?.description ?? null,
        location: item.location ?? item.event?.location ?? null,
        source_id: source.id,
        source_name: source.name,
        source_color: source.color
      };
    }

    if (sources.length === 0) {
      return [];
    }

    const fetchPromises = sources.map(async (source) => {
      try {
        if (source.type === 'ICS') {
          const events = await node_ical.async.fromURL(source.url);
          let out = [];
          for (const event of Object.values(events)) {
            if (event.type === "VEVENT") {
              // doing ~13 months forward and backward
              const instances = node_ical.expandRecurringEvent(event, {
                from: new Date(Date.now() - 13 * 30 * 24 * 60 * 60 * 1000),
                to: new Date(Date.now() + 13 * 30 * 24 * 60 * 60 * 1000)
              });

              // If solo event, append and go to next event
              if (!instances) {
                out.push(makeEvent({ item: event, source }));
                continue;
              }
              instances.forEach(instance => {
                out.push(makeEvent({ item: instance, source }));
              });
            }
          };
          return out;

        } else if (source.type === 'CalDAV') {
          const decryptedPassword = decryptPassword(source.password);
          const authHeader = 'Basic ' + Buffer.from(`${source.username}:${decryptedPassword}`).toString('base64');

          const response = await axios.get(source.url, {
            headers: { 'Authorization': authHeader },
            timeout: 15000
          });

          const icsData = response.data;
          const jcalData = ICAL.parse(icsData);
          const comp = new ICAL.Component(jcalData);
          const vevents = comp.getAllSubcomponents('vevent');

          return vevents.map(vevent => {
            const event = new ICAL.Event(vevent);
            return {
              id: event.uid || Math.random().toString(),
              title: event.summary,
              start: event.startDate.toJSDate(),
              end: event.endDate.toJSDate(),
              description: event.description,
              location: event.location,
              source_id: source.id,
              source_name: source.name,
              source_color: source.color
            };
          });
        }
      } catch (error) {
        console.error(`Error fetching calendar from source ${source.name}:`, error.message);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const allEvents = results.flat();

    return allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    reply.status(500).send({ error: 'Failed to fetch calendar events.' });
  }
});


// Photo sources routes
fastify.get('/api/photo-sources', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT id, name, type, url, album_id, enabled, sort_order, created_at FROM photo_sources ORDER BY sort_order, id').all();
    return rows;
  } catch (error) {
    console.error('Error fetching photo sources:', error);
    reply.status(500).send({ error: 'Failed to fetch photo sources' });
  }
});

fastify.post('/api/photo-sources', async (request, reply) => {
  const { name, type, url, api_key, username, password, album_id, refresh_token } = request.body;
  if (!name || !type) {
    return reply.status(400).send({ error: 'Name and type are required.' });
  }
  if (!['Immich', 'GooglePhotos'].includes(type)) {
    return reply.status(400).send({ error: 'Type must be either Immich or GooglePhotos.' });
  }
  try {
    const encryptedApiKey = api_key ? encryptPassword(api_key) : null;
    const encryptedPassword = password ? encryptPassword(password) : null;
    const encryptedRefreshToken = refresh_token ? encryptPassword(refresh_token) : null;
    const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM photo_sources').get();
    const nextOrder = (maxOrder.max || 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO photo_sources (name, type, url, api_key, username, password, album_id, refresh_token, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, type, url || null, encryptedApiKey, username || null, encryptedPassword, album_id || null, encryptedRefreshToken, 1, nextOrder);
    return { id: info.lastInsertRowid, success: true };
  } catch (error) {
    console.error('Error adding photo source:', error);
    reply.status(500).send({ error: 'Failed to add photo source' });
  }
});

fastify.patch('/api/photo-sources/:id', async (request, reply) => {
  const { id } = request.params;
  const { name, type, url, api_key, username, password, album_id, refresh_token, enabled } = request.body;

  try {
    const existing = db.prepare('SELECT * FROM photo_sources WHERE id = ?').get(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Photo source not found' });
    }

    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) { updateFields.push('name = ?'); updateValues.push(name); }
    if (type !== undefined) {
      if (!['Immich', 'GooglePhotos'].includes(type)) {
        return reply.status(400).send({ error: 'Type must be either Immich or GooglePhotos.' });
      }
      updateFields.push('type = ?');
      updateValues.push(type);
    }
    if (url !== undefined) { updateFields.push('url = ?'); updateValues.push(url || null); }
    if (api_key !== undefined && api_key !== '') {
      const encryptedApiKey = encryptPassword(api_key);
      updateFields.push('api_key = ?');
      updateValues.push(encryptedApiKey);
    }
    if (username !== undefined) { updateFields.push('username = ?'); updateValues.push(username || null); }
    if (password !== undefined && password !== '') {
      const encryptedPassword = encryptPassword(password);
      updateFields.push('password = ?');
      updateValues.push(encryptedPassword);
    }
    if (album_id !== undefined) { updateFields.push('album_id = ?'); updateValues.push(album_id || null); }
    if (refresh_token !== undefined && refresh_token !== '') {
      const encryptedRefreshToken = encryptPassword(refresh_token);
      updateFields.push('refresh_token = ?');
      updateValues.push(encryptedRefreshToken);
    }
    if (enabled !== undefined) { updateFields.push('enabled = ?'); updateValues.push(enabled ? 1 : 0); }

    if (updateFields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    updateValues.push(id);
    const stmt = db.prepare(`UPDATE photo_sources SET ${updateFields.join(', ')} WHERE id = ?`);
    const info = stmt.run(...updateValues);

    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Photo source not found' });
    }
    return { success: true, message: 'Photo source updated successfully' };
  } catch (error) {
    console.error('Error updating photo source:', error);
    reply.status(500).send({ error: 'Failed to update photo source' });
  }
});

fastify.delete('/api/photo-sources/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const stmt = db.prepare('DELETE FROM photo_sources WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Photo source not found' });
    }
    return { success: true, message: 'Photo source deleted successfully' };
  } catch (error) {
    console.error('Error deleting photo source:', error);
    reply.status(500).send({ error: 'Failed to delete photo source' });
  }
});

fastify.post('/api/photo-sources/:id/test', async (request, reply) => {
  const { id } = request.params;
  try {
    const source = db.prepare('SELECT * FROM photo_sources WHERE id = ?').get(id);
    if (!source) {
      return reply.status(404).send({ error: 'Photo source not found' });
    }

    if (source.type === 'Immich') {
      const decryptedApiKey = decryptPassword(source.api_key);
      const response = await axios.post(`${source.url}/api/search/random`,
        { size: 1 },
        {
          headers: {
            'x-api-key': decryptedApiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );
      return { success: true, assetCount: response.data.length || 0, message: 'Immich connection successful' };
    } else if (source.type === 'GooglePhotos') {
      const decryptedRefreshToken = decryptPassword(source.refresh_token);
      return { success: true, message: 'Google Photos configuration saved (connection test not yet implemented)' };
    }
  } catch (error) {
    console.error('Error testing photo source:', error.message);
    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    }
    return reply.status(400).send({
      success: false,
      error: 'Failed to connect to photo source',
      details: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data
    });
  }
});

// Proxy endpoint to serve Immich images with authentication
fastify.get('/api/photo-proxy/:sourceId/:assetId', async (request, reply) => {
  const { sourceId, assetId } = request.params;
  const { size = 'preview' } = request.query;

  try {
    const source = db.prepare('SELECT * FROM photo_sources WHERE id = ?').get(sourceId);
    if (!source) {
      return reply.status(404).send({ error: 'Photo source not found' });
    }

    const decryptedApiKey = decryptPassword(source.api_key);
    const response = await axios.get(`${source.url}/api/assets/${assetId}/thumbnail`, {
      headers: {
        'x-api-key': decryptedApiKey
      },
      params: { size },
      responseType: 'arraybuffer',
      timeout: 15000
    });

    reply.header('Content-Type', response.headers['content-type'] || 'image/jpeg');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(Buffer.from(response.data));
  } catch (error) {
    console.error('Error proxying photo:', error.message);
    if (error.response) {
      console.error(`Immich response status: ${error.response.status}`);
      console.error(`Immich response data:`, error.response.data);
    }
    return reply.status(500).send({ error: 'Failed to load photo' });
  }
});

// Enhanced endpoint to fetch photos from multiple sources
fastify.get('/api/photo-items', async (request, reply) => {
  try {
    const sources = db.prepare('SELECT * FROM photo_sources WHERE enabled = 1 ORDER BY sort_order, id').all();

    if (sources.length === 0) {
      return [];
    }

    const fetchPromises = sources.map(async (source) => {
      try {
        if (source.type === 'Immich') {
          const decryptedApiKey = decryptPassword(source.api_key);

          // Use the search/random endpoint to get random assets
          const response = await axios.post(`${source.url}/api/search/random`,
            { size: 100 },
            {
              headers: {
                'x-api-key': decryptedApiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              timeout: 15000
            }
          );

          const assets = response.data || [];

          return assets.map(asset => ({
            id: asset.id,
            url: `/api/photo-proxy/${source.id}/${asset.id}?size=preview`,
            thumbnail: `/api/photo-proxy/${source.id}/${asset.id}?size=thumbnail`,
            type: asset.type,
            source_id: source.id,
            source_name: source.name,
            source_type: 'Immich'
          }));
        } else if (source.type === 'GooglePhotos') {
          return [];
        }
      } catch (error) {
        console.error(`Error fetching photos from source ${source.name}:`, error.message);
        if (error.response) {
          console.error(`Response status: ${error.response.status}`);
          console.error(`Response data:`, error.response.data);
        }
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const allPhotos = results.flat();

    // Shuffle photos
    for (let i = allPhotos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPhotos[i], allPhotos[j]] = [allPhotos[j], allPhotos[i]];
    }

    return allPhotos;
  } catch (error) {
    console.error('Error fetching photos:', error);
    reply.status(500).send({ error: 'Failed to fetch photos.' });
  }
});

// Admin PIN routes
fastify.get('/api/admin-pin/exists', async (request, reply) => {
  try {
    const pin = db.prepare('SELECT id FROM admin_pin WHERE id = 1').get();
    return { exists: !!pin };
  } catch (error) {
    console.error('Error checking PIN existence:', error);
    reply.status(500).send({ error: 'Failed to check PIN existence' });
  }
});

fastify.post('/api/admin-pin/set', async (request, reply) => {
  const { pin } = request.body;

  if (!pin || typeof pin !== 'string') {
    return reply.status(400).send({ error: 'PIN is required and must be a string' });
  }

  if (pin.length < 4 || pin.length > 8) {
    return reply.status(400).send({ error: 'PIN must be between 4 and 8 characters' });
  }

  if (!/^\d+$/.test(pin)) {
    return reply.status(400).send({ error: 'PIN must contain only numbers' });
  }

  try {
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    const existingPin = db.prepare('SELECT id FROM admin_pin WHERE id = 1').get();

    if (existingPin) {
      const stmt = db.prepare('UPDATE admin_pin SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
      stmt.run(pinHash);
    } else {
      const stmt = db.prepare('INSERT INTO admin_pin (id, pin_hash) VALUES (1, ?)');
      stmt.run(pinHash);
    }

    return { success: true, message: 'PIN set successfully' };
  } catch (error) {
    console.error('Error setting PIN:', error);
    reply.status(500).send({ error: 'Failed to set PIN' });
  }
});

fastify.post('/api/admin-pin/verify', async (request, reply) => {
  const { pin } = request.body;

  if (!pin || typeof pin !== 'string') {
    return reply.status(400).send({ error: 'PIN is required' });
  }

  try {
    const storedPin = db.prepare('SELECT pin_hash FROM admin_pin WHERE id = 1').get();

    if (!storedPin) {
      return reply.status(404).send({ error: 'No PIN configured' });
    }

    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    const isValid = pinHash === storedPin.pin_hash;

    return { valid: isValid };
  } catch (error) {
    console.error('Error verifying PIN:', error);
    reply.status(500).send({ error: 'Failed to verify PIN' });
  }
});

// Start server
const start = async () => {
  try {
    db = await initializeDatabase(); // Initialize db once here
    await pruneAndResetChores(); // Call the pruning/reset function on startup
    await fastify.listen({ port: process.env.PORT || 5000, host: '0.0.0.0' });
    console.log(`Server running on port ${process.env.PORT || 5000}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();
