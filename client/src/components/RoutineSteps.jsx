import React from 'react';
import { Box, ButtonBase, Chip, LinearProgress, Typography } from '@mui/material';
import { Check, Close } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// A routine's steps inside its chore card (Family → Routines). Each step is
// ticked on its own; the last one completes the chore, and the card's own
// button still completes the whole routine at once. Once done, only the
// progress, streak and on-time chips stay, so the card is as small as any.
// Past its expiry (issue #279), the steps still to do show a red ✕; tapping
// one goes to the widget, which sends the child for a parent.
export default function RoutineSteps({ day, onToggle, expired = false }) {
  const { t } = useTranslation(['chores']);
  const total = day.steps.length;
  const done = day.steps.filter((step) => day.done.includes(step.id)).length;
  const finished = day.completed;

  return (
    // The card's long-press opens its menu; ticking a step must not.
    <Box onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
        {!finished && total > 0 && (
          <Chip
            size="small"
            variant="outlined"
            label={t('chores:routines.progress', { done, total })}
            aria-label={t('chores:routines.progressAria', { done, total })}
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        )}
        {day.streak > 0 && (
          <Chip
            size="small"
            label={`${day.streak} 🔥`}
            aria-label={t('chores:routines.streakAria', { count: day.streak })}
            sx={{ fontSize: '0.7rem', height: 20, bgcolor: 'var(--accent)', color: 'white' }}
          />
        )}
        {finished && day.onTime !== null && (
          <Chip
            size="small"
            variant="outlined"
            color={day.onTime ? 'success' : 'warning'}
            label={day.onTime ? t('chores:routines.onTime') : t('chores:routines.late')}
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        )}
      </Box>

      {!finished && total > 0 && (
        <>
          <LinearProgress
            variant="determinate"
            value={(done / total) * 100}
            aria-hidden="true"
            sx={{
              mt: 0.75,
              height: 4,
              borderRadius: 2,
              bgcolor: 'var(--hg-meter-track, rgba(127, 127, 127, 0.22))',
              '& .MuiLinearProgress-bar': { bgcolor: 'var(--hg-meter-fill, var(--accent))' },
            }}
          />
          <Box component="ul" aria-label={t('chores:routines.stepsOf', { name: day.name })} sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0 }}>
            {day.steps.map((step) => {
              const on = day.done.includes(step.id);
              const tooLate = expired && !on;
              return (
                <Box component="li" key={step.id}>
                  {/* The whole row is the button: a big target for small fingers. */}
                  <ButtonBase
                    onClick={() => onToggle(day, step.id, !on)}
                    aria-pressed={on}
                    aria-label={on
                      ? t('chores:routines.untickStep', { step: step.label })
                      : tooLate
                        ? t('chores:expiry.markExpired', { name: step.label })
                        : t('chores:routines.tickStep', { step: step.label })}
                    sx={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      gap: 0.75,
                      py: 0.375,
                      px: 0.25,
                      borderRadius: 'var(--hg-radius-sm)',
                      textAlign: 'left',
                      '&:hover': { bgcolor: 'rgba(var(--accent-rgb), 0.06)' },
                      '&.Mui-focusVisible': { outline: '2px solid var(--accent)', outlineOffset: 1 },
                    }}
                  >
                    {/* The step's icon in the card's round accent button, as a
                        chore's; ticked, it turns to a check. */}
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        width: 24,
                        height: 24,
                        flexShrink: 0,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '0.85rem',
                        lineHeight: 1,
                        border: `2px solid ${tooLate ? 'var(--hg-error)' : 'var(--accent)'}`,
                        bgcolor: on ? 'var(--accent)' : tooLate ? 'var(--hg-error)' : 'transparent',
                        color: on || tooLate ? 'white' : 'var(--text)',
                      }}
                    >
                      {on
                        ? <Check sx={{ fontSize: '0.95rem' }} />
                        : tooLate ? <Close sx={{ fontSize: '0.95rem' }} /> : (step.icon || '')}
                    </Box>
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{
                        fontSize: '0.78rem',
                        color: 'var(--text)',
                        textDecoration: on ? 'line-through' : 'none',
                        opacity: on ? 0.6 : 1,
                      }}
                    >
                      {step.label}
                    </Typography>
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        </>
      )}
    </Box>
  );
}
