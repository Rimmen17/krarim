import { config } from './config.js';
import * as dates from './dates.js';
import { renderAgenda, renderMonth } from './calendar.js';
import { renderListDetail, renderListsGrid, renderShopping, renderTodo } from './lists.js';
import { el } from './dom.js';
import { WALLS, applyWall, savedWall } from './walls.js';

const demo = !config.supabaseUrl;
const backend = await import(demo ? './backend-demo.js' : './backend-supabase.js');

const $ = (id) => document.getElementById(id);
const PAGES = ['calendar', 'todo', 'shopping', 'lists'];
const state = {
  user: null,
  profiles: [],
  events: [],
  lists: [],
  items: [],
  page: 'calendar',
  calView: 'list',
  cursor: new Date(),
  day: null,
  openList: null,
  todoScope: 'shared',
  showDone: new Set(),
};
let subscribed = false;

function showStatus(message) {
  $('status').textContent = message ?? '';
  $('status').hidden = !message;
}

// Runs an action and shows a readable message instead of failing silently.
async function run(action) {
  try {
    showStatus(null);
    await action();
  } catch (err) {
    console.error(err);
    showStatus(err.message || 'Noget gik galt. Prøv igen.');
  }
}

const listOfKind = (kind) => state.lists.find((l) => l.kind === kind);
const openCount = (list) => (list ? state.items.filter((i) => i.listId === list.id && !i.done).length : 0);

function setBadge(id, n) {
  $(id).textContent = String(n);
  $(id).hidden = !n;
}

function render() {
  for (const p of PAGES) {
    $(`page-${p}`).hidden = state.page !== p;
    if (state.page === p) $(`tab-${p}`).setAttribute('aria-current', 'page');
    else $(`tab-${p}`).removeAttribute('aria-current');
  }
  setBadge('badge-todo', openCount(listOfKind('todo')));
  setBadge('badge-shopping', openCount(listOfKind('shopping')));

  $('cal-list').setAttribute('aria-selected', String(state.calView === 'list'));
  $('cal-month').setAttribute('aria-selected', String(state.calView === 'month'));
  $('month').hidden = state.calView !== 'month';
  if (state.calView === 'month') renderMonth($('month'), state, handlers);
  renderAgenda($('agenda'), state, handlers);

  renderTodo($('todo-filter'), $('todo-items'), listOfKind('todo'), state, handlers);
  $('todo-hint').hidden = state.todoScope !== 'mine';
  $('todo-add').elements.text.placeholder = state.todoScope === 'mine' ? 'Ny opgave kun til dig' : 'Ny fælles opgave';
  renderShopping($('shop-items'), listOfKind('shopping'), state, handlers);

  const open = state.lists.find((l) => l.id === state.openList && l.kind === 'custom');
  if (!open) state.openList = null;
  $('lists-overview').hidden = Boolean(open);
  $('list-detail').hidden = !open;
  if (open) {
    $('list-title').textContent = open.name;
    renderListDetail($('list-items'), open, state, handlers);
  } else {
    renderListsGrid($('lists-grid'), state, handlers);
  }
}

async function refresh() {
  // The agenda starts today; the month view may reach back to the first of a shown month.
  const today = dates.startOfDay();
  const monthStart = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
  const from = state.calView === 'month' && monthStart < today ? monthStart : today;

  const [profiles, events, lists, items] = await Promise.all([
    backend.listProfiles(),
    backend.listEvents(from.toISOString()),
    backend.listLists(),
    backend.listItems(),
  ]);
  Object.assign(state, { profiles, events, lists, items });
  render();
}

// Changes from the partner arrive in bursts; one refresh covers a burst.
let pending = null;
function refreshSoon() {
  if (!state.user) return;
  clearTimeout(pending);
  pending = setTimeout(() => run(refresh), 250);
}

const handlers = {
  onEditEvent: (ev) => openEventDialog(ev),
  onDeleteEvent: (id) => run(async () => {
    await backend.deleteEvent(id);
    await refresh();
  }),
  onPickDay: (key) => {
    state.day = key;
    render();
  },
  onMonth: (delta) => run(async () => {
    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
    state.day = null;
    await refresh();
  }),
  onToggle: (item) => run(async () => {
    // Tick at once; the database catches up behind it.
    state.items = state.items.map((i) => (i.id === item.id ? { ...i, done: !item.done, doneAt: new Date().toISOString() } : i));
    render();
    await backend.updateItem(item.id, { done: !item.done });
    await refresh();
  }),
  onEditItem: (item) => openItemDialog(item),
  onDeleteItem: (id) => run(async () => {
    await backend.deleteItem(id);
    await refresh();
  }),
  onClearDone: (listId, ids) => run(async () => {
    await backend.deleteItems(ids);
    state.showDone.delete(listId);
    await refresh();
  }),
  onToggleDone: (listId) => {
    if (!state.showDone.delete(listId)) state.showDone.add(listId);
    render();
  },
  onScope: (id) => {
    state.todoScope = id;
    render();
  },
  onOpenList: (id) => {
    state.openList = id;
    render();
    window.scrollTo(0, 0);
  },
};

function showLogin() {
  Object.assign(state, { user: null, page: 'calendar', calView: 'list', day: null, cursor: new Date(), openList: null, todoScope: 'shared' });
  $('main-view').hidden = true;
  $('login-view').hidden = false;
  $('demo-banner').hidden = !demo;
  $('login-form').reset();
  $('login-name').focus();
}

async function showMain() {
  $('login-view').hidden = true;
  $('main-view').hidden = false;
  $('user-name').textContent = state.user.name;
  await refresh();
  if (!subscribed) {
    backend.subscribe(refreshSoon);
    subscribed = true;
  }
}

function personOptions(select, value) {
  select.replaceChildren(
    el('option', { value: '', text: 'Begge' }),
    ...state.profiles.map((p) => el('option', { value: p.id, text: p.name })));
  select.value = value ?? '';
}

function syncAllDay() {
  const allDay = $('event-form').elements.allDay.checked;
  $('event-times').hidden = allDay;
  $('event-form').elements.start.required = !allDay;
}

function openEventDialog(ev) {
  const form = $('event-form');
  form.reset();
  form.dataset.id = ev?.id ?? '';
  $('event-error').hidden = true;
  $('event-dialog-title').textContent = ev ? 'Rediger aftale' : 'Ny aftale';
  personOptions(form.elements.who, ev?.who);
  if (ev) {
    const start = dates.splitIso(ev.startsAt);
    form.elements.title.value = ev.title;
    form.elements.date.value = start.date;
    form.elements.allDay.checked = ev.allDay;
    form.elements.start.value = ev.allDay ? '' : start.time;
    form.elements.end.value = ev.endsAt ? dates.splitIso(ev.endsAt).time : '';
    form.elements.location.value = ev.location;
    form.elements.description.value = ev.description;
  } else {
    form.elements.date.value = state.day ?? dates.dateKey(new Date());
  }
  syncAllDay();
  $('event-dialog').showModal();
}

function openItemDialog(item) {
  const form = $('item-form');
  form.reset();
  form.dataset.id = item.id;
  form.dataset.private = item.owner ? '1' : '';
  // A private task is the owner's alone, so there is nobody to hand it to.
  $('item-who').hidden = Boolean(item.owner);
  $('item-error').hidden = true;
  form.elements.text.value = item.text;
  form.elements.due.value = item.due ?? '';
  personOptions(form.elements.assignee, item.assignee);
  $('item-dialog').showModal();
}

function openListDialog(list) {
  const form = $('list-form');
  form.reset();
  form.dataset.id = list?.id ?? '';
  $('list-error').hidden = true;
  $('list-dialog-title').textContent = list ? 'Omdøb liste' : 'Ny liste';
  form.elements.name.value = list?.name ?? '';
  $('list-dialog').showModal();
}

function openWallDialog() {
  const current = document.body.dataset.wall;
  $('wall-choices').replaceChildren(...WALLS.map((w) => el('button', {
    type: 'button',
    class: 'wall-choice',
    'aria-pressed': String(w.id === current),
    onclick: () => {
      applyWall(w.id);
      openWallDialog();
    },
  }, el('span', { class: 'swatch', 'data-wall': w.id }), el('span', { text: w.label }))));
  if (!$('wall-dialog').open) $('wall-dialog').showModal();
}

// Shows a form error inside its dialog instead of closing it.
async function submitDialog(e, errorId, dialogId, action) {
  e.preventDefault();
  const error = $(errorId);
  error.hidden = true;
  try {
    await action(e.target.elements);
    $(dialogId).close();
    await refresh();
  } catch (err) {
    error.textContent = err.message || 'Kunne ikke gemme. Prøv igen.';
    error.hidden = false;
  }
}

// Quick-add forms stay in the page, so a live update never steals what is being typed.
function quickAdd(formId, listFor, extra = () => ({})) {
  $(formId).addEventListener('submit', (e) => run(async () => {
    e.preventDefault();
    const input = e.target.elements.text;
    const text = input.value.trim();
    const list = listFor();
    if (!text || !list) return;
    input.value = '';
    input.focus();
    await backend.addItem(list.id, { text, ...extra() });
    await refresh();
  }));
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('login-error');
  error.hidden = true;
  try {
    state.user = await backend.signIn($('login-name').value, $('login-password').value);
    await showMain();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

$('logout').addEventListener('click', () => run(async () => {
  await backend.signOut();
  showLogin();
}));

for (const p of PAGES) {
  $(`tab-${p}`).addEventListener('click', () => {
    if (p === 'lists' && state.page === 'lists') state.openList = null;
    state.page = p;
    render();
    window.scrollTo(0, 0);
  });
}

$('cal-list').addEventListener('click', () => run(async () => {
  state.calView = 'list';
  state.day = null;
  await refresh();
}));
$('cal-month').addEventListener('click', () => run(async () => {
  state.calView = 'month';
  await refresh();
}));

$('new-event').addEventListener('click', () => openEventDialog(null));
$('event-cancel').addEventListener('click', () => $('event-dialog').close());
$('event-form').elements.allDay.addEventListener('change', syncAllDay);
$('event-form').addEventListener('submit', (e) => submitDialog(e, 'event-error', 'event-dialog', async (f) => {
  const title = f.title.value.trim();
  if (!title) throw new Error('Skriv en titel');
  const allDay = f.allDay.checked;
  await backend.saveEvent({
    id: e.target.dataset.id || null,
    title,
    description: f.description.value.trim(),
    location: f.location.value.trim(),
    allDay,
    who: f.who.value || null,
    startsAt: dates.toIso(f.date.value, allDay ? '00:00' : f.start.value),
    endsAt: allDay ? null : dates.endIso(f.date.value, f.start.value, f.end.value),
  });
  // Drop any day filter so the saved event is in view.
  state.day = null;
}));

quickAdd('todo-add', () => listOfKind('todo'), () => ({ owner: state.todoScope === 'mine' ? state.user.id : null }));
quickAdd('shop-add', () => listOfKind('shopping'));
quickAdd('list-add', () => state.lists.find((l) => l.id === state.openList));

$('item-cancel').addEventListener('click', () => $('item-dialog').close());
$('item-form').addEventListener('submit', (e) => submitDialog(e, 'item-error', 'item-dialog', async (f) => {
  const text = f.text.value.trim();
  if (!text) throw new Error('Skriv opgaven');
  const assignee = e.target.dataset.private ? null : f.assignee.value || null;
  await backend.updateItem(e.target.dataset.id, { text, assignee, due: f.due.value || null });
}));
$('item-delete').addEventListener('click', () => run(async () => {
  await backend.deleteItem($('item-form').dataset.id);
  $('item-dialog').close();
  await refresh();
}));

$('new-list').addEventListener('click', () => openListDialog(null));
$('list-rename').addEventListener('click', () => openListDialog(state.lists.find((l) => l.id === state.openList)));
$('list-back').addEventListener('click', () => handlers.onOpenList(null));
$('list-cancel').addEventListener('click', () => $('list-dialog').close());
$('list-form').addEventListener('submit', (e) => submitDialog(e, 'list-error', 'list-dialog', async (f) => {
  const name = f.name.value.trim();
  if (!name) throw new Error('Giv listen et navn');
  state.openList = await backend.saveList({ id: e.target.dataset.id || null, name });
}));

// Two taps instead of a browser confirm box.
$('list-delete').addEventListener('click', () => {
  const btn = $('list-delete');
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = 'Tryk igen for at slette';
    setTimeout(() => {
      delete btn.dataset.armed;
      btn.textContent = 'Slet liste';
    }, 4000);
    return;
  }
  delete btn.dataset.armed;
  btn.textContent = 'Slet liste';
  run(async () => {
    await backend.deleteList(state.openList);
    state.openList = null;
    await refresh();
  });
});

$('open-wall').addEventListener('click', openWallDialog);
$('wall-close').addEventListener('click', () => $('wall-dialog').close());

// A phone that slept may have missed live updates.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshSoon();
});

applyWall(savedWall());
await run(async () => {
  await backend.init(config);
  state.user = await backend.getSession();
  if (state.user) await showMain();
  else showLogin();
});
