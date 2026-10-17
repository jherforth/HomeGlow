// ntfy in the Admin Panel (issue #288): the connection (System → Connections)
// and the household's topics (Family → Notifications). The server publishes;
// see server/services/ntfy.js.
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

export const readNtfyConnection = async () => (await axios.get(`${API_BASE_URL}/api/connections/ntfy/status`)).data;
export const saveNtfyConnection = async (body) => (await axios.put(`${API_BASE_URL}/api/connections/ntfy`, body)).data;
export const testNtfyConnection = async () => (await axios.post(`${API_BASE_URL}/api/connections/ntfy/test`)).data;

export const listNtfyTopics = async () => (await axios.get(`${API_BASE_URL}/api/ntfy-topics`)).data;
export const createNtfyTopic = async (body) => (await axios.post(`${API_BASE_URL}/api/ntfy-topics`, body)).data;
export const updateNtfyTopic = async (id, body) => (await axios.patch(`${API_BASE_URL}/api/ntfy-topics/${id}`, body)).data;
export const deleteNtfyTopic = async (id) => (await axios.delete(`${API_BASE_URL}/api/ntfy-topics/${id}`)).data;
export const testNtfyTopic = async (id) => (await axios.post(`${API_BASE_URL}/api/ntfy-topics/${id}/test`)).data;
