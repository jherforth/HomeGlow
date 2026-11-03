// "When <entity> is / is not <state>": a Home Assistant condition, as
// Stacks' "Bring to front when…" rules use it.
//
// A rule is { entity, op: 'is' | 'is_not', state }.

/** Is a rule's condition met by these states? Unknown states never are. */
export function conditionMet(rule, states) {
  const state = states?.[rule.entity]?.state;
  if (state == null || state === 'unavailable' || state === 'unknown') return false;
  return rule.op === 'is_not' ? state !== rule.state : state === rule.state;
}
