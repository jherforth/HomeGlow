// ntfy in Admin → System → Notifications: the connection and the household's
// topics. The server publishes; see server/services/ntfy.js.
import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';

export const NTFY_DEFAULT_SERVER = 'https://ntfy.sh';

// Topic names ntfy allows.
export const NTFY_TOPIC = /^[A-Za-z0-9_-]{1,64}$/;

/** A fresh, hard-to-guess topic name: anyone who knows a topic can read it. */
export function randomNtfyTopic(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `homeglow-${[...random(12)].map((byte) => alphabet[byte % alphabet.length]).join('')}`;
}

/** True on public ntfy.sh, where a topic is only as private as its name. */
export const isPublicNtfy = (server) => {
  try {
    return new URL(server || NTFY_DEFAULT_SERVER).hostname.toLowerCase() === 'ntfy.sh';
  } catch {
    return false;
  }
};

const base = `${API_BASE_URL}/api/notifications/ntfy`;

export const readNtfyConnection = async () => (await axios.get(base)).data;
export const saveNtfyConnection = async (body) => (await axios.put(base, body)).data;
export const testNtfyConnection = async () => (await axios.post(`${base}/test`)).data;

export const listNtfyTopics = async () => (await axios.get(`${base}/topics`)).data;
export const createNtfyTopic = async (body) => (await axios.post(`${base}/topics`, body)).data;
export const updateNtfyTopic = async (id, body) => (await axios.patch(`${base}/topics/${id}`, body)).data;
export const deleteNtfyTopic = async (id) => (await axios.delete(`${base}/topics/${id}`)).data;
export const testNtfyTopic = async (id) => (await axios.post(`${base}/topics/${id}/test`)).data;
