const fastify = require('fastify')({ logger: true });
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const ical = require('ical-generator');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Initialize Fastify with CORS
fastify.register(require('@fastify/cors'));

// Serve static files for uploads
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'Uploads'),
  prefix: '/Uploads/',
});

// Initialize LowDB
const dbPath = path.resolve(__dirname, 'tasks.json');
async function initializeDatabase() {
  try {
    await fs.access(path.dirname(dbPath));
  } catch (error) {
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
  }
  const adapter = new JSONFile(dbPath);
  const db = new Low(adapter, {
    chores: [],
    users: [],
    events: [],
  });
  await db.read();
  return db;
}

// Chore routes
fastify.get('/api/chores', async (request, reply) => {
  try {
    const db = await initializeDatabase();
    return db.data.chores;
  } catch (error) {
    console.error('Error fetching chores:', error);
    reply.status(500).send({ error: 'Failed to fetch chores' });
  }
});

fastify.post('/api/chores', async (request, reply) => {
  const { user_id, title, description, completed } = request.body;
  try {
    const db = await initializeDatabase();
    const newChore = { id: db.data.chores.length + 1, user_id, title, description, completed };
    db.data.chores.push(newChore);
    await db.write();
    return { id: newChore.id };
  } catch (error) {
    console.error('Error adding chore:', error);
    reply.status(500).send({ error: 'Failed to add chore' });
  }
});

fastify.patch('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  const { completed } = request.body;
  try {
    const db = await initializeDatabase();
    const chore = db.data.chores.find((c) => c.id === parseInt(id));
    if (chore) {
      chore.completed = completed;
      await db.write();
      return { success: true };
    } else {
      reply.status(404).send({ error: 'Chore not found' });
    }
  } catch (error) {
    console.error('Error updating chore:', error);
    reply.status(500).send({ error: 'Failed to update chore' });
  }
});

// User routes
fastify.post('/api/users', async (request, reply) => {
  const { username, email, profile_picture } = request.body;
  try {
    const db = await initializeDatabase();
    const newUser = { id: db.data.users.length + 1, username, email, profile_picture };
    db.data.users.push(newUser);
    await db.write();
    return { id: newUser.id };
  } catch (error) {
    console.error('Error adding user:', error);
    reply.status(500).send({ error: 'Failed to add user' });
  }
});

// Calendar routes
fastify.get('/api/calendar', async (request, reply) => {
  try {
    const db = await initializeDatabase();
    return db.data.events;
  } catch (error) {
    console.error('Error fetching events:', error);
    reply.status(500).send({ error: 'Failed to fetch events' });
  }
});

fastify.post('/api/calendar', async (request, reply) => {
  const { user_id, summary, start, end, description } = request.body;
  try {
    const db = await initializeDatabase();
    const newEvent = { id: db.data.events.length + 1, user_id, summary, start, end, description };
    db.data.events.push(newEvent);
    await db.write();
    return { id: newEvent.id };
  } catch (error) {
    console.error('Error adding event:', error);
    reply.status(500).send({ error: 'Failed to add event' });
  }
});

fastify.get('/api/calendar/ics', async (request, reply) => {
  try {
    const db = await initializeDatabase();
    const calendar = ical({ name: 'HomeGlow Calendar' });
    db.data.events.forEach((event) => {
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

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 5000, host: '0.0.0.0' });
    console.log(`Server running on port ${process.env.PORT || 5000}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();