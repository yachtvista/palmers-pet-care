/* Booking time rules for the booking pages. The block between the two markers is a byte-for-byte
   copy of the API's src/slots.js (the server enforces it; this only mirrors it so the booker can grey
   out what would be refused). tests/slots.mjs in the API repo fails if the copies differ. */
window.BookingSlots = (() => {
// --- shared core start ---
const OPEN = '07:00';   // earliest daytime start
const CLOSE = '20:00';  // latest daytime end (an overnight's extension may run to CLOSE the next day)
const STEP = 30;        // minutes
const GAP = 30;         // travel time between DIFFERENT households; none within one household
const OVERNIGHT_START = '20:00';
const OVERNIGHT_MIN = 12 * 60; // 20:00 → 08:00 wall clock
const DAY = 24 * 60;

// How long each product lasts. Prices live in the API's service list, not here.
const PRODUCT_MIN = { walk30: 30, walk60: 60, visit30: 30, visit60: 60, sitting: OVERNIGHT_MIN };
const KIND = { walk30: 'walk', walk60: 'walk', visit30: 'visit', visit60: 'visit', sitting: 'overnight' };
const MAX_PRODUCTS = 30;

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const isHHMM = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const isDate = (s) => typeof s === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
// Times are London wall-clock minutes counted from 2000-01-01, so a booking may cross midnight.
const dayNum = (date) => Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000) - 10957;
const absAt = (date, hhmm) => dayNum(date) * DAY + toMin(hhmm);
const dateOf = (abs) => new Date((Math.floor(abs / DAY) + 10957) * 86400000).toISOString().slice(0, 10);
const timeOf = (abs) => toHHMM(((abs % DAY) + DAY) % DAY);
const durationLabel = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
};

// Lays a list of products end to end from (date, start). Returns { startAt, endAt, segments }.
function chain(date, start, products) {
  let at = absAt(date, start);
  const startAt = at, segments = products.map((id) => { const s = { serviceId: id, startAt: at, endAt: at + PRODUCT_MIN[id] }; at = s.endAt; return s; });
  return { startAt, endAt: at, segments };
}

// Why a booking's shape is invalid, or null. An overnight is the first product, starts at 20:00, and
// whatever follows it is the customer's extension (which may run until CLOSE the next day). A daytime
// chain runs between OPEN and CLOSE on its date.
function planError(date, start, products) {
  if (!isDate(date)) return 'Choose a valid date.';
  if (!Array.isArray(products) || !products.length) return 'Add at least one activity.';
  if (products.length > MAX_PRODUCTS) return 'That is too many activities for one booking.';
  if (products.some((id) => !(id in PRODUCT_MIN))) return 'Choose activities from the list.';
  const nights = products.filter((id) => id === 'sitting').length;
  if (nights > 1) return 'One overnight per booking — copy it onto other nights instead.';
  if (nights && products[0] !== 'sitting') return 'An overnight starts the booking; add other activities after it.';
  if (!isHHMM(start) || toMin(start) % STEP) return 'Times are in 30-minute steps.';
  if (nights && start !== OVERNIGHT_START) return `Overnights start at ${OVERNIGHT_START}.`;
  const { startAt, endAt } = chain(date, start, products), day0 = dayNum(date) * DAY;
  if (nights) { if (endAt > day0 + DAY + toMin(CLOSE)) return `An overnight can be extended until ${CLOSE} the next day.`; }
  else if (startAt < day0 + toMin(OPEN) || endAt > day0 + toMin(CLOSE)) return `Daytime bookings run between ${OPEN} and ${CLOSE}.`;
  return null;
}

// How [s, e) sits against other blocking bookings ({ start, end, same }) in absolute minutes:
// 'overlap', 'gap' (another household closer than GAP), or null. For a different household:
//   e + GAP <= bs  OR  s >= be + GAP.   For the same household only overlap matters.
function conflictWith(s, e, others) {
  let gap = false;
  for (const o of others) {
    if (s < o.end && o.start < e) return 'overlap';
    if (!o.same && !(e + GAP <= o.start || s >= o.end + GAP)) gap = true;
  }
  return gap ? 'gap' : null;
}

const REASONS = { closed: 'Day unavailable', past: 'In the past', overlap: 'Already booked', gap: 'Too close to another booking', hours: 'Outside booking hours' };

// Every daytime start on the grid for a chain `length` minutes long, with why it can't be used.
// ctx = { others, closed, nowAt: absolute minutes now (or null) }
function startOptions(date, length, ctx) {
  const out = [], day0 = dayNum(date) * DAY, len = Math.max(length, STEP);
  for (let m = toMin(OPEN); m < toMin(CLOSE); m += STEP) {
    const s = day0 + m, e = s + len;
    let reason = null;
    if (ctx.closed) reason = 'closed';
    else if (ctx.nowAt != null && s < ctx.nowAt) reason = 'past';
    else if (e > day0 + toMin(CLOSE)) reason = 'hours';
    else reason = conflictWith(s, e, ctx.others);
    out.push({ min: m, label: toHHMM(m), reason });
  }
  return out;
}
// --- shared core end ---

  return { OPEN, CLOSE, STEP, GAP, OVERNIGHT_START, OVERNIGHT_MIN, DAY, PRODUCT_MIN, KIND, MAX_PRODUCTS, REASONS, toMin, toHHMM, isHHMM, isDate, dayNum, absAt, dateOf, timeOf, durationLabel, chain, planError, conflictWith, startOptions };
})();
