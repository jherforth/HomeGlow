// Names and titles are saved without leading or trailing spaces: "Compost out "
// sorts, matches and reads as "Compost out". Anything that isn't a string
// passes through, so each route's own checks still see it as sent.
function trimmed(value) {
  return typeof value === 'string' ? value.trim() : value;
}

module.exports = { trimmed };
