// Beží raz denne cez GitHub Actions (pozri .github/workflows/pripomienky.yml).
// Prečíta zoznam faktúr z privátneho Gistu (rovnaký, čo napĺňa index.html)
// a pošle mail cez Gmail (SMTP, App Password), ak dnes vychádza upozornenie.

import nodemailer from 'nodemailer';

const GIST_TOKEN = process.env.GIST_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const TO_EMAIL = process.env.TO_EMAIL;
const TZ = 'Europe/Bratislava';

function fail(msg) { console.error('CHYBA: ' + msg); process.exit(1); }
if (!GIST_TOKEN) fail('chýba GIST_TOKEN secret');
if (!GMAIL_USER) fail('chýba GMAIL_USER secret');
if (!GMAIL_APP_PASSWORD) fail('chýba GMAIL_APP_PASSWORD secret');
if (!TO_EMAIL) fail('chýba TO_EMAIL secret');

// -- dátum "dnes" v lokálnej časovej zóne, nie UTC (Actions bežia v UTC) --
function todayParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = fmt.format(new Date()).split('-').map(Number);
  return { y, m, d }; // m je 1-12
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m 1-12
function dateStr(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function addMonths(y, m, n) {
  let mm = m - 1 + n, yy = y + Math.floor(mm / 12);
  mm = ((mm % 12) + 12) % 12;
  return { y: yy, m: mm + 1 };
}
// posunie dátum (y,m,d) o n dní dozadu tak, že to vieme porovnať ako reťazec
function subDays(y, m, d, n) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

async function findGist() {
  const r = await fetch('https://api.github.com/gists?per_page=100', {
    headers: { Authorization: 'Bearer ' + GIST_TOKEN, Accept: 'application/vnd.github+json' }
  });
  if (!r.ok) fail('GitHub API ' + r.status + ' (GIST_TOKEN neplatný alebo bez scope gist)');
  const gists = await r.json();
  const hit = gists.find(g => g.files && g.files['faktury.json']);
  if (!hit) fail('nenašiel sa žiadny Gist so súborom faktury.json — najprv otvor stránku a ulož aspoň jednu faktúru');
  return hit.id;
}

async function loadBills(gistId) {
  const r = await fetch('https://api.github.com/gists/' + gistId, {
    headers: { Authorization: 'Bearer ' + GIST_TOKEN, Accept: 'application/vnd.github+json' }
  });
  if (!r.ok) fail('nepodarilo sa načítať Gist (' + r.status + ')');
  const j = await r.json();
  const f = j.files['faktury.json'];
  const raw = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  const data = JSON.parse(raw);
  return Array.isArray(data.bills) ? data.bills : [];
}

function dueInstancesAround(y, m, day) {
  // vráti splatnosť pre predchádzajúci, aktuálny a nasledujúci mesiac,
  // s dňom orezaným na posledný deň mesiaca ak je kratší (napr. 30. vo februári)
  const out = [];
  for (const off of [-1, 0, 1]) {
    const { y: yy, m: mm } = addMonths(y, m, off);
    const d = Math.min(day, daysInMonth(yy, mm));
    out.push({ y: yy, m: mm, d });
  }
  return out;
}

async function sendMail(subject, text) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
  });
  try {
    await transporter.sendMail({ from: GMAIL_USER, to: TO_EMAIL, subject, text });
  } catch (e) {
    fail('Gmail SMTP: ' + e.message);
  }
  console.log('Mail odoslaný: ' + subject);
}

(async () => {
  const gistId = await findGist();
  const bills = await loadBills(gistId);
  const { y, m, d } = todayParts();
  const todayS = dateStr(y, m, d);

  const dueToday = [];      // splatné presne dnes
  const remindToday = [];   // upozornenie vychádza na dnes (a ešte nie je splatné dnes)

  for (const b of bills) {
    const day = +b.day, before = +b.before || 0;
    if (!(day >= 1 && day <= 31)) continue;
    for (const inst of dueInstancesAround(y, m, day)) {
      const dueS = dateStr(inst.y, inst.m, inst.d);
      if (dueS === todayS) { dueToday.push({ ...b, dueS }); continue; }
      const rem = subDays(inst.y, inst.m, inst.d, before);
      if (dateStr(rem.y, rem.m, rem.d) === todayS && before > 0) {
        remindToday.push({ ...b, dueS });
      }
    }
  }

  if (!dueToday.length && !remindToday.length) {
    console.log('Dnes (' + todayS + ') nič na pripomenutie.');
    return;
  }

  const typeLabel = b => b.type === 'firma' ? '[Firemné] ' : '[Súkromné] ';

  const lines = [];
  if (dueToday.length) {
    lines.push('Dnes treba zaplatiť:');
    for (const b of dueToday) lines.push('• ' + typeLabel(b) + b.name + (b.note ? ' — ' + b.note : ''));
    lines.push('');
  }
  if (remindToday.length) {
    lines.push('Blíži sa splatnosť:');
    for (const b of remindToday) lines.push('• ' + typeLabel(b) + b.name + ' — splatné ' + b.dueS + (b.note ? ' (' + b.note + ')' : ''));
  }

  const subject = dueToday.length
    ? 'Dnes zaplatiť: ' + dueToday.map(b => b.name).join(', ')
    : 'Blíži sa splatnosť: ' + remindToday.map(b => b.name).join(', ');

  await sendMail(subject, lines.join('\n'));
})();
