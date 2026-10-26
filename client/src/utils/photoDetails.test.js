import { describe, it, expect } from 'vitest';
import { photoDetailLines } from './photoDetails.js';

const more = (count) => `${count} others`;

describe('photoDetailLines', () => {
  it('gives the date, the people and the place, in that order', () => {
    expect(photoDetailLines(
      { takenOn: '2019-06-14', people: ['Emma', 'Liam'], place: 'South Lake Tahoe, California' },
      { locale: 'en-US', more },
    )).toEqual(['June 14, 2019', 'Emma and Liam', 'South Lake Tahoe, California']);
  });

  it('names three people and counts the rest', () => {
    expect(photoDetailLines({ people: ['Emma', 'Liam', 'Noah', 'Mia', 'Ava'] }, { locale: 'en-US', more }))
      .toEqual(['Emma, Liam, Noah, and 2 others']);
  });

  it('leaves out what the photo doesn\'t carry', () => {
    expect(photoDetailLines({ takenOn: '2021-12-25' }, { locale: 'en-US', more })).toEqual(['December 25, 2021']);
    expect(photoDetailLines({ url: '/x.jpg' }, { locale: 'en-US', more })).toEqual([]);
    expect(photoDetailLines({ takenOn: 'yesterday', people: ['', '  '], place: ' ' }, { locale: 'en-US', more })).toEqual([]);
  });

  it('writes the date in the display\'s language', () => {
    expect(photoDetailLines({ takenOn: '2019-06-14' }, { locale: 'es', more })).toEqual(['14 de junio de 2019']);
  });
});
