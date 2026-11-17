// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, filters, a per-protocol detail view with the model's own inputs and the
// protocol's farm plan, the live-token comparables and the model page. No network: every byte it shows
// is in data.js. The page recomputes each row's implied value from the snapshot figures and checks it
// against board.json, and regenerates each farm plan from the same derivation main.ts writes, so the
// page's code and the board's data are visibly the same arithmetic. No protocol name is special-cased.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', mintvl: 0, wl: false, sort: 'implied', dir: -1, tab: 'board', selected: null, showAll: false, focus: null };
  var M = DATA.model;
  // Watchlist membership is carried in the data, so the page can badge and filter on it.
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });

  function $(id) { return document.getElementById(id); }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtInt(n) { return n === null || n === undefined ? 'n/a' : Math.round(n).toLocaleString('en-US'); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // The model in one function: multiple (category comparables, else global), growth, maturity, breadth.
  function impliedOf(row) {
    var mult = row.multiple;
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * M.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var breadth = 1 + Math.max(0, Math.min((row.chains || []).length - 1, M.breadth_max_chains)) * M.breadth_step;
    return { implied: Math.max(1, Math.round(row.tvl_usd * mult * growthMult * maturity * breadth)),
      growth: growth, growthMult: growthMult, maturity: maturity, breadth: breadth, age: age };
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasUsd(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 12;
    if (c === 'bitcoin') return 3;
    if (c === 'solana') return 0.05;
    if (c === 'tron') return 1;
    if (c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('mode') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('scroll') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('polygon') >= 0) return 0.5;
    if (c.indexOf('binance') >= 0 || c.indexOf('bnb') >= 0) return 0.3;
    if (c.indexOf('avalanche') >= 0 || c.indexOf('fantom') >= 0 || c.indexOf('sonic') >= 0) return 0.5;
    return 2;
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s basis vault on " + chain + ' and keep the shares.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + " on " + name + "'s chain: send one transaction a week through its own apps.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var name = p.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow $' + small + ' against the deposit on ' + name + ' and repay it a week later.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Swap $' + small + ' through ' + name + ' on ' + chain + ' so the wallet shows trading activity too.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back through ' + name + ' so the wallet shows both directions.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake or delegate the receipt token once more through ' + name + ' if it offers a second pool.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge and open a second small one on ' + name + ' the following week.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Move $' + small + ' into a second ' + name + ' vault with a different risk profile.';
    if (c.indexOf('prediction') >= 0) return 'Place a second, smaller market position on ' + name + ' on a different outcome.';
    return 'Use a second feature of ' + name + ' on ' + chain + ', such as a swap, a vote or a second pool.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p); var capital = capitalFor(p); var hold = holdDaysFor(p.age_days); var gas = gasUsd(chain);
    var g = '$' + gas;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'no capital, about ' + g + ' of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + g + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about ' + g + ' of gas and the same $' + capital + ' of capital', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about ' + g + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in reverse order when you exit.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q') !== null) state.q = params.get('q');
    if (params.get('category') !== null) state.category = params.get('category');
    if (params.get('chain') !== null) state.chain = params.get('chain');
    if (params.get('mintvl') !== null) state.mintvl = parseInt(params.get('mintvl'), 10) || 0;
    if (params.get('wl') !== null) state.wl = params.get('wl') === '1';
    if (params.get('sort') !== null) state.sort = params.get('sort');
    if (params.get('tab') !== null) state.tab = params.get('tab');
    if (params.get('p') !== null) state.selected = params.get('p');
    if (params.get('focus') !== null) state.focus = params.get('focus');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.mintvl) params.set('mintvl', String(state.mintvl));
    if (state.wl) params.set('wl', '1');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    if (state.focus) params.set('focus', state.focus);
    var h = params.toString();
    history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.wl && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.mintvl) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var dir = state.dir;
    var key = state.sort;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d === null ? -Infinity : a.change_7d; vb = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (key === 'multiple') { va = a.multiple; vb = b.multiple; }
      else if (key === 'rank') { va = a.rank; vb = b.rank; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }

  function confPill(c) { return '<span class="pill ' + c + '">' + c + '</span>'; }
  function rowHtml(r) {
    var v = impliedOf(r);
    var match = v.implied === r.implied_value_usd;
    var g = r.change_7d;
    var gHtml = g === null ? 'n/a' : '<span class="' + (g >= 0 ? 'up' : 'down') + '">' + fmtPct(g) + '</span>';
    return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.selected === r.slug ? 'sel' : '') + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><span class="nm">' + esc(r.name) + '</span> <span class="sl">' + esc(r.slug) + '</span>' + (WATCH[r.slug] ? ' <span class="pill wl">watchlist</span>' : '') + '</td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num">' + gHtml + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b>' + (match ? '' : ' ⚠') + '</td>' +
      '<td class="num">' + r.multiple.toFixed(2) + '×' + (r.multiple_source === 'category' ? '' : ' *') + '</td>' +
      '<td>' + confPill(r.confidence) + '</td></tr>';
  }

  function renderTable() {
    var rows = filtered();
    var shown = state.showAll ? rows : rows.slice(0, 100);
    $('rows').innerHTML = shown.map(rowHtml).join('');
    $('count').textContent = rows.length + ' of ' + DATA.board_size + ' pre-token protocols' +
      (state.showAll || rows.length <= 100 ? '' : ' — showing the first 100') +
      ' · * = global multiple (too few live comparables in its category)';
    $('more').style.display = rows.length > 100 && !state.showAll ? '' : 'none';
  }

  function renderDetail() {
    var box = $('detail');
    if (!state.selected) { box.innerHTML = ''; return; }
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === state.selected) r = x; });
    if (!r) { box.innerHTML = ''; return; }
    var v = impliedOf(r);
    var steps = farmSteps(r);
    var multNote = r.multiple_source === 'category'
      ? 'the median mcap/TVL of the ' + r.comps + ' live ' + (r.category || '') + ' protocols in this snapshot'
      : 'the global median across all live protocols — too few live comparables in its category';
    box.innerHTML =
      '<article class="detail"><button type="button" class="close" id="dclose">Close ✕</button>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="sub2">' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc((r.chains || []).join(', ') || 'no chain listed') +
      (WATCH[r.slug] ? ' · <span class="pill wl">on the watchlist</span>' : '') + ' · records no token</p>' +
      '<div class="grid">' +
      '<div class="cell"><div class="k">Implied value</div><div class="v">' + fmtUsd(r.implied_value_usd) + '</div></div>' +
      '<div class="cell"><div class="k">TVL</div><div class="v">' + fmtUsd(r.tvl_usd) + '</div></div>' +
      '<div class="cell"><div class="k">7-day TVL change</div><div class="v">' + fmtPct(r.change_7d) + '</div></div>' +
      '<div class="cell"><div class="k">Age on DefiLlama</div><div class="v">' + fmtAge(r.age_days) + '</div></div>' +
      '</div>' +
      '<h3>How the number is built</h3>' +
      '<div class="tablewrap"><table><thead><tr><th>Step</th><th>Input</th><th class="num">Factor</th></tr></thead><tbody>' +
      '<tr><td>TVL</td><td>' + fmtUsd(r.tvl_usd) + ' locked</td><td class="num">—</td></tr>' +
      '<tr><td>Multiple</td><td>' + esc(multNote) + '</td><td class="num">' + r.multiple.toFixed(2) + '×</td></tr>' +
      '<tr><td>Growth</td><td>7-day change ' + fmtPct(r.change_7d) + ' (clamped −50…+100%)</td><td class="num">×' + v.growthMult.toFixed(3) + '</td></tr>' +
      '<tr><td>Maturity</td><td>' + (r.age_days === null ? 'age unknown, counted as 365 days' : fmtAge(r.age_days) + ' old') + '</td><td class="num">×' + v.maturity.toFixed(3) + '</td></tr>' +
      '<tr><td>Breadth</td><td>' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + '</td><td class="num">×' + v.breadth.toFixed(3) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td>page recompute ' + fmtUsd(v.implied) + (v.implied === r.implied_value_usd ? ' — matches board.json' : ' — differs from board.json') + '</td><td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table></div>' +
      '<h3>Farm plan — 7 steps, each with its cost and time</h3>' +
      '<ol>' + steps.map(function (s) {
        var cut = s.indexOf(' Cost: ');
        var head = cut >= 0 ? s.slice(0, cut) : s;
        var tail = cut >= 0 ? s.slice(cut + 1) : '';
        return '<li>' + esc(head) + ' <b>' + esc(tail) + '</b></li>';
      }).join('') + '</ol>' +
      '<p class="lede">Confidence ' + r.confidence + ': ' + (r.confidence === 'high' ? 'age, growth and category comparables are all known.' : r.confidence === 'medium' ? 'two of age, growth and category comparables are known.' : 'at most one of age, growth and category comparables is known — treat the number as rough.') + ' This board does not predict a token launch; it prices what a launch would be worth if the protocol\'s record stayed as it is.</p>' +
      '</article>';
    $('dclose').addEventListener('click', function () { state.selected = null; writeHash(); renderDetail(); renderTable(); });
  }

  function renderLive() {
    $('live-rows').innerHTML = DATA.live.map(function (p) {
      return '<tr><td><span class="nm">' + esc(p.name) + '</span> <span class="sl">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td><td>' + esc((p.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.mcap_tvl === null ? 'n/a' : p.mcap_tvl.toFixed(2) + '×') + '</td>' +
        '<td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  function renderMultiples() {
    var cats = Object.keys(DATA.multiples).sort();
    var counts = {};
    DATA.live.forEach(function (p) { if (p.category) counts[p.category] = (counts[p.category] || 0) + 1; });
    // Count comparables from the live rows shown is a floor; the board's own count is in each row.
    var rows = cats.map(function (c) {
      return '<tr><td>' + esc(c) + '</td><td class="num">' + (counts[c] || '≥3') + ' shown live</td><td class="num">' + DATA.multiples[c].toFixed(2) + '×</td></tr>';
    }).join('');
    rows += '<tr><td><b>Global fallback</b> (categories with fewer than 3 live protocols)</td><td class="num">—</td><td class="num"><b>' + DATA.global_multiple.toFixed(2) + '×</b></td></tr>';
    $('mult-rows').innerHTML = rows;
  }

  function renderStats() {
    var top = DATA.rows[0];
    var wlSum = 0;
    DATA.rows.forEach(function (r) { if (WATCH[r.slug]) wlSum += r.implied_value_usd; });
    $('stats').innerHTML =
      '<div class="stat"><div class="n">' + DATA.board_size + '</div><div class="l">pre-token protocols ranked</div></div>' +
      '<div class="stat"><div class="n">' + DATA.watchlist_size + '</div><div class="l">on the watchlist (TVL ≥ $50M, records no token)</div></div>' +
      '<div class="stat"><div class="n">' + DATA.early_size + '</div><div class="l">early finds below the floor</div></div>' +
      '<div class="stat"><div class="n">' + fmtUsd(wlSum) + '</div><div class="l">combined implied value, watchlist</div></div>' +
      '<div class="stat"><div class="n">' + DATA.live_size + '</div><div class="l">live tokens shown as comparables</div></div>';
    $('meta').innerHTML = 'Snapshot <b>' + esc(DATA.as_of) + '</b><br>Source <b>' + esc(DATA.source.split(',')[0]) + '</b><br>Model <b>' + esc(DATA.model_version) + '</b> · global multiple <b>' + DATA.global_multiple.toFixed(2) + '×</b>';
    $('modelver').textContent = DATA.model_version;
    $('asof').textContent = DATA.as_of;
    $('spot').innerHTML = DATA.rows.slice(0, 3).map(function (r) {
      return '<button type="button" class="card" data-slug="' + esc(r.slug) + '">' +
        '<div class="rk">RANK #' + r.rank + (WATCH[r.slug] ? ' · WATCHLIST' : '') + '</div>' +
        '<div class="nm">' + esc(r.name) + '</div>' +
        '<div class="vl">' + fmtUsd(r.implied_value_usd) + '</div>' +
        '<div class="ft">' + fmtUsd(r.tvl_usd) + ' TVL · ' + fmtPct(r.change_7d) + ' in 7 days · ' + esc(r.category || 'no category') + '</div></button>';
    }).join('');
    document.querySelectorAll('.card').forEach(function (c) {
      c.addEventListener('click', function () { select(c.getAttribute('data-slug')); });
    });
  }

  function renderTabs() {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === state.tab);
    });
    $('view-board').hidden = state.tab !== 'board';
    $('view-live').hidden = state.tab !== 'live';
    $('view-model').hidden = state.tab !== 'model';
    if (state.tab === 'live') renderLive();
    if (state.tab === 'model') renderMultiples();
  }

  function select(slug) {
    state.selected = slug;
    state.tab = 'board';
    writeHash();
    renderTabs();
    renderDetail();
    renderTable();
    var box = $('detail');
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });
  }

  function fillOptions() {
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      (r.chains || []).forEach(function (c) { chains[c] = true; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; $('category').appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o);
    });
  }

  function renderAll() { renderTabs(); renderTable(); renderDetail(); }
  function renderFocus() { document.body.classList.toggle('focus-detail', state.focus === 'detail' && !!state.selected); }

  // Wire the controls.
  readHash();
  fillOptions();
  $('q').value = state.q;
  $('category').value = state.category;
  $('chain').value = state.chain;
  $('mintvl').value = String(state.mintvl);
  $('wl').checked = state.wl;
  $('sort').value = state.sort;
  $('q').addEventListener('input', function () { state.q = $('q').value; state.showAll = false; writeHash(); renderTable(); });
  $('category').addEventListener('change', function () { state.category = $('category').value; state.showAll = false; writeHash(); renderTable(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; state.showAll = false; writeHash(); renderTable(); });
  $('mintvl').addEventListener('change', function () { state.mintvl = parseInt($('mintvl').value, 10) || 0; state.showAll = false; writeHash(); renderTable(); });
  $('wl').addEventListener('change', function () { state.wl = $('wl').checked; state.showAll = false; writeHash(); renderTable(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; state.dir = -1; writeHash(); renderTable(); });
  $('more').addEventListener('click', function () { state.showAll = true; renderTable(); });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); writeHash(); renderTabs(); });
  });
  document.querySelectorAll('#table thead th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
      $('sort').value = state.sort;
      writeHash(); renderTable();
    });
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target;
    while (tr && tr.tagName !== 'TR') tr = tr.parentElement;
    if (tr && tr.getAttribute('data-slug')) select(tr.getAttribute('data-slug'));
  });
  window.addEventListener('hashchange', function () { readHash(); renderAll(); });

  renderStats();
  renderFocus();
  renderAll();
  // A deep link to a protocol opens on its detail view, not on the top of the board.
  if (state.selected) {
    var box = $('detail');
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });
  }
  document.querySelector('main').setAttribute('aria-busy', 'false');
})();
