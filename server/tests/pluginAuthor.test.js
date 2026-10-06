// Plugin author attribution (issue #210).
const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePluginAuthor } = require('../utils/pluginAuthor');

test('a plugin\'s own author wins, even over the pre-v1.6 list', () => {
    assert.equal(resolvePluginAuthor({ manifest: { id: 'nightscout', author: 'adamecker' }, filename: 'nightscout.html' }), 'adamecker');
    assert.equal(resolvePluginAuthor({ manifest: { id: 'family-countdown', author: 'Someone Else' }, filename: 'Countdown.html' }), 'Someone Else');
});

test('pre-v1.6 plugins are credited to HomeGlow by manifest id, old ids included', () => {
    for (const id of ['family-countdown', 'calendar-agenda', 'weekly-calendar', 'rss-reader', 'news-ticker', 'date-clock']) {
        assert.equal(resolvePluginAuthor({ manifest: { id }, filename: 'whatever.html' }), 'HomeGlow', id);
    }
});

test('a pre-v1.6 copy with no manifest is recognised by its file, removed plugins included', () => {
    for (const filename of ['Bills.html', 'TastyTiles.html', 'SaintoftheDay.html', 'DAVcalendars.html']) {
        assert.equal(resolvePluginAuthor({ manifest: null, filename }), 'HomeGlow', filename);
    }
});

test('anything else shows no author rather than a guessed one', () => {
    // Plugins from v1.6 on name their own author.
    for (const id of ['chore-metrics', 'routines', 'weather-glance', 'nightscout', 'my-own-plugin']) {
        assert.equal(resolvePluginAuthor({ manifest: { id }, filename: `${id}.html` }), null, id);
    }
    // A household's own upload that happens to share an old plugin's filename
    // but declares its own id is not the old plugin.
    assert.equal(resolvePluginAuthor({ manifest: { id: 'our-countdown' }, filename: 'Countdown.html' }), null);
    assert.equal(resolvePluginAuthor({ manifest: null, filename: 'my-widget.html' }), null);
    // Blank or non-string authors fall through as if absent.
    assert.equal(resolvePluginAuthor({ manifest: { id: 'my-own-plugin', author: '   ' }, filename: 'x.html' }), null);
    assert.equal(resolvePluginAuthor({ manifest: { id: 'family-polls', author: '' }, filename: 'Polls.html' }), 'HomeGlow');
});
