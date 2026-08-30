/* ============================================================
   Prepaid Meter Recharge Advisor — calculation engine
   Tariff (and ONLY this tariff):
     1–75 units      @ 4.63 /unit
     76–200 units    @ 5.26 /unit
     201–300 units   @ 5.63 /unit
     301–400 units   @ 5.83 /unit
     401–600 units   @ 9.30 /unit
     601+ units      @ 10.70 /unit
   Demand charge 42 + Meter rent 40, taken once, on the FIRST
   recharge of each calendar month. VAT = 5% of the energy amount
   only. Slab counter resets on the 1st of each calendar month;
   a recharge never resets it.
   ============================================================ */

const TARIFF = {
  slabs: [
    { lo: 1, hi: 75, rate: 4.63 },
    { lo: 76, hi: 200, rate: 5.26 },
    { lo: 201, hi: 300, rate: 5.63 },
    { lo: 301, hi: 400, rate: 5.83 },
    { lo: 401, hi: 600, rate: 9.30 },
    { lo: 601, hi: Infinity, rate: 10.70 },
  ],
  demand: 42,
  rent: 40,
  vatRate: 0.05,
  baseRate: 4.63, // lowest slab rate, used as the "no higher slab" baseline
};

// Round-half-up to 2dp, done in integer cents to dodge float noise.
function round2(x) {
  const cents = Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100);
  return cents / 100;
}

function slabRateForTotal(total) {
  for (const s of TARIFF.slabs) {
    if (total >= s.lo && total <= s.hi) return s.rate;
  }
  return TARIFF.slabs[TARIFF.slabs.length - 1].rate;
}

function ymOf(dateStr) { return dateStr.slice(0, 7); }

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Rebuild the meter balance day by day for a full case.
 * Each day's units are charged entirely at the slab the month's
 * running total reaches once that day's units are added — no
 * splitting a single day across two slabs, and the counter only
 * ever resets on the 1st of a calendar month.
 */
function buildLedger(caseData) {
  const rechargeByDate = {};
  for (const r of caseData.recharges) {
    rechargeByDate[r.date] = (rechargeByDate[r.date] || 0) + Number(r.amount_bdt);
  }

  let balance = Number(caseData.opening_balance_bdt);
  const monthRunning = {};
  const monthFixedDone = new Set();
  const ledger = [];

  for (const day of caseData.days) {
    const ym = ymOf(day.date);
    const before = monthRunning[ym] || 0;
    const after = before + day.units;
    monthRunning[ym] = after;

    const rate = slabRateForTotal(after);
    const energy = round2(day.units * rate);
    const vat = round2(energy * TARIFF.vatRate);
    const baseEnergy = round2(day.units * TARIFF.baseRate);
    const slabUplift = round2(energy - baseEnergy);

    const rechargeAmt = rechargeByDate[day.date] || 0;
    let fixedToday = 0;
    if (rechargeAmt > 0 && !monthFixedDone.has(ym)) {
      fixedToday = TARIFF.demand + TARIFF.rent;
      monthFixedDone.add(ym);
    }

    const balanceBefore = balance;
    balance = round2(balance + rechargeAmt - fixedToday - energy - vat);

    ledger.push({
      date: day.date, units: day.units, ym,
      monthCumBefore: before, monthCumAfter: after,
      rate, energy, vat, baseEnergy, slabUplift,
      recharge: rechargeAmt, fixed: fixedToday,
      balanceBefore, balanceAfter: balance,
    });
  }
  return ledger;
}

/** Q3a — project forward from "today" at usual daily use, no further
 *  recharges, until the balance first reaches zero or below. */
function projectRunOutDate(caseData, ledger) {
  const today = caseData.today;
  const usual = caseData.usual_daily_units;
  const rowToday = ledger.find(r => r.date === today);
  let balance = rowToday.balanceAfter;
  let curDate = today;
  let curYm = ymOf(today);
  let curCum = rowToday.monthCumAfter;
  const path = [{ date: curDate, balance }];

  let guard = 0;
  while (balance > 0 && guard < 3660) {
    curDate = addDays(curDate, 1);
    const ym = ymOf(curDate);
    if (ym !== curYm) { curYm = ym; curCum = 0; }
    curCum += usual;
    const rate = slabRateForTotal(curCum);
    const energy = round2(usual * rate);
    const vat = round2(energy * TARIFF.vatRate);
    balance = round2(balance - energy - vat);
    path.push({ date: curDate, balance });
    guard++;
    if (balance <= 0) break;
  }
  return { runOutDate: curDate, finalBalance: balance, path };
}

/** Q3b — how much to recharge today so the balance lasts through
 *  targetDate, broken into energy / slab-uplift / fixed / VAT.
 *  Any balance already sitting in the meter today is applied as a
 *  credit spread proportionally across every cost category. */
function requiredRecharge(caseData, ledger, targetDate) {
  const today = caseData.today;
  const usual = caseData.usual_daily_units;
  const rowToday = ledger.find(r => r.date === today);
  const currentBalance = rowToday.balanceAfter;

  const ymToday = ymOf(today);
  const alreadyRechargedThisMonth = caseData.recharges.some(
    r => ymOf(r.date) === ymToday && r.date <= today
  );
  const fixedApplies = alreadyRechargedThisMonth ? 0 : (TARIFF.demand + TARIFF.rent);

  let curDate = today;
  let curYm = ymOf(today);
  let curCum = rowToday.monthCumAfter;

  let baseTotal = 0, upliftTotal = 0, vatTotal = 0, energyTotal = 0;

  while (curDate < targetDate) {
    curDate = addDays(curDate, 1);
    const ym = ymOf(curDate);
    if (ym !== curYm) { curYm = ym; curCum = 0; }
    curCum += usual;
    const rate = slabRateForTotal(curCum);
    const base = round2(usual * TARIFF.baseRate);
    const energy = round2(usual * rate);
    const uplift = round2(energy - base);
    const vat = round2(energy * TARIFF.vatRate);
    baseTotal = round2(baseTotal + base);
    upliftTotal = round2(upliftTotal + uplift);
    energyTotal = round2(energyTotal + energy);
    vatTotal = round2(vatTotal + vat);
  }

  const totalNeed = round2(fixedApplies + energyTotal + vatTotal);
  let required = round2(totalNeed - currentBalance);
  if (required < 0) required = 0;
  const scale = totalNeed > 0 ? required / totalNeed : 0;

  return {
    today, targetDate, currentBalance, alreadyRechargedThisMonth,
    fixedApplies, baseTotal, upliftTotal, energyTotal, vatTotal, totalNeed,
    required,
    componentBase: round2(baseTotal * scale),
    componentUplift: round2(upliftTotal * scale),
    componentFixed: round2(fixedApplies * scale),
    componentVat: round2(vatTotal * scale),
  };
}

/** Q4 — compare "low balance" vs "monthly" recharge habits over the
 *  same three calendar months on identical daily consumption. Only
 *  the count of monthly first-recharge fixed-charge events can move
 *  the two totals apart. */
function compareHabits(caseData) {
  const comp = caseData.comparison;
  const months = comp.months;
  const opening = Number(comp.opening_balance_bdt);
  const lowThreshold = Number(comp.low_threshold_bdt);
  const lowAmount = Number(comp.low_amount_bdt);
  const monthlyAmount = Number(comp.monthly_amount_bdt);

  const allDays = caseData.days.filter(d => months.includes(ymOf(d.date)));

  function simulate(mode) {
    let balance = opening;
    const monthCum = {};
    const monthFixedDone = new Set();
    const monthRechargeEvents = {};
    months.forEach(m => monthRechargeEvents[m] = 0);

    let totalEnergy = 0, totalVat = 0, totalFixed = 0, totalRecharged = 0;
    const path = [];

    for (const day of allDays) {
      const ym = ymOf(day.date);
      const isFirstOfMonth = day.date.slice(-2) === '01';
      let rechargeAmt = 0;

      if (mode === 'monthly') {
        if (isFirstOfMonth) rechargeAmt = monthlyAmount;
      } else if (mode === 'low') {
        if (balance < lowThreshold) rechargeAmt = lowAmount;
      }

      if (rechargeAmt > 0) {
        balance = round2(balance + rechargeAmt);
        totalRecharged = round2(totalRecharged + rechargeAmt);
        monthRechargeEvents[ym] = (monthRechargeEvents[ym] || 0) + 1;
        if (!monthFixedDone.has(ym)) {
          balance = round2(balance - (TARIFF.demand + TARIFF.rent));
          totalFixed = round2(totalFixed + TARIFF.demand + TARIFF.rent);
          monthFixedDone.add(ym);
        }
      }

      const before = monthCum[ym] || 0;
      const after = before + day.units;
      monthCum[ym] = after;
      const rate = slabRateForTotal(after);
      const energy = round2(day.units * rate);
      const vat = round2(energy * TARIFF.vatRate);
      balance = round2(balance - energy - vat);
      totalEnergy = round2(totalEnergy + energy);
      totalVat = round2(totalVat + vat);

      path.push({ date: day.date, balance, recharge: rechargeAmt });
    }

    const totalCost = round2(totalEnergy + totalVat + totalFixed);
    return {
      totalEnergy, totalVat, totalFixed, totalCost, totalRecharged,
      monthRechargeEvents, finalBalance: balance, path,
    };
  }

  const low = simulate('low');
  const monthly = simulate('monthly');
  const diff = round2(monthly.totalCost - low.totalCost);
  return { months, low, monthly, diff };
}

if (typeof module !== 'undefined') {
  module.exports = {
    TARIFF, round2, slabRateForTotal, ymOf, addDays,
    buildLedger, projectRunOutDate, requiredRecharge, compareHabits,
  };
}
