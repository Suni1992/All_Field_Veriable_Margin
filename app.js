// ─── 1. Cost field IDs ───────────────────────────────────────────────
const COST_IDS = [
  'procPrice', 'auctionFee', 'transport', 'insurance',
  'repair', 'challan', 'fitness', 'fitnessPenalty',
  'rtoTransfer', 'tyreCost', 'dhaalaCost', 'hypothecation',
  'parking', 'otherCosts'
];
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/15JF-xpXOpBVEb3qlxNhyjcKUNbshIAa2wOItKAx9mmA/export?format=csv&gid=1846469763';
let loadedLandedCost = null;
let loadedCostValues = null;

// ─── 2. Format number as Indian currency ────────────────────────────
function fmtINR(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

// ─── 3. Live margin calculation ─────────────────────────────────────
function calc() {
  // Sum all cost fields
  const calculatedLanded = COST_IDS.reduce((sum, id) => {
    return sum + (parseFloat(document.getElementById(id).value) || 0);
  }, 0);
  const editedLanded = loadedCostValues === null
    ? calculatedLanded
    : loadedLandedCost + COST_IDS.reduce((change, id) => {
      const current = parseFloat(document.getElementById(id).value) || 0;
      return change + current - loadedCostValues[id];
    }, 0);
  const landed = loadedLandedCost === null ? calculatedLanded : editedLanded;

  document.getElementById('landedCost').value = Math.round(landed);

  const sell     = parseFloat(document.getElementById('sellingPrice').value) || 0;
  const disc     = parseFloat(document.getElementById('discount').value)     || 0;
  const gstRate  = parseFloat(document.getElementById('gstRate').value)      || 0;
  const procurement = parseFloat(document.getElementById('procPrice').value) || 0;

  const effectiveSell = sell - disc;
  const gross  = effectiveSell - landed;
  const resaleMargin = Math.max(effectiveSell - procurement, 0);
  const gstAmt = resaleMargin * (gstRate / (100 + gstRate));
  const net    = gross - gstAmt;
  const pctBase = effectiveSell - gstAmt;
  const pct    = pctBase > 0 ? (net / pctBase) * 100 : 0;

  document.getElementById('res_landed').textContent = fmtINR(landed);
  document.getElementById('res_gross').textContent  = fmtINR(gross);
  document.getElementById('res_gst').textContent    = fmtINR(gstAmt);

  const netEl = document.getElementById('res_net');
  netEl.textContent = fmtINR(net);
  netEl.className   = 'value ' + (net >= 0 ? 'positive' : 'negative');

  const pctEl = document.getElementById('res_pct');
  pctEl.textContent = pct.toFixed(1) + '%';
  pctEl.className   = 'value ' + (pct >= 0 ? 'positive' : 'negative');
}

// Attach listener to every editable input
document.querySelectorAll('input:not([readonly])').forEach(el => {
  el.addEventListener('input', () => {
    calc();
  });
});
calc(); // run once on load

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function rowValue(rows, label, preferredIndex = null) {
  const wanted = normalize(label);
  const row = rows.find(candidate => normalize(candidate[0]) === wanted);
  if (!row) return '';
  if (preferredIndex !== null && row[preferredIndex]) return row[preferredIndex];
  return row[4] || row[2] || row[1] || '';
}

function numberValue(value) {
  const parsed = parseFloat(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element && value !== '') element.value = numberValue(value);
}

function populateVehicle(rows) {
  document.getElementById('vehicleNum').value = rowValue(rows, 'Paste Vehicle Number:');
  document.getElementById('storeName').value = rowValue(rows, 'Store Name');
  document.getElementById('makeModel').value = rowValue(rows, 'Make / Model');
  document.getElementById('variant').value = rowValue(rows, 'Model Variant');

  const costMap = {
    procPrice: 'Procurement Price',
    insurance: 'Pro_Insurance_Amount',
    challan: 'Challan Amount',
    fitness: 'Fitness Amount',
    fitnessPenalty: 'Fitness Penalty Amount',
    rtoTransfer: 'RTO Transfer Cost',
    tyreCost: 'Tyre Cost',
    dhaalaCost: 'Dhaala Cost',
    repair: 'Refurb Cost',
    parking: 'Parking Charges Till Auction Date'
  };
  Object.entries(costMap).forEach(([id, label]) => setValue(id, rowValue(rows, label)));

  const landed = rowValue(rows, 'Total Landed Cost (New)', 2);
  loadedLandedCost = landed ? numberValue(landed) : null;
  setValue('sellingPrice', rowValue(rows, 'Expected Selling Price To Customer'));
  loadedCostValues = Object.fromEntries(COST_IDS.map(id => [
    id,
    parseFloat(document.getElementById(id).value) || 0
  ]));
  calc();
}

async function searchVehicle() {
  const query = document.getElementById('vehicleSearch').value.trim();
  const status = document.getElementById('searchStatus');
  if (!query) {
    status.className = 'error';
    status.textContent = 'Enter a vehicle number first.';
    return;
  }

  status.className = 'info';
  status.textContent = 'Loading vehicle data from Google Sheets...';
  try {
    const response = await fetch(SHEET_CSV_URL);
    if (!response.ok) throw new Error(`Google Sheet returned HTTP ${response.status}.`);
    const rows = parseCSV(await response.text());
    const match = rows.some(row => row.some(value => normalize(value) === normalize(query)));
    if (!match) {
      status.className = 'error';
      status.textContent = `Vehicle ${query} was not found in the connected sheet.`;
      return;
    }
    populateVehicle(rows);
    status.className = 'success';
    status.textContent = `Loaded vehicle ${document.getElementById('vehicleNum').value}. Edit the selling price to see the revised margin.`;
  } catch (error) {
    status.className = 'error';
    status.textContent = `Could not load the sheet: ${error.message}`;
  }
}

document.getElementById('searchVehicle').addEventListener('click', searchVehicle);
document.getElementById('vehicleSearch').addEventListener('keydown', event => {
  if (event.key === 'Enter') searchVehicle();
});


