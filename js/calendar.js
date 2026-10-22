import { el } from './dom.js';
import * as dates from './dates.js';
import { personName, personTone } from './people.js';

const WEEKDAYS = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];

function deleteButton(label, onConfirm) {
  const del = el('button', { type: 'button', class: 'link danger', text: label });
  // Two taps instead of a browser confirm box.
  del.addEventListener('click', () => {
    if (del.dataset.armed) return onConfirm();
    del.dataset.armed = '1';
    del.textContent = 'Tryk igen for at slette';
    setTimeout(() => {
      delete del.dataset.armed;
      del.textContent = label;
    }, 4000);
  });
  return del;
}

function eventCard(ev, state, h) {
  const parts = dates.dateParts(ev.startsAt);
  const time = ev.allDay ? 'Hele dagen' : dates.formatRange(ev.startsAt, ev.endsAt);
  const where = [time, ev.location].filter(Boolean).join(' · ');
  const creator = state.profiles.find((p) => p.id === ev.createdBy)?.name;
  return el('article', { class: `event card tone-${personTone(state, ev.who)}`, id: `event-${ev.id}` },
    el('div', { class: 'date', 'aria-hidden': 'true' },
      el('span', { class: 'wd', text: parts.weekday }),
      el('span', { class: 'dd', text: parts.day }),
      el('span', { class: 'mm', text: parts.month })),
    el('div', { class: 'body' },
      el('div', { class: 'title-row' },
        el('h3', { text: ev.title }),
        el('span', { class: `chip ${personTone(state, ev.who)}`, text: personName(state, ev.who) })),
      el('p', { class: 'when' }, el('span', { class: 'sr', text: `${dates.formatDay(ev.startsAt)}, ` }), where),
      ev.description && el('p', { class: 'desc', text: ev.description }),
      el('div', { class: 'foot' },
        creator && el('span', { class: 'creator', text: `Oprettet af ${creator}` }),
        el('span', { class: 'edit-row' },
          el('button', { type: 'button', class: 'link', text: 'Rediger', onclick: () => h.onEditEvent(ev) }),
          deleteButton('Slet', () => h.onDeleteEvent(ev.id))))));
}

export function renderAgenda(container, state, h) {
  const today = dates.startOfDay().toISOString();
  const shown = state.day
    ? state.events.filter((e) => dates.dateKey(new Date(e.startsAt)) === state.day)
    : state.events.filter((e) => e.startsAt >= today);

  const head = state.day && el('p', { class: 'filter' },
    `Viser ${dates.formatDay(`${state.day}T12:00`)}. `,
    el('button', { type: 'button', class: 'link', text: 'Vis alle kommende', onclick: () => h.onPickDay(null) }));
  const empty = !shown.length && el('p', { class: 'empty card', text: state.day ? 'Ingen aftaler den dag.' : 'Ingen kommende aftaler. Tid til at finde på noget hyggeligt?' });

  container.replaceChildren(...[head, empty, ...shown.map((e) => eventCard(e, state, h))].filter(Boolean));
}

export function renderMonth(container, state, h) {
  const cursor = state.cursor;
  const todayKey = dates.dateKey(new Date());
  const byDay = new Map();
  for (const e of state.events) {
    const key = dates.dateKey(new Date(e.startsAt));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }

  const cells = dates.monthGrid(cursor.getFullYear(), cursor.getMonth()).map((d) => {
    const key = dates.dateKey(d);
    const evs = byDay.get(key) ?? [];
    const cls = ['day',
      d.getMonth() !== cursor.getMonth() && 'other',
      key === todayKey && 'today',
      key === state.day && 'selected'].filter(Boolean).join(' ');
    return el('button', {
      type: 'button',
      class: cls,
      'aria-label': `${dates.formatDay(`${key}T12:00`)}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'aftale' : 'aftaler'}` : ''}`,
      'aria-pressed': String(key === state.day),
      onclick: () => h.onPickDay(key === state.day ? null : key),
    },
    el('span', { text: String(d.getDate()) }),
    evs.length > 0 && el('span', { class: 'dots', 'aria-hidden': 'true' },
      evs.slice(0, 3).map((e) => el('i', { class: `dot ${personTone(state, e.who)}` }))));
  });

  container.replaceChildren(
    el('div', { class: 'month-head' },
      el('button', { type: 'button', class: 'nav', 'aria-label': 'Forrige måned', text: '‹', onclick: () => h.onMonth(-1) }),
      el('h3', { text: dates.formatMonth(cursor) }),
      el('button', { type: 'button', class: 'nav', 'aria-label': 'Næste måned', text: '›', onclick: () => h.onMonth(1) })),
    el('div', { class: 'grid' },
      WEEKDAYS.map((w) => el('span', { class: 'wk', text: w, 'aria-hidden': 'true' })),
      cells),
    el('p', { class: 'legend' },
      state.profiles.map((p) => el('span', {}, el('i', { class: `dot ${personTone(state, p.id)}` }), p.name)),
      el('span', {}, el('i', { class: 'dot both' }), 'Begge')));
}
