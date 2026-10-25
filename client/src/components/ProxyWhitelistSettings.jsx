import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Box, Chip, TextField, Typography } from '@mui/material';
import { Cancel } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { addEntries, parseWhitelist, serializeWhitelist } from '../utils/proxyWhitelist.js';

// The proxy whitelist (issue #328), at the top of System → Connections: the
// sites plugins may fetch through HomeGlow's proxy (/api/proxy). A comma, a
// space or Enter turns what's typed into a chip, and a pasted list becomes
// several; a full address is cut down to its host, which is all the proxy
// compares. Adding or removing one saves straight away.
export default function ProxyWhitelistSettings({ value, onSaved }) {
  const { t } = useTranslation(['admin', 'common']);
  const [hosts, setHosts] = useState(() => parseWhitelist(value));
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState([]);
  const [status, setStatus] = useState(null);
  // What the server holds, so a failed save can go back to it.
  const saved = useRef(value);
  // Saves run one at a time, in order: each sends the whole list.
  const queue = useRef(Promise.resolve());

  // The setting arrives after the panel loads. Our own saves come back
  // through `value` too, and are already shown.
  useEffect(() => {
    if (value === saved.current) return;
    saved.current = value;
    setHosts(parseWhitelist(value));
  }, [value]);

  const save = (next) => {
    setHosts(next);
    setStatus(null);
    const serialized = serializeWhitelist(next);
    queue.current = queue.current.then(async () => {
      try {
        await axios.post(`${API_BASE_URL}/api/settings`, { key: 'PROXY_WHITELIST', value: serialized });
        saved.current = serialized;
        onSaved?.(serialized);
        setStatus({ type: 'success', text: t('admin:connections.proxySaved') });
      } catch (error) {
        console.error('Error saving the proxy whitelist:', error);
        setHosts(parseWhitelist(saved.current));
        setStatus({ type: 'error', text: t('admin:connections.proxySaveFailed') });
      }
    });
  };

  const commit = (text) => {
    const { hosts: added, invalid: refused } = addEntries(text, hosts);
    setInvalid(refused);
    if (added.length) save([...hosts, ...added]);
  };

  // Everything up to the last comma or space is finished; the rest is still
  // being typed.
  const handleChange = (event) => {
    const text = event.target.value;
    const split = /^([\s\S]*)[\s,]([^\s,]*)$/.exec(text);
    if (!split) {
      setDraft(text);
      return;
    }
    commit(split[1]);
    setDraft(split[2]);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commit(draft);
    setDraft('');
  };

  // Leaving the field keeps what was typed, rather than dropping it.
  const handleBlur = () => {
    if (!draft.trim()) return;
    commit(draft);
    setDraft('');
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('admin:connections.proxyIntro')}
      </Typography>
      <TextField
        fullWidth
        label={t('admin:connections.proxyAddLabel')}
        placeholder="api.example.com"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        error={invalid.length > 0}
        helperText={invalid.length > 0
          ? t('admin:connections.proxyInvalid', { entries: invalid.join(', '), count: invalid.length })
          : t('admin:connections.proxyAddHelp')}
        slotProps={{ htmlInput: { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } }}
      />
      {hosts.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }} role="list" aria-label={t('admin:connections.proxyHeading')}>
          {hosts.map((host) => (
            <Chip
              key={host}
              role="listitem"
              label={host}
              variant="outlined"
              onDelete={() => save(hosts.filter((entry) => entry !== host))}
              deleteIcon={<Cancel aria-label={t('admin:connections.proxyRemove', { host })} titleAccess={t('admin:connections.proxyRemove', { host })} />}
            />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {t('admin:connections.proxyEmpty')}
        </Typography>
      )}
      {status && (
        <Typography
          variant="caption"
          role="status"
          sx={{ display: 'block', mt: 1, color: status.type === 'error' ? 'error.main' : 'success.main' }}
        >
          {status.text}
        </Typography>
      )}
    </Box>
  );
}
