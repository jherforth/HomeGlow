import { Box, Button, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

// The mirror banner strip: label + Unlock + Exit in the mirror view.
// Above the Admin panel (mirror-Admin) it shows label + Exit ONLY —
// there is no layout to toggle while looking at settings, and the
// Unlock button there duplicated nothing the view banner doesn't own.
// Rendered by the mirror view (above the canvas, with the dims/tab line
// as `extra`) and above the Admin panel when Admin is open from a mirror
// — the SAME banner in both places, so it is always clear edits land on
// the target, not this phone.
//
// Deliberately NO Admin button: the dock's Settings entry is the Admin
// entry in mirror mode, and a second entry in the banner duplicated it.
// Deliberately NO zoom: zoom is mirror-canvas-only and meaningless above
// a settings panel.
export default function MirrorBanner({ targetName, locked, onToggleLock, onExit, extra, showLock = true, sx }) {
  const { t } = useTranslation('common');
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
        padding: '0.5rem', background: 'var(--hg-frame-bg)',
        borderRadius: '8px', marginBottom: '0.5rem',
        ...sx,
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: '1 1 auto' }}>
        {t('mirror.mirroring', { name: targetName })}
      </Typography>
      {extra}
      {showLock && (
        <Button size="small" variant="outlined" onClick={onToggleLock}>
          {locked ? t('mirror.unlock') : t('mirror.lock')}
        </Button>
      )}
      <Button size="small" variant="contained" onClick={onExit}>
        {t('mirror.exit')}
      </Button>
    </Box>
  );
}
