/* Booking time rules for the booking pages. The block between the two markers is a byte-for-byte
   copy of the API's src/slots.js (the server enforces it; this only mirrors it so the picker can grey
   out what would be refused). tests/slots.mjs in the API repo fails if the copies differ. */
window.BookingSlots = (() => {
// --- shared core start ---
const OPEN = '07:00';   // earliest start (no operating hours existed before; Mike's default)
const CLOSE = '20:00';  // latest end
const STEP = 30;        // minutes
const GAP = 30;         // minutes required between bookings

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const isHHMM = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const durationLabel = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
};

// Why a window [s, e) (minutes) is not a valid shape, or null. `unit` = the service's minimum
// block in minutes (30 or 60): the existing prices are per block, so a 60-minute service is
// booked in whole hours.
function windowError(s, e, unit = STEP) {
  if (!Number.isInteger(s) || !Number.isInteger(e)) return 'Choose a start and end time.';
  if (s % STEP || e % STEP) return 'Times are in 30-minute steps.';
  if (s < toMin(OPEN) || e > toMin(CLOSE)) return `Bookings run between ${OPEN} and ${CLOSE}.`;
  if (e <= s) return 'The end time must be after the start time.';
  if ((e - s) % unit) return 'This service is booked in whole hours.';
  return null;
}

// How [s, e) sits against the day's other blocking bookings ({start, end} in minutes):
// 'overlap', 'gap' (closer than GAP minutes), or null. The rule, for every other booking:
//   e + GAP <= bs  OR  s >= be + GAP
function conflictWith(s, e, others) {
  let gap = false;
  for (const o of others) {
    if (s < o.end && o.start < e) return 'overlap';
    if (!(e + GAP <= o.start || s >= o.end + GAP)) gap = true;
  }
  return gap ? 'gap' : null;
}

const REASONS = { closed: 'Day unavailable', past: 'In the past', overlap: 'Already booked', gap: 'Too close to another booking', unit: 'This service is booked in whole hours' };

// Every start on the grid with whether it can begin a booking at all (even the shortest one).
// ctx = { others: [{start,end}], closed: bool, nowMin: minutes-past-midnight today or null, unit }.
// A 'gap' reason is still returned to the admin picker, which lets her pick it behind an explicit override.
function startOptions(ctx) {
  const out = [], unit = ctx.unit || STEP;
  for (let s = toMin(OPEN); s + unit <= toMin(CLOSE); s += STEP) {
    let reason = null;
    if (ctx.closed) reason = 'closed';
    else if (ctx.nowMin != null && s < ctx.nowMin) reason = 'past';
    else {
      reason = conflictWith(s, s + unit, ctx.others);
    }
    out.push({ min: s, label: toHHMM(s), reason });
  }
  return out;
}

// Every end for a chosen start, with whether [start, end) is allowed.
function endOptions(start, ctx) {
  const out = [], unit = ctx.unit || STEP;
  for (let e = start + STEP; e <= toMin(CLOSE); e += STEP) {
    let reason = null;
    if (ctx.closed) reason = 'closed';
    else if ((e - start) % unit) reason = 'unit';
    else {
      reason = conflictWith(start, e, ctx.others);
    }
    out.push({ min: e, label: toHHMM(e), reason });
  }
  return out;
}
// --- shared core end ---

  return { OPEN, CLOSE, STEP, GAP, REASONS, toMin, toHHMM, isHHMM, durationLabel, windowError, conflictWith, startOptions, endOptions };
})();
