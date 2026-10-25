// A whole-number field someone can clear, such as a clam value or a prize's
// cost. Coercing every keystroke to a number (`parseInt(value) || 0`) snapped
// a cleared field straight back to 0, so its 0 could never be backspaced:
// keep the empty string while editing, and turn it into a number on save.

/** The form value for what was typed: '' while empty, otherwise a whole number. */
export const editWholeNumber = (text) => (text === '' ? '' : (parseInt(text, 10) || 0));

/** The number to save: an empty or invalid field saves as 0. */
export const savedWholeNumber = (value) => Number(value) || 0;
