import { el } from './dom.js';
import { dueInfo } from './dates.js';
import { inScope, sortDone, sortOpen } from './items.js';
import { personName, personTone } from './people.js';

const itemsOf = (state, listId) => state.items.filter((i) => i.listId === listId);

function itemRow(item, state, h, { meta = false, editable = false } = {}) {
  const tick = el('button', {
    type: 'button',
    class: 'tick',
    role: 'checkbox',
    'aria-checked': String(item.done),
    'aria-label': item.text,
    onclick: () => h.onToggle(item),
  });
  const due = meta && !item.done && item.due && dueInfo(item.due);
  const metaRow = meta && (item.assignee || due) && el('span', { class: 'meta' },
    item.assignee && el('span', { class: `chip ${personTone(state, item.assignee)}`, text: personName(state, item.assignee) }),
    due && el('span', { class: `chip due ${due.tone}`, text: due.label }));
  const body = [el('span', { class: 'text', text: item.text }), metaRow];
  return el('li', { class: `item${item.done ? ' done' : ''}` },
    tick,
    editable
      ? el('button', { type: 'button', class: 'item-text', 'aria-label': `Rediger ${item.text}`, onclick: () => h.onEditItem(item) }, body)
      : el('span', { class: 'item-text' }, body),
    !editable && el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Slet ${item.text}`, text: '×', onclick: () => h.onDeleteItem(item.id) }));
}

// The ticked-off part of a list: folded away, with a button to clear it.
function doneBox(listId, done, label, state, h, rowOpts) {
  if (!done.length) return null;
  const open = state.showDone.has(listId);
  return el('div', { class: 'done-box' },
    el('div', { class: 'done-head' },
      el('button', { type: 'button', class: 'link', 'aria-expanded': String(open), text: `${open ? '▾' : '▸'} ${label} (${done.length})`, onclick: () => h.onToggleDone(listId) }),
      el('button', { type: 'button', class: 'link', text: 'Ryd', onclick: () => h.onClearDone(listId, done.map((i) => i.id)) })),
    open && el('ul', { class: 'items card' }, done.map((i) => itemRow(i, state, h, rowOpts))));
}

function listBody(container, listId, items, state, h, { emptyText, doneLabel, rowOpts, open: openItems }) {
  const open = openItems ?? sortOpen(items);
  container.replaceChildren(...[
    open.length
      ? el('ul', { class: 'items card' }, open.map((i) => itemRow(i, state, h, rowOpts)))
      : el('p', { class: 'empty card', text: emptyText }),
    doneBox(listId, sortDone(items), doneLabel, state, h, rowOpts),
  ].filter(Boolean));
}

const SCOPES = [{ id: 'shared', label: 'Fælles' }, { id: 'mine', label: 'Min egen' }];

export function renderTodo(scopeBox, container, list, state, h) {
  scopeBox.replaceChildren(...SCOPES.map((s) => el('button', {
    type: 'button',
    class: 'chip-btn',
    'aria-pressed': String(state.todoScope === s.id),
    text: s.label,
    onclick: () => h.onScope(s.id),
  })));
  if (!list) return container.replaceChildren();
  const mine = state.todoScope === 'mine';
  listBody(container, list.id, inScope(itemsOf(state, list.id), state.todoScope, state.user.id), state, h, {
    emptyText: mine ? 'Din egen liste er tom.' : 'Ingen fælles opgaver. Nyd det.',
    doneLabel: 'Færdige',
    rowOpts: { meta: true, editable: true },
  });
}

export function renderShopping(container, list, state, h) {
  if (!list) return container.replaceChildren();
  const items = itemsOf(state, list.id);
  // In the order they were added: that is usually the order they came to mind.
  const open = items.filter((i) => !i.done).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  listBody(container, list.id, items, state, h, {
    emptyText: 'Indkøbslisten er tom.',
    doneLabel: 'I kurven',
    rowOpts: {},
    open,
  });
}

export function renderListsGrid(container, state, h) {
  const custom = state.lists.filter((l) => l.kind === 'custom');
  if (!custom.length) {
    return container.replaceChildren(el('p', { class: 'empty card', text: 'Ingen lister endnu. Lav fx en til gaveidéer, film eller rejsemål.' }));
  }
  container.replaceChildren(el('div', { class: 'list-grid' }, custom.map((l) => {
    const left = itemsOf(state, l.id).filter((i) => !i.done).length;
    return el('button', { type: 'button', class: 'list-card card', onclick: () => h.onOpenList(l.id) },
      el('span', { class: 'name', text: l.name }),
      el('span', { class: 'count', text: left === 1 ? '1 punkt' : `${left} punkter` }));
  })));
}

export function renderListDetail(container, list, state, h) {
  listBody(container, list.id, itemsOf(state, list.id), state, h, {
    emptyText: 'Listen er tom. Tilføj det første punkt ovenfor.',
    doneLabel: 'Afkrydset',
    rowOpts: {},
  });
}
