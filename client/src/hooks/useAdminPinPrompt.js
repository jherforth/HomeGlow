import { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { pinErrorText } from '../utils/pinErrors.js';

/**
 * For an action the server itself guards with the admin PIN: a backup
 * download, staging a restore or a rollback (server/utils/adminPin.js).
 *
 * `ask(title, run)` runs `run()` straight away when no PIN is set. Otherwise
 * it asks for the PIN, even on a display that remembers it, checks it, then
 * closes the dialog and calls `run(pin)`. The action runs after the dialog
 * closes, so a long upload or download shows its progress on the page, and
 * `run` reports its own failures.
 *
 * Spread `pinModalProps` onto a PinModal.
 */
export function useAdminPinPrompt({ wrongPin }) {
  const { t } = useTranslation('common');
  const [pending, setPending] = useState(null);

  const ask = async (title, run) => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/admin-pin/exists`);
      if (data?.exists === true) {
        setPending({ title, run });
        return;
      }
    } catch {
      // The action itself reports what went wrong.
    }
    await run();
  };

  const verify = async (pin) => {
    let valid = false;
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/admin-pin/verify`, { pin });
      valid = data?.valid === true;
    } catch (error) {
      throw new Error(pinErrorText(error, t, wrongPin));
    }
    if (!valid) throw new Error(wrongPin);
    const { run } = pending;
    setPending(null);
    await run(pin);
  };

  return {
    ask,
    pinModalProps: {
      open: Boolean(pending),
      title: pending?.title || '',
      onClose: () => setPending(null),
      onVerify: verify,
    },
  };
}
