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
const parser = require('cron-parser');
const cron = require('node-cron');
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
        profile_picture TEXT
      );
      INSERT OR IGNORE INTO users (id, username, email, profile_picture) VALUES (0, 'bonus', 'bonus@example.com', '');\
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

// Helper function to convert old repeat_type to crontab expression
function convertRepeatTypeToCrontab(repeat_type, assigned_day_of_week) {
  const dayMap = {
    'sunday': '0',
    'monday': '1',
    'tuesday': '2',
    'wednesday': '3',
    'thursday': '4',
    'friday': '5',
    'saturday': '6'
  };

  switch (repeat_type) {
    case 'daily':
      return '0 0 * * *';
    case 'weekly':
      const dayNum = dayMap[assigned_day_of_week.toLowerCase()] || '1';
      return `0 0 * * ${dayNum}`;
    case 'until-completed':
      return '0 0 * * *';
    case 'no-repeat':
      return null;
    default:
      return '0 0 * * *';
  }
}

// Database migration function
async function migrateChoresDatabase() {
  try {
    console.log('=== Checking for database migration ===');

    const migrationVersionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('chores_migration_version');
    const currentVersion = migrationVersionRow ? parseInt(migrationVersionRow.value) : 0;

    if (currentVersion >= 1) {
      console.log('Migration already completed (version:', currentVersion, ')');
      return;
    }

    console.log('=== Starting chores database migration ===');

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('migration_in_progress', '1');

    console.log('Step 1: Creating new tables...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS chore_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chore_id INTEGER NOT NULL,
        user_id INTEGER NULL,
        crontab TEXT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chore_schedules_chore_id ON chore_schedules(chore_id);
      CREATE INDEX IF NOT EXISTS idx_chore_schedules_user_id ON chore_schedules(user_id);
      CREATE INDEX IF NOT EXISTS idx_chore_schedules_visible ON chore_schedules(visible);

      CREATE TABLE IF NOT EXISTS chore_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        chore_schedule_id INTEGER NULL,
        date TEXT NOT NULL,
        clam_value INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chore_schedule_id) REFERENCES chore_schedules(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chore_history_user_id ON chore_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_chore_history_date ON chore_history(date);
      CREATE INDEX IF NOT EXISTS idx_chore_history_user_date ON chore_history(user_id, date);
    `);
    console.log('New tables created successfully');

    console.log('Step 2: Backing up existing chores...');
    const existingChores = db.prepare('SELECT * FROM chores').all();
    console.log(`Found ${existingChores.length} existing chores to migrate`);

    console.log('Step 3: Creating backup table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS chores_backup AS SELECT * FROM chores;
    `);

    console.log('Step 4: Creating new chores table structure...');
    db.exec(`
      CREATE TABLE chores_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        clam_value INTEGER DEFAULT 0
      );
    `);

    console.log('Step 5: Migrating chore data...');
    const today = new Date().toISOString().split('T')[0];
    const processedChores = new Map();

    for (const oldChore of existingChores) {
      let choreId;

      const key = `${oldChore.title}-${oldChore.description || ''}-${oldChore.clam_value}`;

      if (processedChores.has(key)) {
        choreId = processedChores.get(key);
      } else {
        const insertResult = db.prepare(`
          INSERT INTO chores_new (title, description, clam_value)
          VALUES (?, ?, ?)
        `).run(oldChore.title, oldChore.description, oldChore.clam_value || 0);

        choreId = insertResult.lastInsertRowid;
        processedChores.set(key, choreId);
      }

      const crontab = convertRepeatTypeToCrontab(
        oldChore.repeat_type || 'weekly',
        oldChore.assigned_day_of_week || 'monday'
      );

      const visible = (oldChore.repeat_type === 'no-repeat' && oldChore.completed) ? 0 : 1;

      const scheduleResult = db.prepare(`
        INSERT INTO chore_schedules (chore_id, user_id, crontab, visible)
        VALUES (?, ?, ?, ?)
      `).run(choreId, oldChore.user_id, crontab, visible);

      if (oldChore.completed && oldChore.completed === 1) {
        db.prepare(`
          INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value)
          VALUES (?, ?, ?, ?)
        `).run(oldChore.user_id, scheduleResult.lastInsertRowid, today, oldChore.clam_value || 0);
      }
    }

    console.log('Step 6: Replacing old chores table...');
    db.exec(`
      DROP TABLE chores;
      ALTER TABLE chores_new RENAME TO chores;
    `);

    console.log('Step 7: Updating migration version...');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('chores_migration_version', '1');
    db.prepare('DELETE FROM settings WHERE key = ?').run('migration_in_progress');

    console.log('=== Migration completed successfully ===');
    console.log(`Migrated ${existingChores.length} chores, created ${processedChores.size} unique chore definitions`);

  } catch (error) {
    console.error('=== Migration failed ===');
    console.error('Error:', error);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('migration_error', error.message);
    throw error;
  }
}

async function migrateClamsToHistory() {
  try {
    console.log('=== Checking for clam_total migration ===');

    const migrationVersionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('clam_migration_version');
    const currentVersion = migrationVersionRow ? parseInt(migrationVersionRow.value) : 0;

    if (currentVersion >= 1) {
      console.log('Clam migration already completed (version:', currentVersion, ')');
      return;
    }

    const columns = db.prepare("PRAGMA table_info(users)").all();
    const hasClaimTotal = columns.some(col => col.name === 'clam_total');

    if (!hasClaimTotal) {
      console.log('clam_total column does not exist, skipping migration');
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('clam_migration_version', '1');
      return;
    }

    console.log('=== Starting clam_total to chore_history migration ===');

    const today = new Date().toISOString().split('T')[0];

    const usersWithClams = db.prepare('SELECT id, username, clam_total FROM users WHERE clam_total > 0 AND id != 0').all();
    console.log(`Found ${usersWithClams.length} users with clam_total > 0`);

    for (const user of usersWithClams) {
      db.prepare(`
        INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value)
        VALUES (?, NULL, ?, ?)
      `).run(user.id, today, user.clam_total);
      console.log(`Migrated ${user.clam_total} clams for user "${user.username}" (ID: ${user.id})`);
    }

    console.log('Removing clam_total column from users table...');
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        email TEXT,
        profile_picture TEXT
      );
      INSERT INTO users_new (id, username, email, profile_picture)
      SELECT id, username, email, profile_picture FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('clam_migration_version', '1');

    console.log('=== Clam migration completed successfully ===');
    console.log(`Migrated clams for ${usersWithClams.length} users`);

  } catch (error) {
    console.error('=== Clam migration failed ===');
    console.error('Error:', error);
    throw error;
  }
}

async function migrateToDurationField() {
  try {
    console.log('=== Checking for duration field migration ===');

    const migrationVersionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('duration_migration_version');
    const currentVersion = migrationVersionRow ? parseInt(migrationVersionRow.value) : 0;

    if (currentVersion >= 1) {
      console.log('Duration migration already completed (version:', currentVersion, ')');
      return;
    }

    console.log('=== Starting duration field migration ===');

    const columns = db.prepare("PRAGMA table_info(chore_schedules)").all();
    const hasDuration = columns.some(col => col.name === 'duration');

    if (!hasDuration) {
      console.log('Adding duration column to chore_schedules table...');
      db.exec('ALTER TABLE chore_schedules ADD COLUMN duration TEXT DEFAULT "day-of"');
      console.log('Duration column added successfully');
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('duration_migration_version', '1');

    console.log('=== Duration migration completed successfully ===');

  } catch (error) {
    console.error('=== Duration migration failed ===');
    console.error('Error:', error);
    throw error;
  }
}

// Initialize default settings
function initializeDefaultSettings() {
  try {
    const existingSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('daily_completion_clam_reward');
    if (!existingSetting) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('daily_completion_clam_reward', '2');
      console.log('Initialized default daily completion clam reward setting to 2');
    }
  } catch (error) {
    console.error('Error initializing default settings:', error);
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

async function dailyBackgroundProcessing() {
  try {
    console.log('=== Starting daily background processing ===');
    let results = {};
    const today = new Date().toISOString().split('T')[0];

    // We want to delete schedules that are completed and will never run again to avoid clutter
    // BUT: exclude "until-completed" schedules - they should be handled separately
    const schedulesToPrune = db.prepare(`
      SELECT cs.id, cs.chore_id, cs.user_id, cs.duration, c.title
      FROM chore_schedules cs
      JOIN chores c ON cs.chore_id = c.id
      WHERE cs.crontab IS NULL
        AND cs.visible = 1
        AND cs.duration != 'until-completed'
        AND EXISTS (
          SELECT 1 FROM chore_history ch
          WHERE ch.chore_schedule_id = cs.id
        )
    `).all();
    console.log(`Found ${schedulesToPrune.length} completed day-of chores to prune`);

    let prunedScheduleCount = 0;
    for (const schedule of schedulesToPrune) {
      db.prepare('DELETE FROM chore_schedules WHERE id = ?').run(schedule.id);
      console.log(`Pruned schedule ID ${schedule.id}: "${schedule.title}" (user_id: ${schedule.user_id})`);
      prunedScheduleCount++;
    }
    results = {
      ...results,
      prunedSchedules: prunedScheduleCount,
      schedules: schedulesToPrune,
    }

    // Handle until-completed schedules: create new instances for uncompleted chores
    const untilCompletedSchedules = db.prepare(`
      SELECT cs.id, cs.chore_id, cs.user_id, c.title, c.description, c.clam_value
      FROM chore_schedules cs
      JOIN chores c ON cs.chore_id = c.id
      WHERE cs.crontab IS NULL
        AND cs.duration = 'until-completed'
        AND cs.visible = 1
        AND NOT EXISTS (
          SELECT 1 FROM chore_history ch
          WHERE ch.chore_schedule_id = cs.id
          AND ch.date = ?
        )
    `).all(today);
    console.log(`Found ${untilCompletedSchedules.length} until-completed schedules to check`);

    let untilCompletedCreated = 0;
    for (const schedule of untilCompletedSchedules) {
      // Check if a schedule already exists for today for this chore/user combination
      const existingToday = db.prepare(`
        SELECT cs.id FROM chore_schedules cs
        WHERE cs.chore_id = ?
        AND cs.user_id IS ?
        AND cs.crontab IS NULL
        AND cs.duration = 'until-completed'
        AND cs.id != ?
      `).get(schedule.chore_id, schedule.user_id, schedule.id);

      if (!existingToday) {
        // This schedule still needs to appear today since it wasn't completed
        console.log(`Until-completed schedule ID ${schedule.id}: "${schedule.title}" remains active (not completed today)`);
      }
    }

    // Delete until-completed schedules that WERE completed today
    const completedUntilCompletedSchedules = db.prepare(`
      SELECT cs.id, cs.chore_id, cs.user_id, c.title
      FROM chore_schedules cs
      JOIN chores c ON cs.chore_id = c.id
      WHERE cs.crontab IS NULL
        AND cs.duration = 'until-completed'
        AND cs.visible = 1
        AND EXISTS (
          SELECT 1 FROM chore_history ch
          WHERE ch.chore_schedule_id = cs.id
          AND ch.date = ?
        )
    `).all(today);
    console.log(`Found ${completedUntilCompletedSchedules.length} completed until-completed chores to delete`);

    let untilCompletedDeleted = 0;
    for (const schedule of completedUntilCompletedSchedules) {
      db.prepare('DELETE FROM chore_schedules WHERE id = ?').run(schedule.id);
      console.log(`Deleted completed until-completed schedule ID ${schedule.id}: "${schedule.title}"`);
      untilCompletedDeleted++;
    }

    results = {
      ...results,
      untilCompletedCreated,
      untilCompletedDeleted
    }


    // We should also delete chores that have no schedules to avoid clutter
    const choresToPrune = db.prepare(`
      SELECT c.id, c.title
      FROM chores c
      WHERE NOT EXISTS (
          SELECT 1
          FROM chore_schedules cs
          WHERE cs.chore_id = c.id
      );
    `).all();
    console.log(`Found ${choresToPrune.length} orphaned chores to prune`);

    let prunedChoreCount = 0;
    for (const chore of choresToPrune) {
      db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
      console.log(`Pruned chore ID ${chore.id}: "${chore.title}"`);
      prunedChoreCount++;
    }
    results = {
      ...results,
      prunedChores: prunedChoreCount,
      chores: choresToPrune,
    }

    // bonus chores that persist from day to day should reset to unassigned
    const choresToReset = db.prepare(`
      SELECT cs.id,
        cs.user_id,
        c.title
      FROM chore_schedules cs
      JOIN chores c ON cs.chore_id = c.id
      WHERE cs.crontab IS NULL
        AND cs.visible = 1
        AND cs.user_id IS NOT NULL
        AND c.clam_value > 0;
    `).all();
    console.log(`Found ${choresToReset.length} bonus chores to reset`);
    let resetScheduleCount = 0;
    for (const schedule of choresToReset) {
      db.prepare('UPDATE chore_schedules set user_id = NULL WHERE id = ?').run(schedule.id);
      console.log(`Reset schedule ID ${schedule.id}: "${schedule.title}" (user_id: ${schedule.user_id})`);
      resetScheduleCount++;
    }
    results = {
      ...results,
      resetSchedules: resetScheduleCount,
      rSchedules: choresToReset,
    }

    console.log(`=== Daily background processing completed ===`);
    console.log(`  - Day-of schedules pruned: ${prunedScheduleCount}`);
    console.log(`  - Orphaned chores deleted: ${prunedChoreCount}`);
    console.log(`  - Until-completed chores deleted (completed): ${untilCompletedDeleted}`);
    console.log(`  - Bonus chores reset: ${resetScheduleCount}`);
    console.log(`Total: ${prunedScheduleCount + prunedChoreCount + untilCompletedDeleted + resetScheduleCount} operations performed`);
    return results;
  } catch (error) {
    console.error('Error during daily background processing:', error);
    throw error;
  }
}

function startNightlyCronJob() {
  cron.schedule('0 0 * * *', async () => {
    console.log('Running daily background processing at midnight');
    await dailyBackgroundProcessing();
  }, {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  console.log('Daily background processing cron job scheduled for midnight');
}


// Chore routes (updated for new schema)
fastify.get('/api/chores', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM chores').all();
    return rows;
  } catch (error) {
    console.error('Error fetching chores:', error);
    reply.status(500).send({ error: 'Failed to fetch chores' });
  }
});

fastify.post('/api/chores', async (request, reply) => {
  const { title, description, clam_value } = request.body;
  try {
    const stmt = db.prepare('INSERT INTO chores (title, description, clam_value) VALUES (?, ?, ?)');
    const info = stmt.run(title, description, clam_value || 0);
    return { id: info.lastInsertRowid, success: true };
  } catch (error) {
    console.error('Error adding chore:', error);
    reply.status(500).send({ error: 'Failed to add chore' });
  }
});

fastify.patch('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  const { title, description, clam_value } = request.body;
  try {
    const stmt = db.prepare('UPDATE chores SET title = ?, description = ?, clam_value = ? WHERE id = ?');
    const info = stmt.run(title, description, clam_value, id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Chore not found' });
    }
    return { success: true };
  } catch (error) {
    console.error('Error updating chore:', error);
    reply.status(500).send({ error: 'Failed to update chore' });
  }
});

fastify.delete('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    db.prepare('DELETE FROM chore_schedules WHERE chore_id = ?').run(id);
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

// Chore Schedules routes
fastify.get('/api/chore-schedules', async (request, reply) => {
  try {
    const { user_id, visible, chore_id } = request.query;
    let query = 'SELECT cs.*, c.title, c.description, c.clam_value FROM chore_schedules cs JOIN chores c ON cs.chore_id = c.id';
    const conditions = [];
    const params = [];

    if (user_id !== undefined) {
      conditions.push('cs.user_id = ?');
      params.push(user_id);
    }
    if (visible !== undefined) {
      conditions.push('cs.visible = ?');
      params.push(visible === 'true' || visible === '1' ? 1 : 0);
    }
    if (chore_id !== undefined) {
      conditions.push('cs.chore_id = ?');
      params.push(chore_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const rows = db.prepare(query).all(...params);
    return rows;
  } catch (error) {
    console.error('Error fetching chore schedules:', error);
    reply.status(500).send({ error: 'Failed to fetch chore schedules' });
  }
});

fastify.get('/api/chore-schedules/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const row = db.prepare('SELECT cs.*, c.title, c.description, c.clam_value FROM chore_schedules cs JOIN chores c ON cs.chore_id = c.id WHERE cs.id = ?').get(id);
    if (!row) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }
    return row;
  } catch (error) {
    console.error('Error fetching schedule:', error);
    reply.status(500).send({ error: 'Failed to fetch schedule' });
  }
});

fastify.post('/api/chore-schedules', async (request, reply) => {
  const { chore_id, user_id, crontab, duration, visible } = request.body;
  try {
    if (!chore_id) {
      return reply.status(400).send({ error: 'chore_id is required' });
    }

    if (crontab) {
      try {
        parser.parseExpression(crontab);
      } catch (e) {
        return reply.status(400).send({ error: 'Invalid crontab expression: ' + e.message });
      }
    }

    const stmt = db.prepare('INSERT INTO chore_schedules (chore_id, user_id, crontab, duration, visible) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(chore_id, user_id || null, crontab || null, duration || 'day-of', visible !== undefined ? visible : 1);
    return { id: info.lastInsertRowid, success: true };
  } catch (error) {
    console.error('Error adding schedule:', error);
    reply.status(500).send({ error: 'Failed to add schedule' });
  }
});

fastify.post('/api/chore-schedules/bulk', async (request, reply) => {
  const { chore_id, user_ids, crontab, visible } = request.body;
  try {
    if (!chore_id || !user_ids || !Array.isArray(user_ids)) {
      return reply.status(400).send({ error: 'chore_id and user_ids array are required' });
    }

    if (crontab) {
      try {
        parser.parseExpression(crontab);
      } catch (e) {
        return reply.status(400).send({ error: 'Invalid crontab expression: ' + e.message });
      }
    }

    const stmt = db.prepare('INSERT INTO chore_schedules (chore_id, user_id, crontab, visible) VALUES (?, ?, ?, ?)');
    const ids = [];

    for (const user_id of user_ids) {
      const info = stmt.run(chore_id, user_id, crontab || null, visible !== undefined ? visible : 1);
      ids.push(info.lastInsertRowid);
    }

    return { ids, success: true, count: ids.length };
  } catch (error) {
    console.error('Error bulk adding schedules:', error);
    reply.status(500).send({ error: 'Failed to bulk add schedules' });
  }
});

fastify.patch('/api/chore-schedules/:id', async (request, reply) => {
  const { id } = request.params;
  const { chore_id, user_id, crontab, duration, visible } = request.body;
  try {
    if (crontab !== undefined && crontab !== null) {
      try {
        parser.parseExpression(crontab);
      } catch (e) {
        return reply.status(400).send({ error: 'Invalid crontab expression: ' + e.message });
      }
    }

    const updates = [];
    const params = [];

    if (chore_id !== undefined) { updates.push('chore_id = ?'); params.push(chore_id); }
    if (user_id !== undefined) { updates.push('user_id = ?'); params.push(user_id || null); }
    if (crontab !== undefined) { updates.push('crontab = ?'); params.push(crontab || null); }
    if (duration !== undefined) { updates.push('duration = ?'); params.push(duration); }
    if (visible !== undefined) { updates.push('visible = ?'); params.push(visible ? 1 : 0); }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    params.push(id);
    const stmt = db.prepare(`UPDATE chore_schedules SET ${updates.join(', ')} WHERE id = ?`);
    const info = stmt.run(...params);

    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }
    return { success: true };
  } catch (error) {
    console.error('Error updating schedule:', error);
    reply.status(500).send({ error: 'Failed to update schedule' });
  }
});

fastify.delete('/api/chore-schedules/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const stmt = db.prepare('DELETE FROM chore_schedules WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }
    return { success: true, message: 'Schedule deleted successfully' };
  } catch (error) {
    console.error('Error deleting schedule:', error);
    reply.status(500).send({ error: 'Failed to delete schedule' });
  }
});

fastify.post('/api/chore-schedules/prune', async (request, reply) => {
  try {
    const result = await dailyBackgroundProcessing();
    return {
      success: true,
      message: `Daily background processing completed: ${result.prunedSchedules} day-of schedules pruned, ${result.prunedChores} orphaned chores deleted, ${result.untilCompletedDeleted || 0} until-completed chores deleted, ${result.resetSchedules} bonus chores reset`,
      ...result
    };
  } catch (error) {
    console.error('Error running daily background processing:', error);
    reply.status(500).send({ error: 'Failed to run daily background processing' });
  }
});

// Chore History routes
fastify.get('/api/chore-history', async (request, reply) => {
  try {
    const { user_id, date, date_from, date_to } = request.query;
    let query = 'SELECT * FROM chore_history';
    const conditions = [];
    const params = [];

    if (user_id !== undefined) {
      conditions.push('user_id = ?');
      params.push(user_id);
    }
    if (date) {
      conditions.push('date = ?');
      params.push(date);
    }
    if (date_from) {
      conditions.push('date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      conditions.push('date <= ?');
      params.push(date_to);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const rows = db.prepare(query).all(...params);
    return rows;
  } catch (error) {
    console.error('Error fetching chore history:', error);
    reply.status(500).send({ error: 'Failed to fetch chore history' });
  }
});

fastify.get('/api/chore-history/user/:userId', async (request, reply) => {
  const { userId } = request.params;
  try {
    const rows = db.prepare('SELECT * FROM chore_history WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(userId);
    return rows;
  } catch (error) {
    console.error('Error fetching user history:', error);
    reply.status(500).send({ error: 'Failed to fetch user history' });
  }
});

fastify.get('/api/chore-history/summary/:userId', async (request, reply) => {
  const { userId } = request.params;
  try {
    const result = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(userId);
    return { user_id: parseInt(userId), clam_total: result.total };
  } catch (error) {
    console.error('Error getting clam summary:', error);
    reply.status(500).send({ error: 'Failed to get clam summary' });
  }
});

fastify.post('/api/chore-history', async (request, reply) => {
  const { user_id, chore_schedule_id, date, clam_value } = request.body;
  try {
    if (!user_id || !date) {
      return reply.status(400).send({ error: 'user_id and date are required' });
    }

    const stmt = db.prepare('INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value) VALUES (?, ?, ?, ?)');
    const info = stmt.run(user_id, chore_schedule_id || null, date, clam_value || 0);
    return { id: info.lastInsertRowid, success: true };
  } catch (error) {
    console.error('Error adding history entry:', error);
    reply.status(500).send({ error: 'Failed to add history entry' });
  }
});

fastify.delete('/api/chore-history/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const stmt = db.prepare('DELETE FROM chore_history WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'History entry not found' });
    }
    return { success: true, message: 'History entry deleted successfully' };
  } catch (error) {
    console.error('Error deleting history entry:', error);
    reply.status(500).send({ error: 'Failed to delete history entry' });
  }
});

// Chore completion endpoints
fastify.post('/api/chores/complete', async (request, reply) => {
  const { chore_schedule_id, user_id, date } = request.body;
  try {
    if (!chore_schedule_id || !user_id || !date) {
      return reply.status(400).send({ error: 'chore_schedule_id, user_id, and date are required' });
    }

    const schedule = db.prepare('SELECT cs.*, c.clam_value FROM chore_schedules cs JOIN chores c ON cs.chore_id = c.id WHERE cs.id = ?').get(chore_schedule_id);
    if (!schedule) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }

    if (!schedule.visible) {
      return reply.status(400).send({ error: 'Schedule is not visible' });
    }

    const existing = db.prepare('SELECT id FROM chore_history WHERE chore_schedule_id = ? AND user_id = ? AND date = ?').get(chore_schedule_id, user_id, date);
    if (existing) {
      return reply.status(409).send({ error: 'Chore already completed for this date' });
    }

    db.prepare('INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value) VALUES (?, ?, ?, ?)').run(user_id, chore_schedule_id, date, schedule.clam_value);

    const allUserSchedules = db.prepare(`
      SELECT cs.*, c.clam_value
      FROM chore_schedules cs
      JOIN chores c ON cs.chore_id = c.id
      WHERE cs.user_id = ? AND cs.visible = 1
    `).all(user_id);

    const regularChores = allUserSchedules.filter(s => s.clam_value === 0);

    if (regularChores.length > 0) {
      const completedRegularChores = db.prepare(`
        SELECT COUNT(*) as count
        FROM chore_history ch
        JOIN chore_schedules cs ON ch.chore_schedule_id = cs.id
        JOIN chores c ON cs.chore_id = c.id
        WHERE ch.user_id = ? AND ch.date = ? AND c.clam_value = 0
      `).get(user_id, date);

      const allRegularChoresCompleted = completedRegularChores.count === regularChores.length;

      if (allRegularChoresCompleted) {
        const dailyRewardSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('daily_completion_clam_reward');
        const dailyReward = dailyRewardSetting ? parseInt(dailyRewardSetting.value, 10) : 2;

        const bonusAlreadyAwarded = db.prepare(`
          SELECT id FROM chore_history
          WHERE user_id = ? AND date = ? AND chore_schedule_id IS NULL AND clam_value = ?
        `).get(user_id, date, dailyReward);

        if (!bonusAlreadyAwarded) {
          db.prepare('INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value) VALUES (?, NULL, ?, ?)').run(user_id, date, dailyReward);
        }
      }
    }

    const totalResult = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(user_id);

    return { success: true, clam_total: totalResult.total };
  } catch (error) {
    console.error('Error completing chore:', error);
    reply.status(500).send({ error: 'Failed to complete chore' });
  }
});

fastify.post('/api/chores/uncomplete', async (request, reply) => {
  const { chore_schedule_id, user_id, date } = request.body;
  try {
    if (!chore_schedule_id || !user_id || !date) {
      return reply.status(400).send({ error: 'chore_schedule_id, user_id, and date are required' });
    }

    const history = db.prepare('SELECT * FROM chore_history WHERE chore_schedule_id = ? AND user_id = ? AND date = ?').get(chore_schedule_id, user_id, date);
    if (!history) {
      return reply.status(404).send({ error: 'Completion record not found' });
    }

    db.prepare('DELETE FROM chore_history WHERE id = ?').run(history.id);

    const dailyRewardSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('daily_completion_clam_reward');
    const dailyReward = dailyRewardSetting ? parseInt(dailyRewardSetting.value, 10) : 2;

    const bonusEntry = db.prepare(`
      SELECT id FROM chore_history
      WHERE user_id = ? AND date = ? AND chore_schedule_id IS NULL AND clam_value = ?
    `).get(user_id, date, dailyReward);

    if (bonusEntry) {
      db.prepare('DELETE FROM chore_history WHERE id = ?').run(bonusEntry.id);
    }

    const totalResult = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(user_id);

    return { success: true, clam_total: totalResult.total };
  } catch (error) {
    console.error('Error uncompleting chore:', error);
    reply.status(500).send({ error: 'Failed to uncomplete chore' });
  }
});

// User clam management endpoints
fastify.get('/api/users/:id/clams', async (request, reply) => {
  const { id } = request.params;
  try {
    const result = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(id);
    return { user_id: parseInt(id), clam_total: result.total };
  } catch (error) {
    console.error('Error getting user clams:', error);
    reply.status(500).send({ error: 'Failed to get user clams' });
  }
});

fastify.post('/api/users/:id/clams/add', async (request, reply) => {
  const { id } = request.params;
  const { amount, date } = request.body;
  try {
    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: 'Valid positive amount is required' });
    }

    const useDate = date || new Date().toISOString().split('T')[0];
    db.prepare('INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value) VALUES (?, NULL, ?, ?)').run(id, useDate, amount);

    const result = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(id);
    return { success: true, clam_total: result.total };
  } catch (error) {
    console.error('Error adding clams:', error);
    reply.status(500).send({ error: 'Failed to add clams' });
  }
});

fastify.post('/api/users/:id/clams/reduce', async (request, reply) => {
  const { id } = request.params;
  const { amount } = request.body;
  try {
    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: 'Valid positive amount is required' });
    }

    const currentResult = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(id);
    if (currentResult.total < amount) {
      return reply.status(400).send({ error: 'Insufficient clams' });
    }

    let remaining = amount;
    const entries = db.prepare('SELECT * FROM chore_history WHERE user_id = ? AND clam_value > 0 ORDER BY created_at ASC').all(id);

    for (const entry of entries) {
      if (remaining <= 0) break;

      if (entry.clam_value <= remaining) {
        db.prepare('DELETE FROM chore_history WHERE id = ?').run(entry.id);
        remaining -= entry.clam_value;
      } else {
        db.prepare('UPDATE chore_history SET clam_value = ? WHERE id = ?').run(entry.clam_value - remaining, entry.id);
        remaining = 0;
      }
    }

    const result = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(id);
    return { success: true, clam_total: result.total };
  } catch (error) {
    console.error('Error reducing clams:', error);
    reply.status(500).send({ error: 'Failed to reduce clams' });
  }
});


// User routes (updated to calculate clam_total from history)
fastify.get('/api/users', async (request, reply) => {
  try {
    const users = db.prepare('SELECT id, username, email, profile_picture FROM users').all();

    const usersWithClams = users.map(user => {
      const clamResult = db.prepare('SELECT COALESCE(SUM(clam_value), 0) as total FROM chore_history WHERE user_id = ?').get(user.id);
      return {
        ...user,
        clam_total: clamResult.total
      };
    });

    return usersWithClams;
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

// Endpoint to delete a user
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

fastify.delete('/api/admin-pin', async (request, reply) => {
  try {
    db.prepare('DELETE FROM admin_pin WHERE id = 1').run();
    return { success: true, message: 'PIN cleared successfully' };
  } catch (error) {
    console.error('Error clearing PIN:', error);
    reply.status(500).send({ error: 'Failed to clear PIN' });
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
    await migrateChoresDatabase(); // Run migration if needed
    await migrateClamsToHistory(); // Migrate clam_total to chore_history
    await migrateToDurationField(); // Add duration field to chore_schedules
    initializeDefaultSettings(); // Initialize default settings
    startNightlyCronJob(); // Start the nightly chore pruning job
    await fastify.listen({ port: process.env.PORT || 5000, host: '0.0.0.0' });
    console.log(`Server running on port ${process.env.PORT || 5000}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();
