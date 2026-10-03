const crypto = require('crypto');
const axios = require('axios');
const { encrypt, decrypt } = require('../utils/encryption');
const googleConnection = require('./googleConnection');

const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
const AUTH_SCOPES = ['openid', 'email', 'profile', TASKS_SCOPE];
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

function deriveTasksRedirectUri(db, request) {
  const override = googleConnection.getOAuthStatus(db).redirect_uri_override;
  if (override && override.trim()) {
    return override.trim().replace(/\/api\/connections\/google\/callback$/, '/api/connections/google-tasks/callback');
  }

  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = forwardedHost || request.headers.host;
  const proto = forwardedProto || request.protocol || 'http';
  if (!host) throw new Error('Could not determine redirect URI from request.');
  return `${proto}://${host}/api/connections/google-tasks/callback`;
}

function pruneOAuthStates(db) {
  db.prepare(
    "DELETE FROM google_tasks_oauth_states WHERE datetime(created_at) < datetime('now', '-15 minutes')"
  ).run();
}

function buildUserAuthUrl(db, { redirectUri, userId }) {
  const status = googleConnection.getOAuthStatus(db);
  const row = db.prepare("SELECT value FROM settings WHERE key = 'GOOGLE_CLIENT_ID'").get();
  const clientId = row ? row.value : null;
  if (!clientId) {
    throw new Error('Google Client ID is not configured in Admin > Connections.');
  }

  // Opaque single-use state persisted server-side so the callback can
  // verify the flow was initiated here (CSRF protection). The userId and
  // redirectUri never travel through the browser in the state parameter.
  pruneOAuthStates(db);
  const state = crypto.randomBytes(24).toString('base64url');
  db.prepare(
    'INSERT INTO google_tasks_oauth_states (state, user_id, redirect_uri) VALUES (?, ?, ?)'
  ).run(state, userId, redirectUri);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: AUTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function consumeOAuthState(db, state) {
  pruneOAuthStates(db);
  const row = db
    .prepare('SELECT state, user_id, redirect_uri FROM google_tasks_oauth_states WHERE state = ?')
    .get(state);
  if (row) {
    db.prepare('DELETE FROM google_tasks_oauth_states WHERE state = ?').run(state);
  }
  return row;
}

async function handleOAuthCallback(db, { code, state }) {
  const stateRow = consumeOAuthState(db, state);
  if (!stateRow) {
    throw new Error('Invalid or expired OAuth state parameter.');
  }

  const { user_id: userId, redirect_uri: redirectUri } = stateRow;

  const clientRow = db.prepare("SELECT value FROM settings WHERE key = 'GOOGLE_CLIENT_ID'").get();
  const secretRow = db.prepare("SELECT value FROM settings WHERE key = 'GOOGLE_CLIENT_SECRET_ENC'").get();
  if (!clientRow?.value || !secretRow?.value) {
    throw new Error('Google Client ID or Secret is not configured.');
  }

  const clientId = clientRow.value;
  const clientSecret = decrypt(secretRow.value);

  const tokenRes = await axios.post(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const tokens = tokenRes.data;
  if (!tokens.refresh_token) {
    const existing = db.prepare('SELECT refresh_token_enc FROM user_google_tasks_accounts WHERE user_id = ?').get(userId);
    if (!existing || !existing.refresh_token_enc) {
      throw new Error('No refresh token received from Google. Please remove app access and retry with consent.');
    }
  }

  const userInfo = await googleConnection.fetchUserInfo(tokens.access_token);
  const email = userInfo.email || null;
  const expiresInSec = tokens.expires_in || 3600;
  const expiry = new Date(Date.now() + expiresInSec * 1000).toISOString();

  const accessEnc = encrypt(tokens.access_token);
  const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  const existingRow = db.prepare('SELECT id, refresh_token_enc FROM user_google_tasks_accounts WHERE user_id = ?').get(userId);
  if (existingRow) {
    db.prepare(`
      UPDATE user_google_tasks_accounts
      SET google_email = ?,
          access_token_enc = ?,
          refresh_token_enc = COALESCE(?, refresh_token_enc),
          token_expiry = ?
      WHERE user_id = ?
    `).run(email, accessEnc, refreshEnc, expiry, userId);
  } else {
    if (!refreshEnc) {
      throw new Error('Missing refresh token on initial connect.');
    }
    db.prepare(`
      INSERT INTO user_google_tasks_accounts (user_id, google_email, refresh_token_enc, access_token_enc, token_expiry)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, email, refreshEnc, accessEnc, expiry);
  }

  return { userId, email };
}

async function getValidUserAccessToken(db, userId) {
  const row = db.prepare('SELECT refresh_token_enc, access_token_enc, token_expiry FROM user_google_tasks_accounts WHERE user_id = ?').get(userId);
  if (!row) throw new Error(`User ${userId} does not have Google Tasks connected.`);

  const expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (Date.now() < expiry - 60 * 1000 && row.access_token_enc) {
    return decrypt(row.access_token_enc);
  }

  const clientRow = db.prepare("SELECT value FROM settings WHERE key = 'GOOGLE_CLIENT_ID'").get();
  const secretRow = db.prepare("SELECT value FROM settings WHERE key = 'GOOGLE_CLIENT_SECRET_ENC'").get();
  if (!clientRow?.value || !secretRow?.value) {
    throw new Error('Google OAuth credentials are not configured.');
  }

  const clientId = clientRow.value;
  const clientSecret = decrypt(secretRow.value);
  const refreshToken = decrypt(row.refresh_token_enc);

  const res = await axios.post(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const tokens = res.data;
  const expiresInSec = tokens.expires_in || 3600;
  const newExpiry = new Date(Date.now() + expiresInSec * 1000).toISOString();
  const accessEnc = encrypt(tokens.access_token);

  db.prepare(`
    UPDATE user_google_tasks_accounts
    SET access_token_enc = ?, token_expiry = ?
    WHERE user_id = ?
  `).run(accessEnc, newExpiry, userId);

  return tokens.access_token;
}

function getUserTasksStatus(db, userId) {
  const row = db.prepare('SELECT google_email, created_at FROM user_google_tasks_accounts WHERE user_id = ?').get(userId);
  return {
    connected: !!row,
    email: row ? row.google_email : null,
    connected_at: row ? row.created_at : null,
  };
}

async function disconnectUserTasks(db, userId) {
  const row = db.prepare('SELECT refresh_token_enc, access_token_enc FROM user_google_tasks_accounts WHERE user_id = ?').get(userId);
  if (!row) return;

  const tokens = [];
  if (row.access_token_enc) {
    try { tokens.push(decrypt(row.access_token_enc)); } catch (_) {}
  }
  if (row.refresh_token_enc) {
    try { tokens.push(decrypt(row.refresh_token_enc)); } catch (_) {}
  }

  for (const token of tokens) {
    try {
      await axios.post(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`);
    } catch (_) {}
  }

  db.prepare('DELETE FROM user_google_tasks_accounts WHERE user_id = ?').run(userId);
}

function parseDueDateOnly(dueRaw) {
  if (!dueRaw) return null;
  const dateMatch = String(dueRaw).match(/^(\d{4}-\d{2}-\d{2})/);
  return dateMatch ? dateMatch[1] : null;
}

function getTodayLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function completeGoogleTask(db, userId, taskId) {
  if (!taskId || !userId) return;
  try {
    const accessToken = await getValidUserAccessToken(db, userId);
    try {
      await axios.patch(
        `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${encodeURIComponent(taskId)}`,
        { status: 'completed' },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      return;
    } catch (patchErr) {
      if (patchErr.response?.status !== 404) throw patchErr;
    }

    // If @default returned 404, locate the task across other lists
    const listsRes = await axios.get('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });
    const lists = Array.isArray(listsRes.data?.items) ? listsRes.data.items : [];
    for (const list of lists) {
      if (list.id === '@default') continue;
      try {
        await axios.patch(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks/${encodeURIComponent(taskId)}`,
          { status: 'completed' },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );
        return;
      } catch (err) {
        if (err.response?.status !== 404) throw err;
      }
    }
  } catch (error) {
    if (error.response?.status === 403) {
      console.warn(`[GoogleTasks] 403 Forbidden updating task ${taskId} for user ${userId}. Reconnection may be needed for write scope.`);
    } else {
      console.warn(`[GoogleTasks] Error completing Google task ${taskId} for user ${userId}:`, error.message);
    }
  }
}

async function fetchAllUserTasks(accessToken) {
  let listIds = [];
  try {
    let listPageToken = null;
    do {
      const qs = listPageToken ? `?maxResults=100&pageToken=${encodeURIComponent(listPageToken)}` : '?maxResults=100';
      const listsRes = await axios.get(`https://tasks.googleapis.com/tasks/v1/users/@me/lists${qs}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      });
      const items = Array.isArray(listsRes.data?.items) ? listsRes.data.items : [];
      for (const item of items) {
        if (item.id) listIds.push(item.id);
      }
      listPageToken = listsRes.data?.nextPageToken || null;
    } while (listPageToken);
  } catch (err) {
    console.warn('[GoogleTasks] Failed to list task lists, falling back to @default:', err.message);
  }

  if (listIds.length === 0) {
    listIds = ['@default'];
  }

  const allTasks = [];
  const seenTaskIds = new Set();

  for (const listId of listIds) {
    let taskPageToken = null;
    do {
      const params = new URLSearchParams({
        showCompleted: 'true',
        showHidden: 'true',
        showDeleted: 'true',
        maxResults: '100',
      });
      if (taskPageToken) {
        params.set('pageToken', taskPageToken);
      }
      const tasksRes = await axios.get(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        }
      );
      const items = Array.isArray(tasksRes.data?.items) ? tasksRes.data.items : [];
      for (const item of items) {
        if (item.id && !seenTaskIds.has(item.id)) {
          seenTaskIds.add(item.id);
          allTasks.push(item);
        }
      }
      taskPageToken = tasksRes.data?.nextPageToken || null;
    } while (taskPageToken);
  }

  return allTasks;
}

async function syncUserGoogleTasks(db, userId) {
  const account = db.prepare('SELECT id, user_id FROM user_google_tasks_accounts WHERE user_id = ?').get(userId);
  if (!account) return { synced: 0, imported: 0, updated: 0 };

  const accessToken = await getValidUserAccessToken(db, userId);
  const tasks = await fetchAllUserTasks(accessToken);
  const today = getTodayLocalDate();

  let importedCount = 0;
  let updatedCount = 0;

  const findScheduleByGoogleTaskId = db.prepare(`
    SELECT cs.id, cs.chore_id, cs.user_id, cs.visible, cs.due_date, c.title, c.clam_value
    FROM chore_schedules cs
    JOIN chores c ON cs.chore_id = c.id
    WHERE cs.google_task_id = ?
  `);
  const updateScheduleDetails = db.prepare(`
    UPDATE chore_schedules SET due_date = ?, visible = ? WHERE id = ?
  `);
  const updateChoreDetails = db.prepare(`
    UPDATE chores SET title = ?, description = ? WHERE id = ?
  `);
  const checkChoreCompletedToday = db.prepare(`
    SELECT id FROM chore_history
    WHERE chore_schedule_id = ? AND date = ? AND kind = 'completion'
  `);
  const insertChoreHistory = db.prepare(`
    INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value, title, kind)
    VALUES (?, ?, ?, ?, ?, 'completion')
  `);
  const deleteMissedHistory = db.prepare(`
    DELETE FROM chore_history
    WHERE chore_schedule_id = ? AND date = ? AND kind = 'missed'
  `);
  const hideSchedule = db.prepare(`
    UPDATE chore_schedules SET visible = 0 WHERE id = ?
  `);
  const insertChore = db.prepare('INSERT INTO chores (title, description, clam_value, icon) VALUES (?, ?, 0, ?)');
  const insertSchedule = db.prepare(`
    INSERT INTO chore_schedules (
      chore_id, user_id, crontab, duration, visible, due_date, google_task_id
    ) VALUES (?, ?, NULL, 'day-of', 1, ?, ?)
  `);

  for (const task of tasks) {
    if (!task.id) continue;

    const existingSchedule = findScheduleByGoogleTaskId.get(task.id);

    // Case B: Deleted or hidden in Google Tasks
    if (task.deleted || task.hidden) {
      if (existingSchedule && existingSchedule.visible === 1) {
        hideSchedule.run(existingSchedule.id);
        updatedCount++;
      }
      continue;
    }

    // Case A: Marked completed in Google Tasks
    if (task.status === 'completed') {
      if (existingSchedule) {
        const isCompleted = checkChoreCompletedToday.get(existingSchedule.id, today);
        if (!isCompleted) {
          deleteMissedHistory.run(existingSchedule.id, today);
          insertChoreHistory.run(
            existingSchedule.user_id,
            existingSchedule.id,
            today,
            existingSchedule.clam_value || 0,
            existingSchedule.title
          );
          updatedCount++;
        }
      }
      continue;
    }

    // Case C: Uncompleted task
    const dueDate = parseDueDateOnly(task.due);
    const isDue = !dueDate || dueDate <= today;
    const targetVisible = isDue ? 1 : 0;
    const targetDueDate = dueDate || today;

    if (existingSchedule) {
      let changed = false;
      if (existingSchedule.due_date !== targetDueDate || existingSchedule.visible !== targetVisible) {
        updateScheduleDetails.run(targetDueDate, targetVisible, existingSchedule.id);
        changed = true;
      }
      if (task.title && task.title.trim() !== existingSchedule.title) {
        updateChoreDetails.run(task.title.trim(), task.notes || null, existingSchedule.chore_id);
        changed = true;
      }
      if (changed) {
        updatedCount++;
      }
      continue;
    }

    // New task: only import if due today, overdue, or has no due date set
    if (!isDue) {
      continue;
    }

    if (task.title) {
      const choreResult = insertChore.run(task.title.trim(), task.notes || null, '📋');
      insertSchedule.run(
        choreResult.lastInsertRowid,
        userId,
        targetDueDate,
        task.id
      );
      importedCount++;
    }
  }

  return { synced: tasks.length, imported: importedCount, updated: updatedCount };
}

async function syncAllGoogleTasks(db) {
  const accounts = db.prepare('SELECT user_id FROM user_google_tasks_accounts').all();
  let totalImported = 0;
  for (const acc of accounts) {
    try {
      const res = await syncUserGoogleTasks(db, acc.user_id);
      totalImported += res.imported;
    } catch (err) {
      console.warn(`[GoogleTasks] Sync error for user ${acc.user_id}:`, err.message);
    }
  }
  return { totalUsers: accounts.length, totalImported };
}

module.exports = {
  deriveTasksRedirectUri,
  buildUserAuthUrl,
  handleOAuthCallback,
  getUserTasksStatus,
  completeGoogleTask,
  disconnectUserTasks,
  syncUserGoogleTasks,
  syncAllGoogleTasks,
};
