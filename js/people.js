// Each partner has a colour; "Begge" (nobody in particular) has its own.
// The colour follows the order of the names, so it never changes between visits.
export function personTone(state, id) {
  const i = id ? state.profiles.findIndex((p) => p.id === id) : -1;
  return i < 0 ? 'both' : `p${(i % 2) + 1}`;
}

export function personName(state, id) {
  return (id && state.profiles.find((p) => p.id === id)?.name) || 'Begge';
}
