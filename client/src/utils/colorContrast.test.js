import { describe, it, expect } from 'vitest';
import { getEventPillPalette } from './colorContrast.js';

describe('color contrast utility', () => {
    it('uses white text for darker forest green in light mode', () => {
        const palette = getEventPillPalette('#228B22', 'light');

        expect(palette.textColor).toBe('#ffffff');
    });

    it('uses dark text for bright lime in light mode', () => {
        const palette = getEventPillPalette('#9DFF00', 'light');

        expect(palette.textColor).toBe('#111827');
    });

    it('keeps dark mode behavior contrast-driven', () => {
        const palette = getEventPillPalette('#9DFF00', 'dark');

        expect(palette.textColor).toBe('#111827');
    });

    it('falls back to mode default when color is invalid', () => {
        const lightPalette = getEventPillPalette('not-a-color', 'light');
        const darkPalette = getEventPillPalette('not-a-color', 'dark');

        expect(lightPalette.textColor).toBe('#111827');
        expect(darkPalette.textColor).toBe('#ffffff');
    });
});
