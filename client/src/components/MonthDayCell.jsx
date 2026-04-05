import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const cellRef = useRef(null);
  const dateLabelRef = useRef(null);
  const maxItemsRef = useRef(3);
  const rafRef = useRef(null);
  const [maxItems, setMaxItems] = useState(3);

  const computeMax = useCallback(() => {
    const cellEl = cellRef.current;
    if (!cellEl) return;

    const cellHeight = cellEl.getBoundingClientRect().height;
    const labelHeight = dateLabelRef.current
      ? dateLabelRef.current.getBoundingClientRect().height
      : 20;
    const padding = 12;
    const availableHeight = cellHeight - labelHeight - padding;
    const itemH = parseFloat(pillHeight) + 2;
    const moreLineH = 16;

    let newMax;
    if (availableHeight <= 0) {
      newMax = 0;
    } else {
      const fitAll = Math.floor(availableHeight / itemH);
      if (totalEventCount <= fitAll) {
        newMax = fitAll;
      } else {
        newMax = Math.max(1, Math.floor((availableHeight - moreLineH) / itemH));
      }
    }

    if (newMax !== maxItemsRef.current) {
      maxItemsRef.current = newMax;
      setMaxItems(newMax);
    }
  }, [pillHeight, totalEventCount]);

  useEffect(() => {
    const cellEl = cellRef.current;
    if (!cellEl) return;

    computeMax();

    const observer = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(computeMax);
    });

    observer.observe(cellEl);
    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [computeMax]);

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
      ref={cellRef}
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
      <Typography ref={dateLabelRef} variant="caption" sx={{ fontWeight: 'bold', color: isToday ? 'var(--accent)' : 'inherit', fontSize: '0.8rem', mb: 0.5 }}>
        {day.format('D')}
      </Typography>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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

export default React.memo(MonthDayCell);
