// Stand-in for Supabase so the site can be tried without a database.
// Used only while config.supabaseUrl is empty. Data stays in this browser.
import { dateKey, startOfDay } from './dates.js';

const KEY = 'krarim-demo';
const PASSWORD = 'demo123';
const USERS = [
  { id: 'u-nicolai', name: 'Nicolai' },
  { id: 'u-sisse', name: 'Sisse' },
];

function seed() {
  const at = (days, hour) => {
    const d = startOfDay();
    d.setDate(d.getDate() + days);
    d.setHours(hour);
    return d;
  };
  const now = new Date().toISOString();
  const item = (id, listId, text, extra = {}) => ({
    id, listId, text, done: false, assignee: null, owner: null, due: null, createdBy: 'u-sisse', createdAt: now, doneAt: null, ...extra,
  });
  return {
    session: null,
    events: [
      { id: 'e-1', title: 'Middag hos mor og far', description: 'Vi tager dessert med.', location: '', startsAt: at(2, 18).toISOString(), endsAt: at(2, 21).toISOString(), allDay: false, who: null, createdBy: 'u-sisse' },
      { id: 'e-2', title: 'Frisør', description: '', location: 'Algade', startsAt: at(5, 10).toISOString(), endsAt: null, allDay: false, who: 'u-sisse', createdBy: 'u-sisse' },
      { id: 'e-3', title: 'Fodbold med drengene', description: '', location: '', startsAt: at(6, 0).toISOString(), endsAt: null, allDay: true, who: 'u-nicolai', createdBy: 'u-nicolai' },
    ],
    lists: [
      { id: 'l-todo', name: 'To-do', kind: 'todo' },
      { id: 'l-shop', name: 'Indkøb', kind: 'shopping' },
      { id: 'l-gifts', name: 'Gaveidéer', kind: 'custom' },
      { id: 'l-films', name: 'Film vi skal se', kind: 'custom' },
    ],
    items: [
      item('i-1', 'l-todo', 'Støvsug stuen', { assignee: 'u-nicolai', due: dateKey(at(1, 0)) }),
      item('i-2', 'l-todo', 'Betal husleje', { due: dateKey(at(4, 0)) }),
      item('i-3', 'l-todo', 'Ring til tandlægen', { owner: 'u-sisse' }),
      item('i-9', 'l-todo', 'Find på en overraskelse til Sisse', { owner: 'u-nicolai', createdBy: 'u-nicolai' }),
      item('i-4', 'l-shop', 'Mælk'),
      item('i-5', 'l-shop', 'Pasta'),
      item('i-6', 'l-shop', 'Bananer', { done: true, doneAt: now }),
      item('i-7', 'l-gifts', 'Tørklæde til mor'),
      item('i-8', 'l-films', 'Past Lives'),
    ],
  };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? seed();
  } catch {
    return seed();
  }
}

function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function current(db) {
  const user = USERS.find((u) => u.id === db.session);
  if (!user) throw new Error('Du er ikke logget ind');
  return user;
}

export async function init() {}

export async function getSession() {
  return USERS.find((u) => u.id === load().session) ?? null;
}

export async function signIn(name, password) {
  const user = USERS.find((u) => u.name.toLowerCase() === name.trim().toLowerCase());
  if (!user || password !== PASSWORD) throw new Error('Forkert navn eller adgangskode');
  const db = load();
  db.session = user.id;
  save(db);
  return user;
}

export async function signOut() {
  const db = load();
  db.session = null;
  save(db);
}

export async function listProfiles() {
  return USERS;
}

export async function listEvents(fromIso) {
  return load().events
    .filter((e) => e.startsAt >= fromIso)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function saveEvent(ev) {
  const db = load();
  const user = current(db);
  const existing = db.events.find((e) => e.id === ev.id);
  const row = { ...ev, id: ev.id || crypto.randomUUID(), createdBy: existing?.createdBy ?? user.id };
  db.events = db.events.filter((e) => e.id !== row.id).concat(row);
  save(db);
}

export async function deleteEvent(id) {
  const db = load();
  current(db);
  db.events = db.events.filter((e) => e.id !== id);
  save(db);
}

export async function listLists() {
  return load().lists;
}

export async function saveList({ id, name }) {
  const db = load();
  current(db);
  if (id) {
    db.lists = db.lists.map((l) => (l.id === id ? { ...l, name } : l));
  } else {
    id = crypto.randomUUID();
    db.lists.push({ id, name, kind: 'custom' });
  }
  save(db);
  return id;
}

// Same rule as the database: only the lists they made themselves can go.
export async function deleteList(id) {
  const db = load();
  current(db);
  if (db.lists.find((l) => l.id === id)?.kind !== 'custom') throw new Error('Denne liste kan ikke slettes');
  db.lists = db.lists.filter((l) => l.id !== id);
  db.items = db.items.filter((i) => i.listId !== id);
  save(db);
}

// Same rule as the database: a private task exists only for its owner.
const visible = (item, user) => !item.owner || item.owner === user.id;

export async function listItems() {
  const db = load();
  const user = current(db);
  return db.items.filter((i) => visible(i, user));
}

export async function addItem(listId, fields) {
  const db = load();
  const user = current(db);
  const owner = fields.owner ?? null;
  if (owner && (owner !== user.id || db.lists.find((l) => l.id === listId)?.kind !== 'todo')) {
    throw new Error('Opgaven kunne ikke gemmes');
  }
  db.items.push({
    id: crypto.randomUUID(), listId, text: fields.text, done: false, assignee: fields.assignee ?? null, owner,
    due: fields.due ?? null, createdBy: user.id, createdAt: new Date().toISOString(), doneAt: null,
  });
  save(db);
}

export async function updateItem(id, patch) {
  const db = load();
  const user = current(db);
  const extra = 'done' in patch ? { doneAt: patch.done ? new Date().toISOString() : null } : {};
  db.items = db.items.map((i) => (i.id === id && visible(i, user) ? { ...i, ...patch, ...extra } : i));
  save(db);
}

export async function deleteItem(id) {
  await deleteItems([id]);
}

export async function deleteItems(ids) {
  const db = load();
  const user = current(db);
  db.items = db.items.filter((i) => !(ids.includes(i.id) && visible(i, user)));
  save(db);
}

// Another tab of the demo stands in for the partner's phone.
export function subscribe(onChange) {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) onChange();
  });
}
