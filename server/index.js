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
  // Register the multipart plugin
fastify.register(multipart);
  origin: '*', // Allow all origins for development. Consider restricting in production.
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Explicitly allow PATCH
  allowedHeaders: ['Content-Type', 'Authorization'], // Add any other headers your client might send
});

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

    const widgetName = data.filename.replace(/[^a-zA-Z0-9-_]/g, '_');
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
