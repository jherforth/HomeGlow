import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';

const MonthDayCell = ({
  day,
  isCurrentMonth,
  isToday,
  multiDaySlottedRows,
  dayAllDaySingle,
  dayTimed,
  totalEventCount,
  pillHeight,
  displaySettings,
  eventColors,
  getMultiDayPosition,
  onSlotClick,
  onEventClick,
}) => {
  const eventsRef = useRef(null);
  const [maxItems, setMaxItems] = useState(3);

  useEffect(() => {
    const el = eventsRef.current;
    if (!el) return;

    const computeMax = () => {
      const availableHeight = el.clientHeight;
      const itemH = parseFloat(pillHeight) + 2;
      const moreLineH = 16;
      const fitAll = Math.floor(availableHeight / itemH);
      const fitWithMore = Math.max(1, Math.floor((availableHeight - moreLineH) / itemH));
      setMaxItems(totalEventCount <= fitAll ? fitAll : fitWithMore);
    };

    computeMax();

    const observer = new ResizeObserver(() => {
      computeMax();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [pillHeight, totalEventCount]);

  let shownCount = 0;

  const renderPill = (event, key, clickHandler) => {
    if (!event || shownCount >= maxItems) return null;
    shownCount++;
    const dayDate = day.toDate();
    const { isStart, isEnd } = getMultiDayPosition(event, dayDate);
    const color = event.source_color || eventColors.backgroundColor;
    const isContinuing = !isStart;
    return (
      <Box
        key={key}
        onClick={clickHandler}
        sx={{ mb: 0.25, height: pillHeight, minHeight: pillHeight, display: 'flex', alignItems: 'stretch', cursor: 'pointer' }}
      >
        <Box sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          backgroundColor: color,
          borderTopLeftRadius: isStart ? '10px' : '0px',
          borderBottomLeftRadius: isStart ? '10px' : '0px',
          borderTopRightRadius: isEnd ? '10px' : '0px',
          borderBottomRightRadius: isEnd ? '10px' : '0px',
          px: 0.75,
          py: 0.125,
          border: '1px solid rgba(0,0,0,0.2)',
          borderLeft: !isStart ? 'none' : '1px solid rgba(0,0,0,0.2)',
          borderRight: !isEnd ? 'none' : '1px solid rgba(0,0,0,0.2)',
          overflow: 'hidden',
          '&:hover': { filter: 'brightness(1.1)' }
        }}>
          <Typography variant="caption" sx={{
            fontSize: `${displaySettings.textSize}px`,
            color: '#fff',
            fontWeight: 500,
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: isContinuing ? 0.85 : 1,
          }}>
            {isContinuing ? `\u2190 ${event.title}` : event.title}
          </Typography>
        </Box>
      </Box>
    );
  };

  const remaining = totalEventCount > maxItems ? totalEventCount - maxItems : 0;

  return (
    <Box
      onClick={() => onSlotClick({ start: day.toDate() })}
      sx={{
        border: '1px solid var(--card-border)',
        borderRadius: 1,
        p: 0.75,
        cursor: 'pointer',
        bgcolor: isToday ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
        opacity: isCurrentMonth ? 1 : 0.4,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        '&:hover': {
          bgcolor: isToday ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(0,0,0,0.05)'
        }
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 'bold', color: isToday ? 'var(--accent)' : 'inherit', fontSize: '0.8rem', mb: 0.5 }}>
        {day.format('D')}
      </Typography>

      <Box ref={eventsRef} sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {multiDaySlottedRows.map((event, slotIdx) =>
          renderPill(event, `multi-${slotIdx}`, (e) => { e.stopPropagation(); onEventClick(event); })
        )}

        {dayAllDaySingle.map((event, evIdx) => {
          if (shownCount >= maxItems) return null;
          shownCount++;
          const color = event.source_color || eventColors.backgroundColor;
          return (
            <Box key={`allday-${evIdx}`} onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
              sx={{ mb: 0.25, height: pillHeight, minHeight: pillHeight, display: 'flex', alignItems: 'stretch', cursor: 'pointer' }}>
              <Box sx={{
                flex: 1, display: 'flex', alignItems: 'center',
                backgroundColor: color, borderRadius: '10px', px: 0.75, py: 0.125,
                border: '1px solid rgba(0,0,0,0.2)', overflow: 'hidden',
                '&:hover': { filter: 'brightness(1.1)' }
              }}>
                <Typography variant="caption" sx={{
                  fontSize: `${displaySettings.textSize}px`, color: '#fff',
                  fontWeight: 500, fontStyle: 'italic',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {event.title}
                </Typography>
              </Box>
            </Box>
          );
        })}

        {dayTimed.map((event, evIdx) => {
          if (shownCount >= maxItems) return null;
          shownCount++;
          const color = event.source_color || eventColors.backgroundColor;
          return (
            <Box key={`timed-${evIdx}`} onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, cursor: 'pointer', borderRadius: 0.5, px: 0.25, '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' } }}>
              <Box sx={{ width: displaySettings.bulletSize, height: displaySettings.bulletSize, minWidth: displaySettings.bulletSize, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ fontSize: `${displaySettings.textSize}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {event.title}
              </Typography>
            </Box>
          );
        })}

        {remaining > 0 && (
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'block', mt: 0.25 }}>
            +{remaining} more
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default MonthDayCell;
