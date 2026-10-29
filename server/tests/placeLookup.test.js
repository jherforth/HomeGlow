// Where a photo was taken, named offline from the bundled town list.
const test = require('node:test');
const assert = require('node:assert/strict');
const { placeName, nearestTown } = require('../services/placeLookup');

test('a big city names a photo taken anywhere in it, not the small town nearest its point', () => {
    // The Empire State Building is nearer Weehawken's point than New York's.
    assert.equal(placeName(40.7484, -73.9857), 'New York City, New York');
    // A photo in Hoboken itself is still Hoboken.
    assert.equal(placeName(40.7440, -74.0324), 'Hoboken, New Jersey');
});

test('small towns are named: the list goes down to 1,000 people', () => {
    assert.equal(placeName(44.2795, -73.9799), 'Lake Placid, New York');
});

test('outside the US the second part is the country', () => {
    assert.equal(placeName(32.0853, 34.7818), 'Tel Aviv, Israel');
    assert.equal(placeName(-33.8568, 151.2153), 'Sydney, Australia');
});

test("a numbered district is its city: the Eiffel Tower is in Paris, not 'Paris 07'", () => {
    assert.equal(placeName(48.8584, 2.2945), 'Paris, France');
});

test('across the date line', () => {
    assert.equal(nearestTown(-16.78, 179.33)?.country, 'FJ');
});

test('far from any town, or no position, is no place', () => {
    assert.equal(placeName(35, -40), null); // mid-Atlantic
    assert.equal(placeName(0, 0), null);
    assert.equal(placeName(91, 0), null);
    assert.equal(placeName(null, null), null);
    assert.equal(placeName('north', 'west'), null);
});
