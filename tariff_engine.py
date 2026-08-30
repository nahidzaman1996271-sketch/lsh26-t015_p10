"""
tariff_engine.py
Prepaid Meter Recharge Advisor - core billing engine.

TARIFF (fixed, do not change without updating problem spec):
  Units  1-75   : 4.63 taka/unit
  Units 76-200  : 5.26 taka/unit
  Units 201-300 : 5.63 taka/unit
  Units 301-400 : 5.83 taka/unit
  Units 401-600 : 9.30 taka/unit
  Units 601+    : 10.70 taka/unit
  Demand charge : 42.00 taka  (once per month, on the first recharge of that month)
  Meter rent    : 40.00 taka  (once per month, on the first recharge of that month)
  VAT           : 5% of the energy amount only

Slab rule: the calendar-month running total of units resets to 0 on the 1st of
every month. A recharge does NOT reset it. Each day's units are charged in
full at the single slab rate that the month's running total has reached
*after* adding that day's units (no splitting a day across two slabs).
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

# ---- Tariff constants -------------------------------------------------

SLABS = [
    (75,          Decimal("4.63")),
    (200,         Decimal("5.26")),
    (300,         Decimal("5.63")),
    (400,         Decimal("5.83")),
    (600,         Decimal("9.30")),
    (None,        Decimal("10.70")),  # 601 and above
]
BASE_RATE = SLABS[0][1]          # rate of the lowest slab, used as the "energy" baseline
DEMAND_CHARGE = Decimal("42.00")
METER_RENT = Decimal("40.00")
FIXED_CHARGES = DEMAND_CHARGE + METER_RENT
VAT_RATE = Decimal("0.05")

TWO_PLACES = Decimal("0.01")


def d(x) -> Decimal:
    return Decimal(str(x))


def r2(x: Decimal) -> Decimal:
    return x.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def slab_rate_for(cumulative_after: Decimal) -> Decimal:
    """Rate applying to a day whose *ending* month-to-date cumulative is cumulative_after."""
    for cap, rate in SLABS:
        if cap is None or cumulative_after <= cap:
            return rate
    return SLABS[-1][1]


def ym_of(iso_date: str) -> str:
    dt = date.fromisoformat(iso_date)
    return f"{dt.year:04d}-{dt.month:02d}"


# ---- Item 2: day-by-day balance rebuild --------------------------------

def rebuild_ledger(opening_balance, days, recharges):
    """
    days: [{"date": "YYYY-MM-DD", "units": int}, ...] consecutive, sorted, starts on a 1st.
    recharges: [{"date": "YYYY-MM-DD", "amount_bdt": "123.00"}, ...]
    Returns a list of ledger rows (one per day) with every value needed to
    audit the bill, and the running end-of-day balance.
    """
    recharge_map = {}
    for rc in recharges:
        recharge_map.setdefault(rc["date"], Decimal("0"))
        recharge_map[rc["date"]] += d(rc["amount_bdt"])

    balance = d(opening_balance)
    ledger = []
    month_cum = Decimal("0")
    current_ym = None
    month_had_recharge = set()

    for day in days:
        ym = ym_of(day["date"])
        if ym != current_ym:
            current_ym = ym
            month_cum = Decimal("0")

        units = d(day["units"])
        month_cum += units
        rate = slab_rate_for(month_cum)
        energy_cost = r2(units * rate)
        vat = r2(energy_cost * VAT_RATE)
        day_charge = energy_cost + vat
        balance -= day_charge

        recharge_amt = Decimal("0")
        fixed_charge = Decimal("0")
        if day["date"] in recharge_map:
            recharge_amt = recharge_map[day["date"]]
            balance += recharge_amt
            if ym not in month_had_recharge:
                fixed_charge = FIXED_CHARGES
                balance -= fixed_charge
                month_had_recharge.add(ym)

        ledger.append({
            "date": day["date"],
            "units": int(units),
            "month_cum_units": int(month_cum),
            "slab_rate": float(rate),
            "energy_cost": float(energy_cost),
            "vat": float(vat),
            "recharge_amount": float(recharge_amt),
            "fixed_charge": float(fixed_charge),
            "balance": float(balance),
            "is_recharge_day": recharge_amt > 0,
        })
    return ledger


# ---- Item 3a: when does the balance run out? ---------------------------

def project_runout_date(start_date_iso, start_balance, month_cum_at_start, usual_daily_units):
    """
    Projects forward from the day AFTER start_date_iso using usual_daily_units
    every day, no further recharges, continuing the slab counter (resetting on
    the 1st of each new month). Returns (runout_date_iso, balance_on_that_day).
    """
    balance = d(start_balance)
    month_cum = d(month_cum_at_start)
    dt = date.fromisoformat(start_date_iso)
    current_ym = f"{dt.year:04d}-{dt.month:02d}"
    units = d(usual_daily_units)

    while True:
        dt = dt + timedelta(days=1)
        ym = f"{dt.year:04d}-{dt.month:02d}"
        if ym != current_ym:
            current_ym = ym
            month_cum = Decimal("0")
        month_cum += units
        rate = slab_rate_for(month_cum)
        energy_cost = r2(units * rate)
        vat = r2(energy_cost * VAT_RATE)
        balance -= (energy_cost + vat)
        if balance <= 0:
            return dt.isoformat(), float(balance)
        # safety valve
        if (dt - date.fromisoformat(start_date_iso)).days > 3660:
            return None, float(balance)


# ---- Item 3b: how much to recharge today to last until target_date -----

def recharge_needed(start_date_iso, current_balance, month_cum_at_start,
                     usual_daily_units, target_date_iso, month_already_recharged):
    """
    Computes the money that must be recharged TODAY (start_date_iso) so the
    balance covers consumption from tomorrow through target_date_iso inclusive,
    at usual_daily_units/day, continuing the slab counter with normal monthly
    resets. Only "today"'s recharge is assumed - no other recharges happen in
    between, so demand charge + meter rent apply only once (today), and only
    if this calendar month hasn't already had its first recharge.

    Returns a breakdown dict.
    """
    units = d(usual_daily_units)
    month_cum = d(month_cum_at_start)
    dt = date.fromisoformat(start_date_iso)
    target = date.fromisoformat(target_date_iso)
    current_ym = f"{dt.year:04d}-{dt.month:02d}"

    total_actual_energy = Decimal("0")
    total_baseline_energy = Decimal("0")
    total_vat = Decimal("0")
    total_units = Decimal("0")

    cursor = dt
    while cursor < target:
        cursor = cursor + timedelta(days=1)
        ym = f"{cursor.year:04d}-{cursor.month:02d}"
        if ym != current_ym:
            current_ym = ym
            month_cum = Decimal("0")
        month_cum += units
        rate = slab_rate_for(month_cum)
        energy_cost = r2(units * rate)
        vat = r2(energy_cost * VAT_RATE)

        total_actual_energy += energy_cost
        total_baseline_energy += r2(units * BASE_RATE)
        total_vat += vat
        total_units += units

    slab_uplift = r2(total_actual_energy - total_baseline_energy)
    total_baseline_energy = r2(total_baseline_energy)
    total_actual_energy = r2(total_actual_energy)
    total_vat = r2(total_vat)

    fixed_charge = Decimal("0") if month_already_recharged else FIXED_CHARGES

    total_cost = total_baseline_energy + slab_uplift + fixed_charge + total_vat
    net_recharge = max(Decimal("0"), r2(total_cost - d(current_balance)))

    return {
        "days_covered": (target - dt).days,
        "total_units": int(total_units),
        "baseline_energy": float(total_baseline_energy),
        "higher_slab_amount": float(slab_uplift),
        "fixed_charges": float(fixed_charge),
        "vat": float(total_vat),
        "total_cost_of_period": float(total_cost),
        "current_balance_applied": float(min(d(current_balance), total_cost)),
        "recharge_needed_today": float(net_recharge),
    }


# ---- Item 4: compare "low balance" vs "monthly" recharge habits --------

def simulate_habit(opening_balance, days, habit, amount, threshold=None):
    """
    days: the concatenated daily readings for exactly the comparison months,
    in date order (each month's own list starts on that month's 1st).
    habit: "low_balance" or "monthly"
    Returns totals: energy, vat, fixed charges, fixed-charge event count,
    total cost (= what the meter consumed), and ending balance.
    """
    balance = d(opening_balance)
    total_energy = Decimal("0")
    total_vat = Decimal("0")
    total_fixed = Decimal("0")
    fixed_events = 0
    month_cum = Decimal("0")
    current_ym = None
    month_recharged = set()

    for day in days:
        ym = ym_of(day["date"])
        if ym != current_ym:
            current_ym = ym
            month_cum = Decimal("0")
        dt = date.fromisoformat(day["date"])

        # --- possible recharge at the START of this day, before consumption ---
        did_recharge = False
        if habit == "monthly" and dt.day == 1:
            balance += d(amount)
            did_recharge = True
        elif habit == "low_balance" and balance < d(threshold):
            balance += d(amount)
            did_recharge = True

        if did_recharge and ym not in month_recharged:
            balance -= FIXED_CHARGES
            total_fixed += FIXED_CHARGES
            fixed_events += 1
            month_recharged.add(ym)

        # --- today's consumption ---
        units = d(day["units"])
        month_cum += units
        rate = slab_rate_for(month_cum)
        energy_cost = r2(units * rate)
        vat = r2(energy_cost * VAT_RATE)
        balance -= (energy_cost + vat)

        total_energy += energy_cost
        total_vat += vat

    total_cost = r2(total_energy + total_vat + total_fixed)
    return {
        "habit": habit,
        "total_energy": float(r2(total_energy)),
        "total_vat": float(r2(total_vat)),
        "total_fixed": float(total_fixed),
        "fixed_events": fixed_events,
        "total_cost": float(total_cost),
        "ending_balance": float(r2(balance)),
    }
