const { periodBounds } = require("./vat-engine");

const MONTH_SQ = [
  "Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor",
  "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor",
];

const FINE_INFO = `Sipas ligjit të ATK-së:
- Vonesë deri 30 ditë: gjobë €50–€250
- Vonesë mbi 30 ditë: gjobë €250–€500 + kamatë
- Moskontribut i përsëritur: masa shtesë`;

function padDate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** TVSH: deri më 20 të muajit pasardhës */
function atkDeadlineDate(periodEnd) {
  const d = new Date(periodEnd + "T12:00:00");
  d.setMonth(d.getMonth() + 1);
  d.setDate(20);
  return d.toISOString().slice(0, 10);
}

/** Tatimi vjetor: 31 Mars vitit pasardhës */
function annualDeadlineDate(fiscalYear) {
  return padDate(Number(fiscalYear) + 1, 3, 31);
}

/** Parapagimi tremujor */
function prepaymentDeadlineDate(quarter, year) {
  const y = Number(year);
  if (quarter === 1) return padDate(y, 4, 15);
  if (quarter === 2) return padDate(y, 7, 15);
  if (quarter === 3) return padDate(y, 10, 15);
  return padDate(y + 1, 1, 15);
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T12:00:00");
  return Math.ceil((target - today) / 86400000);
}

function getNotifySettings(settings) {
  const s = settings || {};
  return {
    onStartup: s.notify_on_startup !== 0,
    daysReminder: Number(s.notify_days_reminder) || 10,
    daysWarning: Number(s.notify_days_warning) || 5,
    daysUrgent: Number(s.notify_days_urgent) || 2,
    showBanner: s.notify_banner !== 0,
    showBadge: s.notify_badge !== 0,
  };
}

function urgencyLevel(daysLeft, notify, isOverdue) {
  const n = notify || getNotifySettings();
  if (isOverdue || daysLeft < 0) return "overdue";
  if (daysLeft <= n.daysUrgent) return "urgent";
  if (daysLeft <= n.daysWarning) return "warning";
  if (daysLeft <= n.daysReminder) return "reminder";
  return "ok";
}

function declarationKindLabel(periodType) {
  if (periodType === "annual") return "Deklarata Vjetore (Tatimi në të Ardhura)";
  if (periodType === "prepayment") return "Parapagimi i Tatimit në të Ardhura";
  return "Deklarata e TVSH-së";
}

function buildAlertMessage(row) {
  const kind = declarationKindLabel(row.period_type);
  const period = row.period_label;
  const date = row.deadline_date;
  const d = row.days_left;

  if (row.urgency === "overdue") {
    return {
      title: "❌ Afati ka kaluar",
      body: `❌ Afati për ${period} ka kaluar më ${date}! Dorëzoni sa më shpejt për të shmangur gjobat.`,
      action: "Dërgo menjëherë",
      fineInfo: FINE_INFO,
    };
  }
  if (row.urgency === "urgent") {
    const when = d === 0 ? "SOT" : d === 1 ? "NESËR" : `për ${d} ditë`;
    return {
      title: "🚨 URGJENT",
      body: `🚨 URGJENT: ${kind} për ${period} skadon ${when}! Afati: ${date}. Rrezik gjobe nga ATK!`,
      action: "Dërgo menjëherë",
      fineInfo: d < 0 ? FINE_INFO : null,
    };
  }
  if (row.urgency === "warning") {
    return {
      title: "⚠️ Paralajmërim",
      body: `⚠️ Paralajmërim: ${kind} për ${period} skadon për ${d} ditë — deri më ${date}!`,
      action: "Dërgo tani",
    };
  }
  if (row.urgency === "reminder") {
    return {
      title: "📅 Kujtesë",
      body: `📅 Kujtesë: ${kind} për ${period} duhet dorëzuar deri më ${date}. Ju kanë mbetur ${d} ditë.`,
      action: "Shko te Dërgo në ATK",
    };
  }
  return { title: kind, body: `${period} — afati ${date}`, action: "Shiko" };
}

function generateDeadlinesForYear(year, periodType = "quarterly") {
  const list = [];
  const y = Number(year);

  if (periodType === "monthly") {
    for (let m = 1; m <= 12; m++) {
      const { start, end } = periodBounds("monthly", y, m);
      list.push({
        period_type: "monthly",
        period_label: `TVSH ${MONTH_SQ[m - 1]} ${y}`,
        period_start: start,
        period_end: end,
        deadline_date: atkDeadlineDate(end),
        status: "pending",
      });
    }
  } else {
    for (let q = 1; q <= 4; q++) {
      const { start, end } = periodBounds("quarterly", y, q);
      list.push({
        period_type: "quarterly",
        period_label: `TVSH Q${q} ${y}`,
        period_start: start,
        period_end: end,
        deadline_date: atkDeadlineDate(end),
        status: "pending",
      });
    }
  }

  list.push({
    period_type: "annual",
    period_label: `Tatimi Vjetor ${y}`,
    period_start: `${y}-01-01`,
    period_end: `${y}-12-31`,
    deadline_date: annualDeadlineDate(y),
    status: "pending",
  });

  for (let q = 1; q <= 4; q++) {
    const { start, end } = periodBounds("quarterly", y, q);
    list.push({
      period_type: "prepayment",
      period_label: `Parapagimi Q${q} ${y}`,
      period_start: start,
      period_end: end,
      deadline_date: prepaymentDeadlineDate(q, y),
      status: "pending",
    });
  }

  return list;
}

function syncDeadlines(db, settings) {
  const year = settings?.fiscal_year || new Date().getFullYear();
  const periodType = settings?.declaration_period || "quarterly";
  const existing = db.prepare(
    "SELECT period_type, period_start FROM declaration_deadlines WHERE period_start LIKE ?"
  ).all(`${year}-%`);
  const have = new Set(existing.map((r) => `${r.period_type}|${r.period_start}`));
  const generated = generateDeadlinesForYear(year, periodType);
  const ins = db.prepare(
    `INSERT INTO declaration_deadlines (period_type, period_label, period_start, period_end, deadline_date, status)
     VALUES (@period_type, @period_label, @period_start, @period_end, @deadline_date, @status)`
  );
  for (const d of generated) {
    const key = `${d.period_type}|${d.period_start}`;
    if (!have.has(key)) ins.run(d);
  }
  syncDeadlineStatuses(db);
}

function syncDeadlineStatuses(db) {
  const rows = db.prepare("SELECT * FROM declaration_deadlines").all();
  const upd = db.prepare(`
    UPDATE declaration_deadlines SET status=@status, declaration_id=@declaration_id,
      submitted_date=@submitted_date WHERE id=@id
  `);

  for (const dl of rows) {
    if (dl.period_type === "monthly" || dl.period_type === "quarterly") {
      const decl = db.prepare(`
        SELECT * FROM vat_declarations
        WHERE period_start=? AND period_end=? AND period_type=?
        ORDER BY CASE status WHEN 'confirmed' THEN 3 WHEN 'sent' THEN 2 ELSE 1 END DESC, id DESC
        LIMIT 1
      `).get(dl.period_start, dl.period_end, dl.period_type);

      if (decl?.status === "confirmed") {
        upd.run({
          id: dl.id,
          status: "confirmed",
          declaration_id: decl.id,
          submitted_date: decl.submitted_date || decl.updated_at?.slice(0, 10) || null,
        });
      } else if (decl?.status === "sent") {
        upd.run({
          id: dl.id,
          status: "submitted",
          declaration_id: decl.id,
          submitted_date: decl.submitted_date || decl.updated_at?.slice(0, 10) || null,
        });
      } else {
        const daysLeft = daysUntil(dl.deadline_date);
        upd.run({
          id: dl.id,
          status: daysLeft < 0 ? "overdue" : "pending",
          declaration_id: decl?.id || null,
          submitted_date: null,
        });
      }
    } else if (dl.status !== "submitted" && dl.status !== "confirmed") {
      const daysLeft = daysUntil(dl.deadline_date);
      upd.run({
        id: dl.id,
        status: daysLeft < 0 ? "overdue" : "pending",
        declaration_id: dl.declaration_id || null,
        submitted_date: dl.submitted_date || null,
      });
    }
  }
}

function isOpenDeadline(row) {
  return !["submitted", "confirmed"].includes(row.status);
}

function enrichDeadline(row, notify) {
  const daysLeft = daysUntil(row.deadline_date);
  const isOverdue = row.status === "overdue" || (isOpenDeadline(row) && daysLeft < 0);
  const urgency = isOpenDeadline(row)
    ? urgencyLevel(daysLeft, notify, isOverdue)
    : "ok";
  const alert = isOpenDeadline(row) && urgency !== "ok"
    ? buildAlertMessage({ ...row, days_left: daysLeft, urgency })
    : null;
  return {
    ...row,
    days_left: daysLeft,
    urgency,
    is_open: isOpenDeadline(row),
    alert,
    kind_label: declarationKindLabel(row.period_type),
  };
}

function listDeadlinesWithAlerts(db, settings) {
  syncDeadlineStatuses(db);
  const notify = getNotifySettings(settings);
  return db.prepare("SELECT * FROM declaration_deadlines ORDER BY deadline_date ASC")
    .all()
    .map((r) => enrichDeadline(r, notify));
}

function pendingOpenDeadlines(db, settings) {
  return listDeadlinesWithAlerts(db, settings).filter((d) => d.is_open);
}

function upcomingAlerts(db, settings) {
  const notify = getNotifySettings(settings);
  return pendingOpenDeadlines(db, settings)
    .filter((d) => d.urgency !== "ok")
    .sort((a, b) => a.days_left - b.days_left);
}

function popupAlerts(db, settings) {
  const notify = getNotifySettings(settings);
  if (!notify.onStartup) return [];
  return pendingOpenDeadlines(db, settings)
    .filter((d) => d.days_left <= notify.daysWarning || d.urgency === "overdue")
    .sort((a, b) => a.days_left - b.days_left);
}

module.exports = {
  FINE_INFO,
  atkDeadlineDate,
  annualDeadlineDate,
  prepaymentDeadlineDate,
  daysUntil,
  getNotifySettings,
  urgencyLevel,
  buildAlertMessage,
  declarationKindLabel,
  generateDeadlinesForYear,
  syncDeadlines,
  syncDeadlineStatuses,
  listDeadlinesWithAlerts,
  pendingOpenDeadlines,
  upcomingAlerts,
  popupAlerts,
};
