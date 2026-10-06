import React, { useEffect, useState } from 'react';
import { Box, ClickAwayListener, Tooltip } from '@mui/material';
import { SystemUpdateAlt } from '@mui/icons-material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';

// The server asks GitHub at most every few hours and caches the answer, so an
// hourly poll from each display costs nothing and still picks up a release on
// a screen that is never reloaded.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

// Issue #220: a small badge in the bottom-right corner when a newer release is
// out. Hover or tap it for the versions; Settings → About has the details.
// Renders nothing otherwise, including when the check is off or GitHub can't
// be reached.
const UpdateIndicator = () => {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/update-status`);
        if (!cancelled) setStatus(response.data);
      } catch {
        // A failed poll leaves the last answer in place; the next one retries.
      }
    };
    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!status?.updateAvailable) return null;

  const message = t('update.available', { latest: status.latest, current: status.current });

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1200 }}>
        <Tooltip
          title={(
            <>
              {message}
              <br />
              {t('update.details')}
            </>
          )}
          placement="top-end"
          arrow
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
        >
          <Box
            component="button"
            type="button"
            aria-label={message}
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            sx={{
              width: 36,
              height: 36,
              p: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              cursor: 'pointer',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              color: 'var(--accent)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <SystemUpdateAlt fontSize="small" />
          </Box>
        </Tooltip>
      </Box>
    </ClickAwayListener>
  );
};

export default UpdateIndicator;
