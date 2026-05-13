const HEX_COLOR_PATTERN = /^#([a-f\d]{3}|[a-f\d]{6})$/i;
const RGB_COLOR_PATTERN = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i;

const clampChannel = (value) => Math.max(0, Math.min(255, value));

const parseHexColor = (color) => {
  const hex = color.slice(1);
  if (hex.length === 3) {
    return [
      clampChannel(parseInt(hex[0] + hex[0], 16)),
      clampChannel(parseInt(hex[1] + hex[1], 16)),
      clampChannel(parseInt(hex[2] + hex[2], 16)),
    ];
  }
  return [
    clampChannel(parseInt(hex.slice(0, 2), 16)),
    clampChannel(parseInt(hex.slice(2, 4), 16)),
    clampChannel(parseInt(hex.slice(4, 6), 16)),
  ];
};

const parseColor = (color) => {
  if (typeof color !== 'string') return null;
  const value = color.trim();

  if (HEX_COLOR_PATTERN.test(value)) {
    return parseHexColor(value);
  }

  const rgbMatch = value.match(RGB_COLOR_PATTERN);
  if (rgbMatch) {
    return [
      clampChannel(parseInt(rgbMatch[1], 10)),
      clampChannel(parseInt(rgbMatch[2], 10)),
      clampChannel(parseInt(rgbMatch[3], 10)),
    ];
  }

  return null;
};

const toLinear = (channel) => {
  const normalized = channel / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
};

const getRelativeLuminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const getContrastRatio = (rgbA, rgbB) => {
  const luminanceA = getRelativeLuminance(rgbA);
  const luminanceB = getRelativeLuminance(rgbB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
};

const LIGHT_MODE_DARK_TEXT_LUMINANCE_MIN = 0.42;
const LIGHT_MODE_DARK_TEXT_CONTRAST_MARGIN = 0.75;

export const getPreferredColorMode = () => {
  if (typeof document !== 'undefined') {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark' || theme === 'light') {
      return theme;
    }
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
};

export const getEventPillPalette = (backgroundColor, mode = 'light') => {
  const defaultTextColor = mode === 'dark' ? '#ffffff' : '#111827';
  const defaultBorderColor = mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';
  const parsedColor = parseColor(backgroundColor);

  if (!parsedColor) {
    return {
      backgroundColor,
      textColor: defaultTextColor,
      borderColor: defaultBorderColor,
    };
  }

  const white = [255, 255, 255];
  const dark = [17, 24, 39];
  const luminance = getRelativeLuminance(parsedColor);
  const whiteContrast = getContrastRatio(parsedColor, white);
  const darkContrast = getContrastRatio(parsedColor, dark);

  let useDarkText;
  if (mode === 'light') {
    const isBrightEnoughForDarkText = luminance >= LIGHT_MODE_DARK_TEXT_LUMINANCE_MIN;
    const darkTextHasStrongContrastLead = darkContrast >= (whiteContrast + LIGHT_MODE_DARK_TEXT_CONTRAST_MARGIN);
    useDarkText = isBrightEnoughForDarkText && darkTextHasStrongContrastLead;
  } else {
    useDarkText = darkContrast >= whiteContrast;
  }

  return {
    backgroundColor,
    textColor: useDarkText ? '#111827' : '#ffffff',
    borderColor: useDarkText ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.32)',
  };
};