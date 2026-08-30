import json
import csv
from tariff_engine import (
    rebuild_ledger, project_runout_date, recharge_needed, simulate_habit, ym_of
)

with open("household_PUB-01.json") as f:
    case = json.load(f)

print("=" * 70)
print("ITEM 1 - Household:", case["case_id"])
print("=" * 70)
print(f"Reading span   : {case['days'][0]['date']} to {case['days'][-1]['date']} "
      f"({len(case['days'])} days, {len(case['days'])/30.4:.1f} months)")
print(f"Recharges      : {len(case['recharges'])} events")
print(f"Opening balance: {case['opening_balance_bdt']} taka")
print("Light month check   (Jan units):", [x['units'] for x in case['days'] if x['date'].startswith('2026-01')][:10], "...")
print("Heavy summer check  (May units):", [x['units'] for x in case['days'] if x['date'].startswith('2026-05')][:10], "...")
print("Last-week big recharge (June)  :", [r for r in case['recharges'] if r['date'].startswith('2026-06')])

# ---- ITEM 2: rebuild the ledger --------------------------------------
ledger = rebuild_ledger(case["opening_balance_bdt"], case["days"], case["recharges"])

with open("/mnt/user-data/outputs/PUB-01_balance_ledger.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(ledger[0].keys()))
    w.writeheader()
    w.writerows(ledger)

print("\n" + "=" * 70)
print("ITEM 2 - Day-by-day ledger rebuilt:", len(ledger), "rows -> PUB-01_balance_ledger.csv")
print("=" * 70)
print("First 3 rows:")
for row in ledger[:3]:
    print(" ", row)
print("Last 5 rows:")
for row in ledger[-5:]:
    print(" ", row)

final_balance = ledger[-1]["balance"]
final_month_cum = ledger[-1]["month_cum_units"]
print(f"\nBalance on 'today' ({case['today']}): {final_balance:.2f} taka")

# ---- ITEM 3a: run-out date -------------------------------------------
runout_date, runout_balance = project_runout_date(
    case["today"], final_balance, final_month_cum, case["usual_daily_units"]
)
print("\n" + "=" * 70)
print("ITEM 3a - When does the balance run out?")
print("=" * 70)
print(f"Today: {case['today']}, balance: {final_balance:.2f}, usual daily use: {case['usual_daily_units']} units")
print(f"=> Balance is projected to run out on: {runout_date}  (balance {runout_balance:.2f})")

# ---- ITEM 3b: recharge needed to reach target_date --------------------
already_recharged_this_month = any(
    r["date"].startswith(ym_of(case["today"])) and r["date"] <= case["today"]
    for r in case["recharges"]
)
breakdown = recharge_needed(
    case["today"], final_balance, final_month_cum,
    case["usual_daily_units"], case["target_date"], already_recharged_this_month
)
print("\n" + "=" * 70)
print(f"ITEM 3b - Recharge needed today to last until {case['target_date']}")
print("=" * 70)
for k, v in breakdown.items():
    print(f"  {k}: {v}")

# ---- ITEM 4: compare recharge habits over comparison.months -----------
comp = case["comparison"]
comp_days = [day for day in case["days"] if ym_of(day["date"]) in comp["months"]]
# comparison months in this sample overlap with historical days already present
if not comp_days:
    raise SystemExit("comparison months not found in days - check data range")

low_result = simulate_habit(
    comp["opening_balance_bdt"], comp_days, "low_balance",
    comp["low_amount_bdt"], threshold=comp["low_threshold_bdt"]
)
monthly_result = simulate_habit(
    comp["opening_balance_bdt"], comp_days, "monthly",
    comp["monthly_amount_bdt"]
)

print("\n" + "=" * 70)
print(f"ITEM 4 - Habit comparison over {comp['months']}")
print("=" * 70)
print("Low-balance habit :", low_result)
print("Monthly habit     :", monthly_result)
diff = monthly_result["total_cost"] - low_result["total_cost"]
cheaper = "low-balance" if diff > 0 else ("monthly" if diff < 0 else "neither (tie)")
print(f"\nEnergy+VAT identical for both? "
      f"{abs(low_result['total_energy']+low_result['total_vat'] - (monthly_result['total_energy']+monthly_result['total_vat'])) < 0.01}")
print(f"Cost difference: {abs(diff):.2f} taka  -> cheaper habit: {cheaper}")

with open("/mnt/user-data/outputs/PUB-01_full_results.json", "w") as f:
    json.dump({
        "household": case["case_id"],
        "runout_date": runout_date,
        "runout_balance": runout_balance,
        "recharge_needed_breakdown": breakdown,
        "habit_comparison": {"low_balance": low_result, "monthly": monthly_result,
                              "cost_difference_bdt": round(diff, 2), "cheaper_habit": cheaper},
    }, f, indent=2)

print("\nSaved: PUB-01_full_results.json")
