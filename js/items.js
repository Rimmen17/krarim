// Open items first: dated ones by deadline, then undated in the order they were added.
export function sortOpen(items) {
  return items
    .filter((i) => !i.done)
    .sort((a, b) => {
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
      if (Boolean(a.due) !== Boolean(b.due)) return a.due ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

// Done items, the most recently ticked first.
export function sortDone(items) {
  return items
    .filter((i) => i.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
}

// The to-do page shows either the shared tasks or the person's own private ones.
export function inScope(items, scope, userId) {
  return scope === 'mine' ? items.filter((i) => i.owner === userId) : items.filter((i) => !i.owner);
}
