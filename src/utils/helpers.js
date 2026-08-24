import { displayMoney } from './finance';

export function uid(prefix='id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
export function isoToday() { return new Date().toISOString().slice(0,10); }
export function monthKey(date) { return String(date || '').slice(0,7); }
export function parseAmount(v) { const n=Number(String(v).replace(',','.').replace(/\s/g,'')); return Number.isFinite(n) ? Math.abs(n) : 0; }
export function money(v) { return displayMoney(v,'RSD'); }
export function percent(v) { return `${Math.max(0,Math.min(999,Math.round(v||0)))}%`; }
export function dateLabel(v) { if(!v) return ''; const [y,m,d]=v.split('-'); return `${d}.${m}.${y}.`; }
