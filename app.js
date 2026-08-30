(function () {
  'use strict';

  const money = (n) => {
    const neg = n < 0;
    const v = Math.abs(n).toFixed(2);
    const [intPart, dec] = v.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + '৳' + withCommas + '.' + dec;
  };
  const fmtDateLong = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  const monthName = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  const daysInMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  };

  const SLAB_COLORS = ['var(--slab-1)', 'var(--slab-2)', 'var(--slab-3)', 'var(--slab-4)', 'var(--slab-5)', 'var(--slab-6)'];
  function slabIndexForRate(rate) {
    const idx = TARIFF.slabs.findIndex(s => s.rate === rate);
    return idx < 0 ? 0 : idx;
  }

  let currentCase = null;
  let currentLedger = null;

  function monthlyTotals(caseData) {
    const totals = {};
    for (const d of caseData.days) {
      const ym = d.date.slice(0, 7);
      totals[ym] = (totals[ym] || 0) + d.units;
    }
    return totals;
  }

  function findLightHeavyRechargeMonths(caseData) {
    const totals = monthlyTotals(caseData);
    const months = Object.keys(totals).sort();
    let light = months[0], heavy = months[0];
    for (const m of months) {
      if (totals[m] < totals[light]) light = m;
      if (totals[m] > totals[heavy]) heavy = m;
    }
    // largest recharge that lands in the last 7 calendar days of its month
    let best = null;
    for (const r of caseData.recharges) {
      const ym = r.date.slice(0, 7);
      const dom = Number(r.date.slice(-2));
      const dim = daysInMonth(ym);
      if (dom > dim - 7) {
        const amt = Number(r.amount_bdt);
        if (!best || amt > best.amt) best = { ym, amt, date: r.date };
      }
    }
    return { light, lightUnits: totals[light], heavy, heavyUnits: totals[heavy], bigLastWeek: best };
  }

  function populateCaseSelect() {
    const sel = document.getElementById('case-select');
    sel.innerHTML = '';
    for (const c of window.P10_DATA.cases) {
      const opt = document.createElement('option');
      opt.value = c.case_id;
      opt.textContent = c.case_id;
      sel.appendChild(opt);
    }
    sel.value = 'PUB-01';
    sel.addEventListener('change', () => render(sel.value));
  }

  // ---------------- Chart rendering (canvas) ----------------

  function drawChart(canvas, series, opts) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 900;
    const cssH = opts.height || 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 64, padR = 16, padT = 14, padB = 26;
    const w = cssW - padL - padR, h = cssH - padT - padB;

    const allY = series.flatMap(s => s.points.map(p => p.y));
    let yMin = Math.min(0, ...allY), yMax = Math.max(...allY);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad; yMax += yPad;

    const n = series[0].points.length;
    const xAt = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * w);
    const yAt = (v) => padT + h - ((v - yMin) / (yMax - yMin)) * h;

    // gridlines + y labels
    ctx.strokeStyle = '#e6dfc9';
    ctx.fillStyle = '#7a7361';
    ctx.font = '11px "Space Mono", monospace';
    ctx.textAlign = 'right';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = yMin + (i / steps) * (yMax - yMin);
      const y = yAt(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
      ctx.fillText(Math.round(v).toLocaleString(), padL - 8, y + 3);
    }
    // zero line emphasized
    if (yMin < 0 && yMax > 0) {
      ctx.strokeStyle = '#a63a2e';
      ctx.beginPath(); ctx.moveTo(padL, yAt(0)); ctx.lineTo(padL + w, yAt(0)); ctx.stroke();
    }

    // month tick labels along x using opts.dateAt
    if (opts.dateAt) {
      ctx.fillStyle = '#7a7361';
      ctx.textAlign = 'center';
      let lastYm = null;
      for (let i = 0; i < n; i++) {
        const ym = opts.dateAt(i).slice(0, 7);
        if (ym !== lastYm) {
          lastYm = ym;
          const x = xAt(i);
          ctx.fillText(opts.dateAt(i).slice(5, 7) + '/' + opts.dateAt(i).slice(2, 4), x, padT + h + 16);
          ctx.strokeStyle = '#e6dfc9';
          ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + h); ctx.stroke();
        }
      }
    }

    // series lines
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = xAt(i), y = yAt(p.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // markers (recharges)
    if (opts.markers) {
      for (const m of opts.markers) {
        const x = xAt(m.i), y = yAt(m.y);
        ctx.fillStyle = '#d98a3d';
        ctx.beginPath();
        ctx.arc(x, y, Math.min(7, 3 + Math.sqrt(m.amount) / 6), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#14201a';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function renderHero(caseData, ledger) {
    const rowToday = ledger.find(r => r.date === caseData.today);
    document.getElementById('readout-balance').innerHTML =
      money(rowToday.balanceAfter) + '<small>BDT</small>';
    document.getElementById('readout-sub').innerHTML =
      `On <b>${fmtDateLong(caseData.today)}</b> · ${rowToday.units} units used that day · month-to-date ${rowToday.monthCumAfter} units`;
    document.getElementById('stat-opening').textContent = money(Number(caseData.opening_balance_bdt));
    document.getElementById('stat-usual').textContent = `${caseData.usual_daily_units} units/day`;
    document.getElementById('stat-target').textContent = fmtDateLong(caseData.target_date);
    document.getElementById('case-id-badge').textContent = caseData.case_id;
  }

  function renderCallouts(caseData) {
    const info = findLightHeavyRechargeMonths(caseData);
    document.getElementById('callout-light').innerHTML = `
      <div class="tag">Light month</div>
      <div class="headline">${monthName(info.light)}</div>
      <div class="detail">${info.lightUnits} units for the month — the quietest stretch in this record.</div>`;
    document.getElementById('callout-heavy').innerHTML = `
      <div class="tag">Heavy summer month</div>
      <div class="headline">${monthName(info.heavy)}</div>
      <div class="detail">${info.heavyUnits} units for the month — cooling load pushes this household into the top slabs.</div>`;
    if (info.bigLastWeek) {
      document.getElementById('callout-recharge').innerHTML = `
        <div class="tag">Big last-week top-up</div>
        <div class="headline">${money(info.bigLastWeek.amt)}</div>
        <div class="detail">Recharged ${fmtDateLong(info.bigLastWeek.date)}, in the closing week of ${monthName(info.bigLastWeek.ym)}.</div>`;
    } else {
      document.getElementById('callout-recharge').innerHTML = `
        <div class="tag">Big last-week top-up</div>
        <div class="headline">—</div>
        <div class="detail">No recharge in this record landed in a month's final week.</div>`;
    }
  }

  function renderBalanceChart(ledger) {
    const canvas = document.getElementById('balance-chart');
    const points = ledger.map(r => ({ y: r.balanceAfter }));
    const markers = [];
    ledger.forEach((r, i) => { if (r.recharge > 0) markers.push({ i, y: r.balanceAfter, amount: r.recharge }); });
    drawChart(canvas, [{ points, color: '#3f7a53', width: 2 }], {
      height: 280,
      dateAt: (i) => ledger[i].date,
      markers,
    });
  }

  function renderLedgerTable(ledger) {
    const tbody = document.getElementById('ledger-body');
    const rows = [];
    for (const r of ledger) {
      const slabIdx = slabIndexForRate(r.rate);
      rows.push(`<tr class="${r.recharge > 0 ? 'recharge-row' : ''}">
        <td>${r.date}</td>
        <td>${r.units}</td>
        <td>${r.monthCumAfter}</td>
        <td><span class="slab-chip" style="background:${SLAB_COLORS[slabIdx]}"></span>${r.rate.toFixed(2)}</td>
        <td>${money(r.energy)}</td>
        <td>${money(r.vat)}</td>
        <td>${r.fixed > 0 ? money(r.fixed) : '—'}</td>
        <td>${r.recharge > 0 ? money(r.recharge) : '—'}</td>
        <td>${money(r.balanceAfter)}</td>
      </tr>`);
    }
    tbody.innerHTML = rows.join('');
  }

  function renderRunOut(caseData, ledger) {
    const rd = projectRunOutDate(caseData, ledger);
    const el = document.getElementById('runout-answer');
    const rowToday = ledger.find(r => r.date === caseData.today);
    el.className = 'big-answer';
    el.textContent = fmtDateLong(rd.runOutDate);
    document.getElementById('runout-note').innerHTML =
      `Starting from ${money(rowToday.balanceAfter)} on ${fmtDateLong(caseData.today)}, at the usual ${caseData.usual_daily_units} units a day
       and this tariff's slabs resetting every 1st, the balance is projected to reach
       ${money(rd.finalBalance)} on this date. No further recharges assumed.`;
  }

  function renderRequiredRecharge(caseData, ledger, targetDate) {
    const res = requiredRecharge(caseData, ledger, targetDate);
    const el = document.getElementById('recharge-answer');
    el.textContent = money(res.required);
    document.getElementById('recharge-note').textContent = res.required === 0
      ? `The current balance of ${money(res.currentBalance)} already covers consumption through ${fmtDateLong(targetDate)} — no top-up needed.`
      : `To keep the meter running from ${fmtDateLong(caseData.today)} through ${fmtDateLong(targetDate)}, on top of the ${money(res.currentBalance)} already on the meter.`;

    const rows = [
      ['Energy at base rate (4.63/unit)', res.componentBase, 'var(--slab-1)'],
      ['Extra for landing in higher slabs', res.componentUplift, 'var(--slab-5)'],
      ['Demand charge + meter rent', res.componentFixed, 'var(--amber)'],
      ['VAT (5% of energy)', res.componentVat, 'var(--ink-soft)'],
    ];
    document.getElementById('recharge-breakdown').innerHTML = rows.map(([label, val, color]) => `
      <div class="row"><span class="label"><span class="swatch" style="background:${color}"></span>${label}</span><span>${money(val)}</span></div>
    `).join('') + `<div class="row total"><span class="label">Recharge today</span><span>${money(res.required)}</span></div>`;

    if (!res.alreadyRechargedThisMonth) {
      document.getElementById('recharge-fixed-note').textContent =
        `This would be the first recharge of ${monthName(caseData.today.slice(0,7))}, so the ${money(TARIFF.demand + TARIFF.rent)} demand charge + meter rent is included.`;
    } else {
      document.getElementById('recharge-fixed-note').textContent =
        `${monthName(caseData.today.slice(0,7))} already had its first-recharge fixed charge taken, so none is due again this month.`;
    }
  }

  function renderComparison(caseData) {
    const res = compareHabits(caseData);
    const monthsLabel = res.months.map(monthName).join(', ');
    document.getElementById('compare-months').textContent = monthsLabel;

    function fillHabit(id, r, title) {
      const events = res.months.map(m => `${monthName(m).split(' ')[0]}: ${r.monthRechargeEvents[m] || 0}×`).join(' · ');
      document.getElementById(id).innerHTML = `
        <h3>${title}</h3>
        <div class="habit-desc">Fixed-charge months triggered — ${events}</div>
        <div class="cost">${money(r.totalCost)}</div>
        <div class="habit-desc" style="margin:2px 0 14px">total cost to the meter over the 3 months</div>
        <div class="line"><span>Energy</span><span>${money(r.totalEnergy)}</span></div>
        <div class="line"><span>VAT</span><span>${money(r.totalVat)}</span></div>
        <div class="line"><span>Demand + meter rent</span><span>${money(r.totalFixed)}</span></div>
        <div class="line"><span>Recharged in (deposits, not cost)</span><span>${money(r.totalRecharged)}</span></div>
        <div class="line"><span>Balance at end of period</span><span>${money(r.finalBalance)}</span></div>`;
    }
    fillHabit('habit-low', res.low, 'Low-balance top-ups');
    fillHabit('habit-monthly', res.monthly, 'Recharge on the 1st');

    const verdict = document.getElementById('compare-verdict');
    if (Math.abs(res.diff) < 0.005) {
      verdict.innerHTML = `Both habits cost the meter <b>${money(res.low.totalCost)}</b> over ${monthsLabel} — a genuine tie. Both crossed the low-balance threshold (or recharged) at least once in every one of the three months, so each racked up the same three demand-charge + meter-rent events. Energy and VAT are identical either way, since both habits run the exact same daily consumption through the exact same calendar-month slab counter.`;
    } else {
      const cheaper = res.diff > 0 ? 'Low-balance top-ups' : 'Recharging on the 1st';
      const pricier = res.diff > 0 ? 'Recharging on the 1st' : 'Low-balance top-ups';
      verdict.innerHTML = `<b>${cheaper}</b> costs less over ${monthsLabel}, by <b>${money(Math.abs(res.diff))}</b>. Energy and VAT are identical between the two — the entire gap is ${pricier} triggering the demand-charge + meter-rent event in a month the other habit didn't need a recharge in at all.`;
    }
  }

  function render(caseId) {
    const caseData = window.P10_DATA.cases.find(c => c.case_id === caseId);
    currentCase = caseData;
    const ledger = buildLedger(caseData);
    currentLedger = ledger;

    renderHero(caseData, ledger);
    renderCallouts(caseData);
    renderBalanceChart(ledger);
    renderLedgerTable(ledger);
    renderRunOut(caseData, ledger);

    const dateInput = document.getElementById('target-date-input');
    dateInput.value = caseData.target_date;
    dateInput.min = caseData.today;
    renderRequiredRecharge(caseData, ledger, caseData.target_date);

    renderComparison(caseData);
  }

  document.getElementById('recalc-btn').addEventListener('click', () => {
    const v = document.getElementById('target-date-input').value;
    if (v && currentCase && currentLedger) renderRequiredRecharge(currentCase, currentLedger, v);
  });

  window.addEventListener('resize', () => {
    if (currentLedger) renderBalanceChart(currentLedger);
  });

  populateCaseSelect();
  render('PUB-01');
})();
