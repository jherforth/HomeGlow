// Who wrote a plugin (issue #210).
//
// A plugin names its author in its manifest ("author": "..."). Every plugin in
// the HomeGlowPlugins repository from before v1.6 was written by the project
// itself and has no author field, and copies of those are installed on displays
// that will never fetch a newer version, so they are recognised here and
// credited to "HomeGlow" instead.
//
// Frozen on purpose: a plugin added from v1.6 on names its own author. Anything
// not listed and without an author field — a household's own upload, say —
// shows no author rather than being credited to someone who didn't write it.

const PROJECT_AUTHOR = 'HomeGlow';
const PLUGIN_AUTHOR_MAX_LENGTH = 80;

// Manifest ids, including ids these plugins used in earlier versions.
const PRE_V1_6_PLUGIN_IDS = new Set([
    'bills-reminder', 'calendar-agenda', 'cron-helper', 'daily-rotation', 'date-clock',
    'emoji-story', 'family-bucket-list', 'family-contacts', 'family-countdown',
    'family-messages', 'family-polls', 'family-scoreboard', 'guest-wifi', 'healthy-habits',
    'liturgical-day', 'news-ticker', 'pixel-reveal', 'rolling-weekly-menu', 'rss-reader',
    'school-lunch', 'sunrise-sunset', 'weekly-calendar', 'wheel-of-choice', 'word-guess',
]);

// For versions from before plugins had manifests, which can only be told apart
// by their file. Includes three since removed from the repository.
const PRE_V1_6_PLUGIN_FILENAMES = new Set([
    'Bills.html', 'BucketList.html', 'CalendarWidget.html', 'Countdown.html', 'CronHelper.html',
    'DAVcalendars.html', 'DailyRotation.html', 'DateClock.html', 'EmojiStory.html',
    'FamilyContacts.html', 'GIFoftheDay.html', 'GuestWifi.html', 'HealthyBits.html',
    'LiturgicalDay.html', 'Messages.html', 'NewsTicker.html', 'PixelReveal.html', 'Polls.html',
    'SaintoftheDay.html', 'SchoolLunch.html', 'Scoreboard.html', 'SunriseSunset.html',
    'TastyTiles.html', 'WheelOfChoice.html', 'WordGuess.html',
]);

// The author to show for a plugin, or null when there is none to show.
function resolvePluginAuthor({ manifest, filename }) {
    const declared = typeof manifest?.author === 'string' ? manifest.author.trim() : '';
    if (declared) return declared;
    const pluginId = typeof manifest?.id === 'string' ? manifest.id : null;
    const isPreV16 = pluginId
        ? PRE_V1_6_PLUGIN_IDS.has(pluginId)
        : PRE_V1_6_PLUGIN_FILENAMES.has(filename);
    return isPreV16 ? PROJECT_AUTHOR : null;
}

module.exports = { PLUGIN_AUTHOR_MAX_LENGTH, PROJECT_AUTHOR, resolvePluginAuthor };
