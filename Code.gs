/**
 * @OnlyCurrentDoc  Skriptet får bare tilgang til regnearket det er knyttet til.
 *
 * Viltobservasjoner Linge – server (Google Apps Script)
 *
 * Lagrer observasjoner i arket «Observasjoner» i regnearket dette
 * skriptet er knyttet til, og henter værdata fra MET Norge sin
 * MET Nordic-modell (via Open-Meteo) for valgt sted og tidspunkt.
 */

const SHEET_NAME = 'Observasjoner';
const TZ = 'Europe/Oslo';
const HEADERS = [
  'ID', 'Registrert', 'Tidspunkt', 'Art', 'Antall', 'Vær', 'Vind fra',
  'Snøforhold', 'Breddegrad', 'Lengdegrad', 'UTM33 Øst', 'UTM33 Nord', 'Værdata'
];

// Må stemme med listene i Index.html
const VAER = ['Sol / klart', 'Skyet', 'Regn', 'Snøvær', 'Tåke'];
const VIND = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV', 'Stille'];
const SNO = ['Ingen', 'Flekkvis', 'Dekket', 'Nysnø', 'Sporsnø'];

/* ---------- Webapp ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Viltobservasjoner Linge')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* ---------- Observasjoner ---------- */

function listObservations() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(function (r) { return r[0]; })
    .map(rowToObj_);
}

function saveObservation(o) {
  const c = clean_(o);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const row = [
      c.id, new Date(), c.tid, text_(c.art), c.antall, c.vaer, c.vind, c.sno,
      c.lat, c.lon, c.e, c.n, text_(c.vaerdata)
    ];
    if (o && o.id) {
      const r = findRow_(sh, o.id);
      if (!r) throw new Error('Fant ikke observasjonen. Den kan være slettet av noen andre.');
      row[1] = sh.getRange(r, 2).getValue(); // behold opprinnelig registreringstid
      sh.getRange(r, 1, 1, HEADERS.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    return rowToObj_(row);
  } finally {
    lock.releaseLock();
  }
}

function deleteObservation(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const r = findRow_(sh, id);
    if (r) sh.deleteRow(r);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Værdata ---------- */

/**
 * Henter vær for nærmeste hele time.
 * Siste 90 døgn og inntil 2 døgn fram: MET Nordic (1 km, MET Norge).
 * Eldre tidspunkt: ERA5-reanalyse (grovere, ca. 25 km).
 */
function getWeather(lat, lon, localIso) {
  lat = Number(lat); lon = Number(lon);
  if (!isFinite(lat) || !isFinite(lon)) throw new Error('Ugyldig posisjon.');
  const t = parseLocal_(localIso);
  const rounded = new Date(Math.round(t.getTime() / 3600000) * 3600000);
  const hourStr = Utilities.formatDate(rounded, TZ, "yyyy-MM-dd'T'HH:00");
  const dayStr = hourStr.slice(0, 10);

  const key = ['wx3', lat.toFixed(3), lon.toFixed(3), hourStr].join('|');
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const ageDays = (Date.now() - rounded.getTime()) / 86400000;
  const vars = 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m';
  const common = 'latitude=' + lat.toFixed(5) + '&longitude=' + lon.toFixed(5) +
    '&hourly=' + vars + '&timezone=Europe%2FOslo&wind_speed_unit=ms';

  let res = null;
  if (ageDays <= 90 && ageDays >= -2.2) {
    res = fetchHour_('https://api.open-meteo.com/v1/forecast?' + common +
      '&models=metno_seamless&start_hour=' + hourStr + '&end_hour=' + hourStr,
      hourStr, ageDays > 0 ? 'MET Nordic' : 'MET Nordic, prognose');
  }
  if (!res && ageDays > 5) {
    res = fetchHour_('https://archive-api.open-meteo.com/v1/archive?' + common +
      '&start_date=' + dayStr + '&end_date=' + dayStr, hourStr, 'ERA5-reanalyse');
  }
  if (!res) {
    return {
      ok: false,
      message: ageDays < -2.2 ? 'Det finnes ikke værdata så langt fram i tid.'
                              : 'Fant ikke værdata for dette tidspunktet.'
    };
  }
  cache.put(key, JSON.stringify(res), ageDays > 0.25 ? 21600 : 900);
  return res;
}

function fetchHour_(url, hourStr, source) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const j = JSON.parse(r.getContentText());
  const h = j && j.hourly;
  if (!h || !h.time) return null;
  const i = h.time.indexOf(hourStr);
  if (i < 0) return null;
  const code = h.weather_code ? h.weather_code[i] : null;
  const temp = h.temperature_2m ? h.temperature_2m[i] : null;
  const speed = h.wind_speed_10m ? h.wind_speed_10m[i] : null;
  const dir = h.wind_direction_10m ? h.wind_direction_10m[i] : null;
  if (code == null && dir == null) return null;

  const vaer = codeToVaer_(code);
  const vind = dirToVind_(dir, speed);
  const parts = [];
  if (temp != null) parts.push(num_(temp) + ' °C');
  if (speed != null) parts.push(num_(speed) + ' m/s' + (dir != null && vind !== 'Stille' ? ' fra ' + Math.round(dir) + '°' : ''));
  if (vaer) parts.push(vaer.toLowerCase());
  const summary = source + ' kl. ' + hourStr.slice(11, 16) + ': ' + parts.join(', ');

  return { ok: true, source: source, hour: hourStr, code: code, temp: temp, speed: speed, dir: dir,
           vaer: vaer, vind: vind, summary: summary };
}

function codeToVaer_(c) {
  if (c == null) return null;
  c = Number(c);
  if (c <= 1) return 'Sol / klart';
  if (c <= 3) return 'Skyet';
  if (c === 45 || c === 48) return 'Tåke';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'Snøvær';
  if (c >= 51) return 'Regn';
  return 'Skyet';
}

function dirToVind_(dir, speed) {
  if (speed != null && speed < 0.5) return 'Stille';
  if (dir == null) return null;
  return VIND[Math.round(((Number(dir) % 360) + 360) % 360 / 45) % 8];
}

/* ---------- Hjelpere ---------- */

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.getRange('C:C').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
  }
  return sh;
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function clean_(o) {
  if (!o) throw new Error('Mangler data.');
  const art = String(o.art || '').trim().slice(0, 60);
  if (!art) throw new Error('Velg eller skriv inn art.');
  const antall = Math.round(Number(o.antall));
  if (!(antall >= 1 && antall <= 999)) throw new Error('Antall må være mellom 1 og 999.');
  const lat = Number(o.lat), lon = Number(o.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Ugyldig posisjon.');
  }
  const pick = function (v, list) { return list.indexOf(v) >= 0 ? v : ''; };
  return {
    id: o.id ? String(o.id) : Utilities.getUuid(),
    tid: parseLocal_(o.tid),
    art: art,
    antall: antall,
    vaer: pick(o.vaer, VAER),
    vind: pick(o.vind, VIND),
    sno: pick(o.sno, SNO),
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    e: isFinite(Number(o.e)) ? Math.round(Number(o.e)) : '',
    n: isFinite(Number(o.n)) ? Math.round(Number(o.n)) : '',
    vaerdata: String(o.vaerdata || '').slice(0, 200)
  };
}

function parseLocal_(s) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(s || ''));
  if (!m) throw new Error('Ugyldig dato og klokkeslett.');
  return Utilities.parseDate(m[1] + ' ' + m[2], TZ, 'yyyy-MM-dd HH:mm');
}

function rowToObj_(r) {
  const fmt = function (v) {
    return v instanceof Date ? Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm") : String(v || '');
  };
  return {
    id: String(r[0]), registrert: fmt(r[1]), tid: fmt(r[2]), art: String(r[3]),
    antall: Number(r[4]) || 1, vaer: String(r[5] || ''), vind: String(r[6] || ''),
    sno: String(r[7] || ''), lat: Number(r[8]), lon: Number(r[9]),
    e: r[10] === '' ? null : Number(r[10]), n: r[11] === '' ? null : Number(r[11]),
    vaerdata: String(r[12] || '')
  };
}

// Hindrer at tekst som starter med = + - @ tolkes som formel i regnearket
function text_(s) {
  s = String(s || '');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function num_(x) {
  return (Math.round(Number(x) * 10) / 10).toFixed(1).replace('.', ',');
}
