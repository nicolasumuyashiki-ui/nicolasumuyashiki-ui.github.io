/**
 * 多読講座 セールスパイプライン（GAS版）
 * ============================================================
 * このファイルがサーバー側のすべての処理（DB読み書き・自動遷移・
 * リマインド通知・フォーム受信・バリデーション）を担当します。
 *
 * 画面（カンバンUI）は Index.html / Styles.html / JavaScript.html。
 *
 * 初心者向けの導入・デプロイ手順は SETUP.md を参照してください。
 * ============================================================
 */

/* ============================================================
 * 1. 定数定義
 * ============================================================ */

/** スプレッドシートのシート名 */
var SHEET_CUSTOMERS = 'customers';
var SHEET_ARCHIVE   = 'archive';
var SHEET_CONFIG    = 'config';

/**
 * customers / archive シートの列（この順番で1行＝1顧客）。
 * 列を増減する場合はここを編集すれば自動で反映されます。
 */
var COLUMNS = [
  'id', 'status',
  'name', 'intakeName', 'grade', 'country', 'parentEmail', 'otherEmail', 'staff',
  'meetingDate', 'reason', 'level', 'notes', 'trialDate', 'trialTime',
  'reminderSentDate', 'stagnationReason', 'stagnationOther', 'preMeetingLost',
  'createdAt', 'lostAt', 'archivedAt', 'history'
];

/** ステータス定義（カンバンの列・この順番で表示） */
var STATUSES = [
  { id: 's1', no: 1, name: '面談未実施' },
  { id: 's2', no: 2, name: '面談済み(体験日程未定)' },
  { id: 's3', no: 3, name: '面談済み(体験日程確定)' },
  { id: 's4', no: 4, name: '体験後未追客' },
  { id: 's5', no: 5, name: '体験後追客済' },
  { id: 's6', no: 6, name: 'ホールド(要理由)' },
  { id: 's7', no: 7, name: '成約' },
  { id: 's8', no: 8, name: 'ロスト' }
];

/** 移動先ごとの必須項目（累積チェック）。BASE = 共通必須8項目。 */
var BASE_REQUIRED = ['name', 'grade', 'country', 'parentEmail', 'staff', 'meetingDate', 'reason', 'level'];

var REQUIRED_MAP = {
  s1: [],
  s2: BASE_REQUIRED,
  s3: BASE_REQUIRED.concat(['trialDate']),
  s4: BASE_REQUIRED.concat(['trialDate']),
  s5: BASE_REQUIRED.concat(['trialDate', 'reminderSentDate']),
  s6: BASE_REQUIRED.concat(['trialDate', 'reminderSentDate', 'stagnationReason']),
  s7: BASE_REQUIRED.concat(['trialDate']),
  s8: BASE_REQUIRED // ※ preMeetingLost が true の時は不要（validateForStatus 内で分岐）
};

/** 学年ドロップダウン（13択・この順番） */
var GRADE_OPTIONS = ['小1', '小2', '小3', '小4', '小5', '小6', '中1', '中2', '中3', '高1', '高2', '高3', '既卒'];

/** 開始レベル ドロップダウン（この順番・この表記） */
var LEVEL_OPTIONS = [
  '1b Red', '1b Orange', '1b Gold', '1b Brown', '1b Tan', '1b Lime', '1b Green',
  '1b Olive', '1b Aqua', '1b Blue', 'Blue', '1b Purple', 'Purple', '1b Violet',
  'Violet', 'Rose', 'Red', 'Orange', 'Gold', 'Brown', 'Tan', 'Lime', 'Green'
];

/** 停滞の理由 選択肢（プロトタイプに準拠） */
var STAGNATION_OPTIONS = ['1. 成約待ち', '2. これからもう一度リマインド予定', '3. その他'];

/** 「3. その他」が選ばれているか（記入欄を必須にするか）の判定 */
function isStagnationOther_(reason) {
  return String(reason || '').trim().charAt(0) === '3';
}

/** 項目ラベル（UI・通知・エラー表示で使用） */
var FIELD_LABELS = {
  name: 'お名前', grade: '学年', country: '居住国', parentEmail: '保護者Email',
  otherEmail: 'その他Email', staff: '面談担当社員', meetingDate: '面談実施日',
  reason: 'お申込み理由', level: '開始レベル', notes: '特記事項', trialDate: '体験授業日程',
  trialTime: '体験授業 時間',
  reminderSentDate: 'リマインド送信日', stagnationReason: '停滞の理由',
  stagnationOther: '停滞理由(その他記入)', preMeetingLost: '面談前ロスト', intakeName: 'お問い合わせ者名'
};

/* ============================================================
 * 2. Web アプリのエントリーポイント
 * ============================================================ */

/** ブラウザでアクセスしたときに呼ばれる（カンバン画面を返す） */
function doGet(e) {
  ensureSheets_();
  var t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate()
    .setTitle('多読パイプライン')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptions(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** HTML テンプレートに別ファイル（CSS / JS）を読み込むためのヘルパー */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ============================================================
 * 3. シートの準備・低レベル読み書き
 * ============================================================ */

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** 必要なシート・ヘッダー行が無ければ作成する */
function ensureSheets_() {
  var ss = getSpreadsheet_();
  [SHEET_CUSTOMERS, SHEET_ARCHIVE].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var firstRow = sh.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
    var hasHeader = firstRow.join('') !== '' && firstRow[0] === 'id';
    if (!hasHeader) {
      sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
      sh.setFrozenRows(1);
    }
  });
  if (!ss.getSheetByName(SHEET_CONFIG)) {
    var cfg = ss.insertSheet(SHEET_CONFIG);
    cfg.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    cfg.setFrozenRows(1);
  }
}

/** シート全行をオブジェクト配列で取得（_row に行番号を付与） */
function readAll_(sheetName) {
  var sh = getSpreadsheet_().getSheetByName(sheetName);
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]).trim() === '') continue; // 空行スキップ
    var obj = rowToObj_(row);
    obj._row = i + 2;
    out.push(obj);
  }
  return out;
}

function rowToObj_(row) {
  var obj = {};
  for (var c = 0; c < COLUMNS.length; c++) {
    var key = COLUMNS[c];
    var v = row[c];
    if (key === 'preMeetingLost') {
      obj[key] = (v === true || v === 'true' || v === 'TRUE');
    } else if (v instanceof Date) {
      obj[key] = Utilities.formatDate(v, getTz_(), 'yyyy-MM-dd');
    } else {
      obj[key] = v === null || v === undefined ? '' : String(v);
    }
  }
  return obj;
}

function objToRow_(obj) {
  return COLUMNS.map(function (key) {
    var v = obj[key];
    if (v === undefined || v === null) return '';
    if (key === 'preMeetingLost') return v === true || v === 'true' || v === 'TRUE';
    return v;
  });
}

/** 指定行を書き込む */
function writeRow_(sheetName, rowNum, obj) {
  var sh = getSpreadsheet_().getSheetByName(sheetName);
  sh.getRange(rowNum, 1, 1, COLUMNS.length).setValues([objToRow_(obj)]);
}

/** 新規行を追加 */
function appendRow_(sheetName, obj) {
  var sh = getSpreadsheet_().getSheetByName(sheetName);
  sh.appendRow(objToRow_(obj));
}

/** 行を削除 */
function deleteRow_(sheetName, rowNum) {
  getSpreadsheet_().getSheetByName(sheetName).deleteRow(rowNum);
}

function getTz_() {
  return getSpreadsheet_().getSpreadsheetTimeZone() || 'Asia/Tokyo';
}

function today_() {
  return Utilities.formatDate(new Date(), getTz_(), 'yyyy-MM-dd');
}

function nowIso_() {
  return Utilities.formatDate(new Date(), getTz_(), "yyyy-MM-dd'T'HH:mm:ss");
}

/** 'yyyy-MM-dd' 文字列の差（日数）。a - b。無効なら null */
function dayDiff_(a, b) {
  var da = parseDate_(a), db = parseDate_(b);
  if (!da || !db) return null;
  return Math.floor((da.getTime() - db.getTime()) / 86400000);
}

function parseDate_(s) {
  if (!s) return null;
  var str = String(s).substring(0, 10);
  var m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function newId_() {
  return 'C' + Utilities.formatDate(new Date(), getTz_(), 'yyyyMMddHHmmss') +
    '-' + Math.floor(Math.random() * 9000 + 1000);
}

/* ============================================================
 * 4. バリデーション（クライアントとサーバーで同一ロジック）
 * ============================================================ */

/**
 * 移動先ステータスに対する必須キー一覧を返す。
 * ⑧ロストは preMeetingLost が true なら必須なし。
 */
function requiredKeysFor_(targetStatus, record) {
  if (targetStatus === 's8') {
    var pre = record && (record.preMeetingLost === true || record.preMeetingLost === 'true');
    return pre ? [] : BASE_REQUIRED.slice();
  }
  var keys = (REQUIRED_MAP[targetStatus] || []).slice();
  // 「停滞の理由」で「3. その他」を選んだ場合は記入欄も必須
  if (keys.indexOf('stagnationReason') !== -1 && record &&
      isStagnationOther_(record.stagnationReason)) {
    keys.push('stagnationOther');
  }
  return keys;
}

/** 不足している必須項目のラベル配列を返す（空なら移動OK） */
function validateForStatus_(record, targetStatus) {
  var keys = requiredKeysFor_(targetStatus, record);
  var missing = [];
  keys.forEach(function (k) {
    var v = record[k];
    if (v === undefined || v === null || String(v).trim() === '') {
      missing.push(FIELD_LABELS[k] || k);
    }
  });
  return missing;
}

/* ============================================================
 * 5. クライアントから呼ばれる API（google.script.run 経由）
 * ============================================================ */

/** 画面初期化用：盤面データ＋メタ情報をまとめて返す */
function getBoard() {
  ensureSheets_();
  var records = readAll_(SHEET_CUSTOMERS).map(function (r) {
    r.reminderDue = isReminderDue_(r); // 🔔バッジ用
    return r;
  });
  return {
    statuses: STATUSES,
    records: records,
    meta: {
      gradeOptions: GRADE_OPTIONS,
      levelOptions: LEVEL_OPTIONS,
      stagnationOptions: STAGNATION_OPTIONS,
      fieldLabels: FIELD_LABELS,
      requiredMap: REQUIRED_MAP,
      baseRequired: BASE_REQUIRED,
      sheetUrl: getSpreadsheet_().getUrl()
    }
  };
}

/**
 * カードを移動する（必須チェックはサーバーが最終判定）。
 * @param {string} id 対象レコードID
 * @param {string} targetStatus 移動先ステータスID (s1..s8)
 * @param {Object} data 入力フォームの値（部分更新）
 * @return {{ok:boolean, missing?:string[], record?:Object, message?:string}}
 */
function moveCard(id, targetStatus, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = readAll_(SHEET_CUSTOMERS);
    var rec = null;
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) { rec = all[i]; break; } }
    if (!rec) return { ok: false, message: '対象のカードが見つかりませんでした。' };

    // 入力値をマージ（編集可能な項目のみ）
    var editable = ['name', 'intakeName', 'grade', 'country', 'parentEmail', 'otherEmail', 'staff',
      'meetingDate', 'reason', 'level', 'notes', 'trialDate', 'trialTime', 'reminderSentDate',
      'stagnationReason', 'stagnationOther', 'preMeetingLost'];
    if (data) {
      editable.forEach(function (k) {
        if (data.hasOwnProperty(k)) {
          rec[k] = (k === 'preMeetingLost') ? !!data[k] : data[k];
        }
      });
    }

    // 必須チェック
    var missing = validateForStatus_(rec, targetStatus);
    if (missing.length > 0) {
      return { ok: false, missing: missing };
    }

    var prevStatus = rec.status;
    applyStatusChange_(rec, targetStatus, '手動操作');
    writeRow_(SHEET_CUSTOMERS, rec._row, rec);
    rec.reminderDue = isReminderDue_(rec);
    return { ok: true, record: rec, from: prevStatus };
  } finally {
    lock.releaseLock();
  }
}

/** フォーム入力だけ保存（移動はしない）。停滞理由選択など途中保存に使用 */
function saveCard(id, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = readAll_(SHEET_CUSTOMERS);
    var rec = null;
    for (var i = 0; i < all.length; i++) { if (all[i].id === id) { rec = all[i]; break; } }
    if (!rec) return { ok: false, message: '対象のカードが見つかりませんでした。' };
    var editable = ['name', 'intakeName', 'grade', 'country', 'parentEmail', 'otherEmail', 'staff',
      'meetingDate', 'reason', 'level', 'notes', 'trialDate', 'trialTime', 'reminderSentDate',
      'stagnationReason', 'stagnationOther', 'preMeetingLost'];
    if (data) editable.forEach(function (k) {
      if (data.hasOwnProperty(k)) rec[k] = (k === 'preMeetingLost') ? !!data[k] : data[k];
    });
    writeRow_(SHEET_CUSTOMERS, rec._row, rec);
    rec.reminderDue = isReminderDue_(rec);
    return { ok: true, record: rec };
  } finally {
    lock.releaseLock();
  }
}

/** 新規カードを①面談未実施に作成（手動追加・テスト用） */
function createCard(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rec = blankRecord_();
    var editable = ['name', 'intakeName', 'grade', 'country', 'parentEmail', 'otherEmail', 'staff',
      'meetingDate', 'reason', 'level', 'notes', 'trialDate', 'trialTime'];
    if (data) editable.forEach(function (k) { if (data.hasOwnProperty(k)) rec[k] = data[k]; });
    rec.status = 's1';
    rec.history = JSON.stringify([{ at: nowIso_(), to: 's1', by: '手動作成' }]);
    appendRow_(SHEET_CUSTOMERS, rec);
    return { ok: true, record: rec };
  } finally {
    lock.releaseLock();
  }
}

/** カードを削除（誤登録の除去用） */
function deleteCard(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = readAll_(SHEET_CUSTOMERS);
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { deleteRow_(SHEET_CUSTOMERS, all[i]._row); return { ok: true }; }
    }
    return { ok: false, message: '対象のカードが見つかりませんでした。' };
  } finally {
    lock.releaseLock();
  }
}

/** アーカイブ検索（氏名・保護者Email・居住国の部分一致） */
function searchArchive(query) {
  ensureSheets_();
  var q = String(query || '').trim().toLowerCase();
  var rows = readAll_(SHEET_ARCHIVE);
  if (q === '') return rows;
  return rows.filter(function (r) {
    return (String(r.name).toLowerCase().indexOf(q) !== -1) ||
      (String(r.parentEmail).toLowerCase().indexOf(q) !== -1) ||
      (String(r.country).toLowerCase().indexOf(q) !== -1);
  });
}

/** アーカイブからロスト列へ復帰 */
function restoreFromArchive(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = readAll_(SHEET_ARCHIVE);
    var rec = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) { rec = rows[i]; break; } }
    if (!rec) return { ok: false, message: '対象が見つかりませんでした。' };
    deleteRow_(SHEET_ARCHIVE, rec._row);
    rec.status = 's8';
    rec.archivedAt = '';
    rec.lostAt = today_(); // 30日カウントをリセット
    appendHistory_(rec, 's8', 'アーカイブから復帰');
    appendRow_(SHEET_CUSTOMERS, rec);
    return { ok: true, record: rec };
  } finally {
    lock.releaseLock();
  }
}

function blankRecord_() {
  var rec = {};
  COLUMNS.forEach(function (k) { rec[k] = ''; });
  rec.id = newId_();
  rec.preMeetingLost = false;
  rec.createdAt = nowIso_();
  rec.history = '[]';
  return rec;
}

/* ============================================================
 * 6. ステータス変更・履歴
 * ============================================================ */

function applyStatusChange_(rec, targetStatus, by) {
  if (targetStatus === 's8' && !rec.lostAt) rec.lostAt = today_();
  if (targetStatus !== 's8') rec.lostAt = rec.lostAt; // 維持
  appendHistory_(rec, targetStatus, by);
  rec.status = targetStatus;
}

function appendHistory_(rec, to, by) {
  var hist;
  try { hist = JSON.parse(rec.history || '[]'); } catch (e) { hist = []; }
  hist.push({ at: nowIso_(), from: rec.status || '', to: to, by: by || '' });
  rec.history = JSON.stringify(hist);
}

/* ============================================================
 * 7. リマインド判定
 * ============================================================ */

/** そのカードが「今日リマインド対象か」を判定（🔔バッジ用） */
function isReminderDue_(rec) {
  var s = rec.status;
  if (s === 's4') return true;
  if (s === 's6') return true;
  if (s === 's5') {
    if (String(rec.stagnationReason || '').trim() !== '') return false;
    var d = dayDiff_(today_(), rec.reminderSentDate);
    return d !== null && d >= 3;
  }
  return false;
}

/* ============================================================
 * 8. 毎日の自動処理（時間主導トリガーで dailyJob を実行）
 * ============================================================ */

/**
 * トリガー登録対象。毎朝1回（推奨9時 JST）全レコードを走査して
 * 自動遷移・自動リマインド・自動アーカイブを行う。
 */
function dailyJob() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    ensureSheets_();
    var all = readAll_(SHEET_CUSTOMERS);
    var reminderCards = []; // 通知ダイジェスト用
    var rowsToDelete = [];  // アーカイブ移送後に削除する行（ループ後にまとめて処理）

    all.forEach(function (rec) {
      var changed = false;
      var s = rec.status;

      // 1. ③ → ④：体験日が過ぎたら自動移動
      if (s === 's3') {
        var d = dayDiff_(today_(), rec.trialDate);
        if (d !== null && d > 0) {
          applyStatusChange_(rec, 's4', '自動(体験日超過)');
          s = 's4';
          changed = true;
        }
      }

      // 4. ⑤で7日経過＆理由未選択 → ⑧ロスト自動
      if (s === 's5' && String(rec.stagnationReason || '').trim() === '') {
        var d5 = dayDiff_(today_(), rec.reminderSentDate);
        if (d5 !== null && d5 >= 7) {
          applyStatusChange_(rec, 's8', '自動(7日放置でロスト)');
          s = 's8';
          changed = true;
        }
      }

      // 6. ⑧で lostAt から30日経過 → アーカイブ
      if (s === 's8') {
        var dl = dayDiff_(today_(), rec.lostAt);
        if (dl !== null && dl >= 30) {
          rec.archivedAt = today_();
          appendHistory_(rec, 's8', '自動アーカイブ(30日経過)');
          appendRow_(SHEET_ARCHIVE, rec);
          // 削除は行番号のズレを防ぐため、ループ後にまとめて（降順で）実施する
          rowsToDelete.push(rec._row);
          return;
        }
      }

      // リマインド対象収集（②③④⑤⑥…のうち④⑥、および⑤3日経過）
      if (s === 's4' || s === 's6') {
        reminderCards.push(rec);
      } else if (s === 's5' && String(rec.stagnationReason || '').trim() === '') {
        var d3 = dayDiff_(today_(), rec.reminderSentDate);
        if (d3 !== null && d3 >= 3) reminderCards.push(rec);
      }

      if (changed) writeRow_(SHEET_CUSTOMERS, rec._row, rec);
    });

    // アーカイブ済み行を降順で削除（行番号のズレを防ぐ）
    rowsToDelete.sort(function (a, b) { return b - a; });
    rowsToDelete.forEach(function (rowNum) { deleteRow_(SHEET_CUSTOMERS, rowNum); });

    if (reminderCards.length > 0) {
      sendReminderDigest_(reminderCards);
    }
    return { ok: true, reminders: reminderCards.length, archived: rowsToDelete.length };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * 9. 通知（Gmail / Google Chat）
 * ============================================================ */

function getProp_(key, def) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === undefined || v === '') ? def : v;
}

function statusNameById_(id) {
  for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].id === id) return STATUSES[i].name;
  return id;
}

/** 滞留日数（最後のステータス変更からの日数） */
function stagnationDays_(rec) {
  try {
    var hist = JSON.parse(rec.history || '[]');
    if (hist.length === 0) return null;
    var last = hist[hist.length - 1];
    return dayDiff_(today_(), String(last.at).substring(0, 10));
  } catch (e) { return null; }
}

function sendReminderDigest_(cards) {
  var channel = getProp_('NOTIFY_CHANNEL', 'chat');
  var sheetUrl = getSpreadsheet_().getUrl();

  // ステータス別件数サマリ
  var byStatus = {};
  cards.forEach(function (c) { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
  var summaryParts = [];
  STATUSES.forEach(function (st) {
    if (byStatus[st.id]) summaryParts.push(st.no + ' ' + st.name + ' に' + byStatus[st.id] + '件');
  });

  var lines = [];
  lines.push('【多読パイプライン】催促が必要なカードがあります（' + today_() + '）');
  lines.push(summaryParts.join(' / '));
  lines.push('');
  cards.forEach(function (c) {
    var days = stagnationDays_(c);
    lines.push('・' + (c.name || '(名前未入力)') +
      '｜' + statusNameById_(c.status) +
      '｜滞留' + (days === null ? '?' : days) + '日' +
      (c.grade ? '｜' + c.grade : ''));
  });
  lines.push('');
  lines.push('スプレッドシート: ' + sheetUrl);
  var text = lines.join('\n');

  if (channel === 'chat' || channel === 'both') sendChat_(text);
  if (channel === 'gmail' || channel === 'both') sendGmail_('【多読パイプライン】催促リマインド (' + cards.length + '件)', text);
}

function sendChat_(text) {
  var url = getProp_('CHAT_WEBHOOK_URL', '');
  if (!url) { Logger.log('CHAT_WEBHOOK_URL 未設定のため Chat 通知をスキップ'); return; }
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch (e) { Logger.log('Chat 通知エラー: ' + e); }
}

function sendGmail_(subject, body) {
  var to = getProp_('NOTIFY_EMAILS', '');
  if (!to) { Logger.log('NOTIFY_EMAILS 未設定のため Gmail 通知をスキップ'); return; }
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body });
  } catch (e) { Logger.log('Gmail 通知エラー: ' + e); }
}

/** 通知の手動テスト用（エディタから実行可） */
function testNotification() {
  sendReminderDigest_([{ name: 'テスト 太郎', status: 's4', grade: '小3', history: '[]' }]);
}

/* ============================================================
 * 10. フォーム自動流入（Webhook 受信）
 * ============================================================
 * HubSpot 体験申込フォーム / 成約フォームの連携先リンクは後日ニコから
 * 共有される。それまでは FORM_SECRET による簡易認証付きの受信口のみ用意。
 * HubSpot 側 Workflow から Webhook を叩く設定手順はリンク受領後に追記する。
 *
 * 送信例（JSON, POST）:
 *   { "secret":"xxxxx", "type":"inquiry",
 *     "name":"山田花子", "parentEmail":"oya@example.com", "country":"日本" }
 *   { "secret":"xxxxx", "type":"contract", "parentEmail":"oya@example.com" }
 * secret は body 内 または URL の ?secret= のどちらでも可。
 * ============================================================ */

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
    }
    // フォームエンコード（application/x-www-form-urlencoded）にも一応対応
    if ((!body || !body.type) && e && e.parameter) body = e.parameter;

    // 共有シークレット照合（必須）
    var expected = getProp_('FORM_SECRET', '');
    var given = (body && body.secret) || (e && e.parameter && e.parameter.secret) || '';
    if (!expected || given !== expected) {
      return jsonOut_({ ok: false, message: 'unauthorized' });
    }

    var type = String(body.type || '').toLowerCase();
    if (type === 'inquiry') return jsonOut_(handleInquiry_(body));
    if (type === 'contract') return jsonOut_(handleContract_(body));
    return jsonOut_({ ok: false, message: 'unknown type: ' + type });
  } catch (err) {
    return jsonOut_({ ok: false, message: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** type:"inquiry" → ①面談未実施 に新規カード */
function handleInquiry_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSheets_();
    var rec = blankRecord_();
    ['name', 'intakeName', 'grade', 'country', 'parentEmail', 'otherEmail', 'staff',
     'meetingDate', 'reason', 'level', 'notes', 'trialDate', 'trialTime'].forEach(function (k) {
      if (body[k] !== undefined && body[k] !== null) rec[k] = String(body[k]);
    });
    rec.status = 's1';
    rec.history = JSON.stringify([{ at: nowIso_(), to: 's1', by: 'フォーム(inquiry)' }]);
    appendRow_(SHEET_CUSTOMERS, rec);
    return { ok: true, action: 'created', id: rec.id, status: 's1' };
  } finally {
    lock.releaseLock();
  }
}

/** type:"contract" → 突合して⑦成約へ。無ければ新規作成して⑦へ */
function handleContract_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSheets_();
    var all = readAll_(SHEET_CUSTOMERS);
    var key = String(body.parentEmail || '').trim().toLowerCase();
    var rec = null;
    if (key) {
      for (var i = 0; i < all.length; i++) {
        if (String(all[i].parentEmail || '').trim().toLowerCase() === key) { rec = all[i]; break; }
      }
    }
    if (rec) {
      applyStatusChange_(rec, 's7', 'フォーム(contract)');
      writeRow_(SHEET_CUSTOMERS, rec._row, rec);
      return { ok: true, action: 'moved', id: rec.id, status: 's7' };
    }
    // 突合先なし → 新規作成して⑦へ
    var nr = blankRecord_();
    ['name', 'intakeName', 'grade', 'country', 'parentEmail', 'otherEmail', 'staff',
     'meetingDate', 'reason', 'level', 'notes', 'trialDate', 'trialTime'].forEach(function (k) {
      if (body[k] !== undefined && body[k] !== null) nr[k] = String(body[k]);
    });
    nr.status = 's7';
    nr.history = JSON.stringify([{ at: nowIso_(), to: 's7', by: 'フォーム(contract/新規)' }]);
    appendRow_(SHEET_CUSTOMERS, nr);
    return { ok: true, action: 'created', id: nr.id, status: 's7' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * 11. トリガー設定ヘルパー（一度だけエディタから実行すればOK）
 * ============================================================ */

/** dailyJob を毎朝9時(JST)に動かすトリガーを作成（重複作成を防止） */
function setupDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone('Asia/Tokyo')
    .create();
  return '毎朝9時(JST)に dailyJob を実行するトリガーを作成しました。';
}
