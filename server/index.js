// File: server/index.js
const fastify = require('fastify')({ logger: true });
const Database = require('better-sqlite3');
const ical = require('ical-generator');
const path = require('path');
const fs = require('fs').promises;
const multipart = require('@fastify/multipart');
require('dotenv').config();

// NEW: Import axios for HTTP requests and ical.js for parsing
const axios = require('axios');
const ICAL = require('ical.js');
// For widget upload and registry
const widgetRegistryPath = path.join(__dirname, 'widgets_registry.json');


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
        repeats TEXT,\
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
    `);
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
    const allChores = db.prepare('SELECT id, user_id, assigned_day_of_week, repeats, completed, clam_value, expiration_date FROM chores').all();

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
        if (chore.completed && chore.assigned_day_of_week !== currentDay) {
          if (chore.repeats === "Doesn't repeat") {
            db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
            console.log(`Deleted non-repeating chore ID ${chore.id} from a past day.`);
          } else if (chore.repeats === "Weekly on this day" || chore.repeats === "Daily") {
            db.prepare('UPDATE chores SET completed = 0 WHERE id = ?').run(chore.id);
            console.log(`Reset repeating chore ID ${chore.id} to uncompleted.`);
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
  const { user_id, title, description, time_period, assigned_day_of_week, repeats, completed, clam_value, expiration_date } = request.body;
  try {
    const completedInt = completed ? 1 : 0;
    const stmt = db.prepare('INSERT INTO chores (user_id, title, description, time_period, assigned_day_of_week, repeats, completed, clam_value, expiration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, title, description, time_period, assigned_day_of_week, repeats, completedInt, clam_value, expiration_date);
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
    const rows = db.prepare('SELECT key, value FROM settings').all();
    // Convert array of {key, value} objects to a single object {key: value}
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    return settings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    reply.status(500).send({ error: 'Failed to fetch settings' });
  }
});

fastify.post('/api/settings', async (request, reply) => {
  const { key, value } = request.body;
  if (!key || value === undefined) {
    return reply.status(400).send({ error: 'Key and value are required.' });
  }
  try {
    // Use INSERT OR REPLACE to either insert a new setting or update an existing one
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(key, value);
    return { success: true, message: `Setting '${key}' saved successfully.` };
  } catch (error) {
    console.error(`Error saving setting '${key}':`, error);
    reply.status(500).send({ error: `Failed to save setting '${key}'` });
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


// NEW: Endpoint to fetch and parse ICS calendar events
fastify.get('/api/calendar-events', async (request, reply) => {
  let icsUrl;
  try {
    const icsUrlSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('ICS_CALENDAR_URL');
    icsUrl = icsUrlSetting ? icsUrlSetting.value : null;
  } catch (error) {
    console.error('Error fetching ICS_CALENDAR_URL from settings:', error);
    reply.status(500).send({ error: 'Failed to retrieve ICS Calendar URL from settings.' });
    return;
  }

  if (!icsUrl) {
    reply.status(400).send({ error: 'ICS_CALENDAR_URL is not set in database settings.' });
    return;
  }

  try {
    const response = await axios.get(icsUrl);
    const icsData = response.data;

    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const events = vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      return {
        title: event.summary,
        start: event.startDate.toJSDate(),
        end: event.endDate.toJSDate(),
        description: event.description,
        location: event.location,
        // Add other properties as needed
      };
    });

    return events;
  } catch (error) {
    console.error('Error fetching or parsing ICS calendar:', error);
    reply.status(500).send({ error: 'Failed to fetch or parse ICS calendar events.' });
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