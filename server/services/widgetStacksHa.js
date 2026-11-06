// Stacks and Home Assistant: the entities a display's Stacks read for
// "Bring to front when…" (client/src/utils/widgetStacks.js).

const { isEntityId } = require('./haEntities');

function entityRefs(widgetStacks) {
  const ids = new Set();
  for (const stack of Array.isArray(widgetStacks?.stacks) ? widgetStacks.stacks : []) {
    for (const rule of Array.isArray(stack?.attention) ? stack.attention : []) {
      if (isEntityId(rule?.entity)) ids.add(rule.entity);
    }
  }
  return [...ids].slice(0, 64);
}

module.exports = { entityRefs };
