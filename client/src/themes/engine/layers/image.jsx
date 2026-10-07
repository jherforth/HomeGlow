import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { draw, forMode } from '../motion.js';

// A still picture from the theme's folder, anchored to an edge or filling the
// screen; covers the width without stretching. Given a list, it shows one of
// them, a different one per scene. With `angle`, it is turned by a drawn
// amount (a galaxy's band crossing the sky a new way each time) and grown so
// the turn never shows a corner; `flip` mirrors it half the time.
const PLACE = {
  bottom: (height) => ({ left: 0, right: 0, bottom: 0, height, backgroundPosition: 'center bottom' }),
  top: (height) => ({ left: 0, right: 0, top: 0, height, backgroundPosition: 'center top' }),
  center: (height) => ({ left: 0, right: 0, top: '50%', height, transform: 'translateY(-50%)', backgroundPosition: 'center' }),
  fill: () => ({ inset: 0, backgroundPosition: 'center' }),
};

function ImageLayer({ options, assets, random, mode }) {
  const scene = useMemo(() => {
    const list = Array.isArray(options.src) ? options.src : [options.src];
    return {
      src: forMode(list[Math.floor(random() * list.length)], mode),
      angle: options.angle === undefined ? null : draw(random, options.angle),
      flip: options.flip ? random() < 0.5 : false,
    };
  }, [options, random, mode]);
  const url = assets[scene.src];
  if (!url) return null;
  const turned = scene.angle !== null;
  const place = turned
    // A square as wide as the screen's diagonal covers it at any angle.
    ? { left: '50%', top: '50%', width: '150vmax', height: '150vmax', marginLeft: '-75vmax', marginTop: '-75vmax', backgroundPosition: 'center' }
    : PLACE[options.anchor || 'bottom'](options.height || '40vh');
  const transforms = [place.transform, turned && `rotate(${scene.angle.toFixed(1)}deg)`, scene.flip && 'scaleX(-1)'].filter(Boolean);
  return (
    <Box
      sx={{
        position: 'absolute',
        ...place,
        transform: transforms.length ? transforms.join(' ') : undefined,
        backgroundImage: `url("${url}")`,
        backgroundSize: turned ? 'contain' : 'cover',
        backgroundRepeat: 'no-repeat',
        opacity: options.opacity ?? 1,
      }}
    />
  );
}

export default { name: 'image', Component: ImageLayer };
