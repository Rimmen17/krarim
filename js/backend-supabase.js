import { nameToEmail } from './dates.js';

let sb;
let domain;

export async function init(config) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(config.supabaseUrl, config.supabaseAnonKey);
  domain = config.loginDomain;
}

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

async function loadProfile(id) {
  const p = check(await sb.from('profiles').select('id, name').eq('id', id).single());
  return { id: p.id, name: p.name };
}

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session ? loadProfile(data.session.user.id) : null;
}

export async function signIn(name, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: nameToEmail(name, domain), password });
  if (error) throw new Error('Forkert navn eller adgangskode');
  return loadProfile(data.user.id);
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function listProfiles() {
  return check(await sb.from('profiles').select('id, name').order('name'));
}

export async function listEvents(fromIso) {
  const rows = check(await sb.from('events').select('*').gte('starts_at', fromIso).order('starts_at'));
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    allDay: e.all_day,
    who: e.who,
    createdBy: e.created_by,
  }));
}

export async function saveEvent(ev) {
  const row = {
    title: ev.title,
    description: ev.description,
    location: ev.location,
    starts_at: ev.startsAt,
    ends_at: ev.endsAt,
    all_day: ev.allDay,
    who: ev.who,
  };
  check(ev.id ? await sb.from('events').update(row).eq('id', ev.id) : await sb.from('events').insert(row));
}

export async function deleteEvent(id) {
  check(await sb.from('events').delete().eq('id', id));
}

export async function listLists() {
  return check(await sb.from('lists').select('id, name, kind').order('created_at'));
}

export async function saveList({ id, name }) {
  if (id) {
    check(await sb.from('lists').update({ name }).eq('id', id));
    return id;
  }
  return check(await sb.from('lists').insert({ name }).select('id').single()).id;
}

export async function deleteList(id) {
  const gone = check(await sb.from('lists').delete().eq('id', id).select('id'));
  if (!gone.length) throw new Error('Denne liste kan ikke slettes');
}

export async function listItems() {
  const rows = check(await sb.from('items').select('*'));
  return rows.map((i) => ({
    id: i.id,
    listId: i.list_id,
    text: i.text,
    done: i.done,
    assignee: i.assignee,
    owner: i.owner,
    due: i.due,
    createdBy: i.created_by,
    createdAt: i.created_at,
    doneAt: i.done_at,
  }));
}

export async function addItem(listId, fields) {
  check(await sb.from('items').insert({
    list_id: listId,
    text: fields.text,
    assignee: fields.assignee ?? null,
    owner: fields.owner ?? null,
    due: fields.due ?? null,
  }));
}

export async function updateItem(id, patch) {
  const row = {};
  if ('text' in patch) row.text = patch.text;
  if ('assignee' in patch) row.assignee = patch.assignee;
  if ('due' in patch) row.due = patch.due;
  if ('done' in patch) {
    row.done = patch.done;
    row.done_at = patch.done ? new Date().toISOString() : null;
  }
  check(await sb.from('items').update(row).eq('id', id));
}

export async function deleteItem(id) {
  check(await sb.from('items').delete().eq('id', id));
}

export async function deleteItems(ids) {
  if (ids.length) check(await sb.from('items').delete().in('id', ids));
}

// Live updates: anything the partner changes shows up without reloading.
export function subscribe(onChange) {
  sb.channel('krarim')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onChange)
    .subscribe();
}
