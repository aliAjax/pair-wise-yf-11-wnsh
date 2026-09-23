const http = require("http");
const { readFile, writeFile, mkdir } = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3020);
const DB_FILE = path.join(__dirname, "data", "db.json");

const RANKING_RULE = "按纤维方向差→色差→厚度差排序，三项差值并列时入库早者优先";

const seedPapers = [
  {
    id: "paper_xuan_1",
    code: "XZ-A-001",
    name: "净皮宣纸（A库）",
    warehouse: "A库",
    fiberDirection: 88,
    colorLab: { l: 69, a: 2.5, b: 14 },
    thickness: 0.118,
    storedAt: "2025-03-01T09:00:00.000Z",
    createdAt: "2025-03-01T09:00:00.000Z"
  },
  {
    id: "paper_mian_1",
    code: "ML-A-014",
    name: "棉料宣（A库）",
    warehouse: "A库",
    fiberDirection: 90,
    colorLab: { l: 71, a: 1, b: 16 },
    thickness: 0.122,
    storedAt: "2026-02-15T09:00:00.000Z",
    createdAt: "2026-02-15T09:00:00.000Z"
  },
  {
    id: "paper_xuan_2",
    code: "XZ-A-027",
    name: "净皮宣纸（A库，2024入库）",
    warehouse: "A库",
    fiberDirection: 85,
    colorLab: { l: 67, a: 3, b: 13 },
    thickness: 0.11,
    storedAt: "2024-11-20T09:00:00.000Z",
    createdAt: "2024-11-20T09:00:00.000Z"
  },
  {
    id: "paper_xuan_3",
    code: "XZ-A-028",
    name: "净皮宣纸（A库，2025入库）",
    warehouse: "A库",
    fiberDirection: 85,
    colorLab: { l: 67, a: 3, b: 13 },
    thickness: 0.11,
    storedAt: "2025-06-01T09:00:00.000Z",
    createdAt: "2025-06-01T09:00:00.000Z"
  },
  {
    id: "paper_xuan_4",
    code: "XZ-A-031",
    name: "加厚净皮宣（A库）",
    warehouse: "A库",
    fiberDirection: 70,
    colorLab: { l: 60, a: 5, b: 10 },
    thickness: 0.15,
    storedAt: "2025-01-10T09:00:00.000Z",
    createdAt: "2025-01-10T09:00:00.000Z"
  },
  {
    id: "paper_b_1",
    code: "XZ-B-002",
    name: "净皮宣纸（B库）",
    warehouse: "B库",
    fiberDirection: 88,
    colorLab: { l: 69, a: 2, b: 15 },
    thickness: 0.12,
    storedAt: "2025-05-05T09:00:00.000Z",
    createdAt: "2025-05-05T09:00:00.000Z"
  }
];

const initialData = {
  rubbings: [
    {
      id: "rubbing_demo",
      code: "TP-清-014",
      source: "地方碑刻残页",
      paperSize: "42x68cm",
      note: "边缘有旧折痕",
      warehouse: "A库",
      fiberDirection: 90,
      colorLab: { l: 70, a: 2, b: 15 },
      thickness: 0.12,
      createdAt: new Date().toISOString()
    }
  ],
  damages: [
    {
      id: "damage_demo_1",
      rubbingId: "rubbing_demo",
      position: "左上角第3列题字旁",
      type: "虫蛀孔",
      beforePhotoUrl: "https://example.local/before-014-1.jpg",
      afterPhotoUrl: "",
      status: "pending",
      repairNote: "",
      batchId: null,
      createdAt: new Date().toISOString(),
      repairedAt: null
    },
    {
      id: "damage_demo_2",
      rubbingId: "rubbing_demo",
      position: "下边缘中央",
      type: "撕裂",
      beforePhotoUrl: "https://example.local/before-014-2.jpg",
      afterPhotoUrl: "",
      status: "pending",
      repairNote: "",
      batchId: null,
      createdAt: new Date().toISOString(),
      repairedAt: null
    }
  ],
  papers: seedPapers,
  trialMatches: [],
  batches: []
};

const routes = [
  "GET /health",
  "GET /rubbings",
  "POST /rubbings",
  "GET /rubbings/:id/damages",
  "POST /rubbings/:id/damages",
  "GET /damages?status=&type=",
  "PATCH /damages/:id",
  "GET /papers?warehouse=",
  "POST /papers",
  "GET /damages/:id/trial-match",
  "PUT /damages/:id/trial-match",
  "POST /damages/:id/trial-match/confirm",
  "GET /batches",
  "POST /batches",
  "GET /batches/:id",
  "POST /batches/:id/start",
  "POST /batches/:id/items/:damageId/reselect",
  "POST /batches/:id/complete"
];

async function ensureDb() {
  await mkdir(path.dirname(DB_FILE), { recursive: true });
  let db = null;
  try {
    db = JSON.parse(await readFile(DB_FILE, "utf8"));
  } catch {
    await writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
    return;
  }
  let changed = false;
  if (!Array.isArray(db.papers)) {
    db.papers = seedPapers;
    changed = true;
  }
  if (!Array.isArray(db.trialMatches)) {
    db.trialMatches = [];
    changed = true;
  }
  if (!Array.isArray(db.batches)) {
    db.batches = [];
    changed = true;
  }
  const demo = (db.rubbings || []).find((item) => item.id === "rubbing_demo");
  if (demo && demo.warehouse === undefined) {
    Object.assign(demo, {
      warehouse: "A库",
      fiberDirection: 90,
      colorLab: { l: 70, a: 2, b: 15 },
      thickness: 0.12
    });
    changed = true;
  }
  for (const batch of db.batches) {
    if (!Array.isArray(batch.items)) {
      batch.items = [];
      changed = true;
    }
    if (batch.status === "open") {
      batch.status = "in_progress";
      batch.startedAt = batch.startedAt || batch.createdAt;
      changed = true;
    }
  }
  if (changed) await writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

async function readDb() {
  await ensureDb();
  return JSON.parse(await readFile(DB_FILE, "utf8"));
}

async function writeDb(data) {
  await writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function parseBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("请求体必须是合法JSON");
    error.status = 400;
    throw error;
  }
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function required(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === "");
  if (missing.length) {
    const error = new Error(`缺少字段：${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }
}

function fail(status, message, extra) {
  const error = new Error(message);
  error.status = status;
  error.extra = extra;
  return error;
}

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function readColorLab(body) {
  const lab = body.colorLab;
  if (!lab || typeof lab !== "object" || ["l", "a", "b"].some((key) => typeof lab[key] !== "number")) {
    throw fail(400, "colorLab必须是包含 l/a,b 三个数值的对象");
  }
  return { l: lab.l, a: lab.a, b: lab.b };
}

function readIsoDate(value, field) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw fail(400, `${field}必须是合法时间`);
  return new Date(time).toISOString();
}

// 纤维方向是轴向角度，0°和180°同向
function fiberDirectionDiff(a, b) {
  const diff = Math.abs(a - b) % 180;
  return Math.min(diff, 180 - diff);
}

function colorDiff(a, b) {
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

const SORT_KEYS = [
  { raw: "fiberRaw", label: "纤维方向差", format: (candidate) => `${candidate.fiberDiff}°` },
  { raw: "colorRaw", label: "色差", format: (candidate) => `${candidate.colorDiff}` },
  { raw: "thicknessRaw", label: "厚度差", format: (candidate) => `${candidate.thicknessDiff}mm` }
];

function buildRankReason(candidate, previous) {
  const base =
    `纤维方向差${candidate.fiberDiff}°、色差${candidate.colorDiff}、厚度差${candidate.thicknessDiff}mm，` +
    `入库${candidate.storedAt.slice(0, 10)}，排第${candidate.rank}名`;
  if (!previous) {
    return `${base}：三项差值综合最小，作为首选。排序规则：${RANKING_RULE}。`;
  }
  for (let index = 0; index < SORT_KEYS.length; index += 1) {
    const key = SORT_KEYS[index];
    const earlierKeys = SORT_KEYS.slice(0, index);
    const sameEarlier = earlierKeys.every((item) => candidate[item.raw] === previous[item.raw]);
    if (sameEarlier && candidate[key.raw] > previous[key.raw]) {
      const sameText = index === 0 ? "" : `前${index}项差值与第${previous.rank}名相同，`;
      return `${base}：${sameText}${key.label}更大（${key.format(candidate)} > ${key.format(previous)}），故排其后。`;
    }
  }
  if (candidate.storedAt > previous.storedAt) {
    return `${base}：三项差值与第${previous.rank}名完全相同，入库时间更晚（${candidate.storedAt.slice(0, 10)} 晚于 ${previous.storedAt.slice(0, 10)}），按入库早者优先排其后。`;
  }
  return `${base}：三项差值与入库时间均与第${previous.rank}名相同，按纸样编号次序排其后。`;
}

// 由拓片基准参数和三张候选纸样计算差值并排序，结果即排序理由
function rankCandidates(rubbing, papers) {
  const entries = papers.map((paper) => {
    const fiberRaw = fiberDirectionDiff(rubbing.fiberDirection, paper.fiberDirection);
    const colorRaw = colorDiff(rubbing.colorLab, paper.colorLab);
    const thicknessRaw = Math.abs(rubbing.thickness - paper.thickness);
    return {
      paper,
      fiberRaw,
      colorRaw,
      thicknessRaw
    };
  });
  entries.sort((x, y) => {
    return (
      x.fiberRaw - y.fiberRaw ||
      x.colorRaw - y.colorRaw ||
      x.thicknessRaw - y.thicknessRaw ||
      x.paper.storedAt.localeCompare(y.paper.storedAt) ||
      x.paper.id.localeCompare(y.paper.id)
    );
  });
  const ranked = entries.map((entry, index) => ({
    paperId: entry.paper.id,
    paperCode: entry.paper.code,
    paperName: entry.paper.name,
    warehouse: entry.paper.warehouse,
    storedAt: entry.paper.storedAt,
    paperFiberDirection: entry.paper.fiberDirection,
    paperColorLab: { ...entry.paper.colorLab },
    paperThickness: entry.paper.thickness,
    fiberDiff: round(entry.fiberRaw, 1),
    colorDiff: round(entry.colorRaw, 2),
    thicknessDiff: round(entry.thicknessRaw, 3),
    fiberRaw: entry.fiberRaw,
    colorRaw: entry.colorRaw,
    thicknessRaw: entry.thicknessRaw,
    rank: index + 1
  }));
  ranked.forEach((candidate, index) => {
    candidate.rankReason = buildRankReason(candidate, index === 0 ? null : ranked[index - 1]);
  });
  ranked.forEach((candidate) => {
    delete candidate.fiberRaw;
    delete candidate.colorRaw;
    delete candidate.thicknessRaw;
  });
  return ranked;
}

function findRubbing(db, rubbingId) {
  const rubbing = db.rubbings.find((item) => item.id === rubbingId);
  if (!rubbing) throw fail(404, "拓片不存在");
  return rubbing;
}

function findDamage(db, damageId) {
  const damage = db.damages.find((item) => item.id === damageId);
  if (!damage) throw fail(404, "缺损项不存在");
  return damage;
}

function getTrialMatch(db, damageId) {
  return db.trialMatches.find((item) => item.damageId === damageId) || null;
}

function activeItems(batch) {
  return batch.items.filter((item) => item.status !== "replaced");
}

function findActiveItem(batch, damageId) {
  return batch.items.find((item) => item.damageId === damageId && item.status !== "replaced") || null;
}

function findOpenBatchForDamage(db, damageId, excludeBatchId) {
  return (
    db.batches.find(
      (batch) =>
        batch.status !== "completed" &&
        batch.id !== excludeBatchId &&
        batch.items.some((item) => item.damageId === damageId && item.status !== "replaced")
    ) || null
  );
}

function findOpenBatchForPaper(db, paperId, excludeBatchId) {
  return (
    db.batches.find(
      (batch) =>
        batch.status !== "completed" &&
        batch.id !== excludeBatchId &&
        batch.items.some((item) => item.paperId === paperId && item.status !== "replaced")
    ) || null
  );
}

// 建批与重新开工时共用：把确认后的选择连同排序理由冻结成批次明细
function freezeItem(db, damage, match) {
  const candidate = match.candidates.find((item) => item.paperId === match.selectedPaperId);
  return {
    damageId: damage.id,
    paperId: candidate.paperId,
    paperCode: candidate.paperCode,
    paperName: candidate.paperName,
    warehouse: candidate.warehouse,
    paperSnapshot: {
      paperId: candidate.paperId,
      code: candidate.paperCode,
      name: candidate.paperName,
      warehouse: candidate.warehouse,
      fiberDirection: candidate.paperFiberDirection,
      colorLab: { ...candidate.paperColorLab },
      thickness: candidate.paperThickness,
      storedAt: candidate.storedAt
    },
    selectedRank: candidate.rank,
    rankingRule: RANKING_RULE,
    ranking: match.candidates,
    rankingReason: candidate.rankReason,
    confirmedAt: match.confirmedAt,
    status: "active",
    frozenAt: new Date().toISOString(),
    replacedAt: null,
    replaceReason: null
  };
}

function trialMatchView(db, damage) {
  const match = getTrialMatch(db, damage.id);
  const rubbing = db.rubbings.find((item) => item.id === damage.rubbingId);
  const activeBatch = damage.batchId
    ? db.batches.find((batch) => batch.id === damage.batchId && findActiveItem(batch, damage.id))
    : null;
  return {
    damage: {
      id: damage.id,
      rubbingId: damage.rubbingId,
      position: damage.position,
      type: damage.type,
      status: damage.status,
      batchId: damage.batchId
    },
    rubbingReference: {
      rubbingId: rubbing.id,
      rubbingCode: rubbing.code,
      warehouse: rubbing.warehouse,
      fiberDirection: rubbing.fiberDirection,
      colorLab: { ...rubbing.colorLab },
      thickness: rubbing.thickness
    },
    status: match ? match.status : "pending",
    candidates: match ? match.candidates : [],
    selectedPaperId: match ? match.selectedPaperId : null,
    selectedRank:
      match && match.selectedPaperId
        ? (match.candidates.find((item) => item.paperId === match.selectedPaperId) || {}).rank || null
        : null,
    confirmedAt: match ? match.confirmedAt : null,
    frozenIn: activeBatch
      ? {
          batchId: activeBatch.id,
          batchName: activeBatch.name,
          batchStatus: activeBatch.status,
          paperId: findActiveItem(activeBatch, damage.id).paperId,
          paperCode: findActiveItem(activeBatch, damage.id).paperCode,
          frozenAt: findActiveItem(activeBatch, damage.id).frozenAt
        }
      : null,
    history: match ? match.history : []
  };
}

function enrichBatch(db, batch) {
  const items = activeItems(batch);
  const damages = db.damages.filter((item) => batch.damageIds.includes(item.id));
  return {
    ...batch,
    damages,
    total: items.length,
    repaired: items.filter((item) => item.status === "completed").length,
    pending: items.filter((item) => item.status !== "completed").length,
    awaitingRetrial: batch.damageIds.filter(
      (damageId) => !batch.items.some((item) => item.damageId === damageId && item.status !== "replaced")
    )
  };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const db = await readDb();

  if (req.method === "GET" && pathname === "/health") {
    return send(res, 200, { ok: true, service: "rubbing-repair-api", routes });
  }

  if (req.method === "GET" && pathname === "/rubbings") {
    const data = db.rubbings.map((rubbing) => {
      const damages = db.damages.filter((item) => item.rubbingId === rubbing.id);
      return {
        ...rubbing,
        damageCount: damages.length,
        pendingDamages: damages.filter((item) => item.status !== "repaired").length
      };
    });
    return send(res, 200, { data });
  }

  if (req.method === "POST" && pathname === "/rubbings") {
    const body = await parseBody(req);
    required(body, ["code", "source", "paperSize", "warehouse", "fiberDirection", "thickness"]);
    const colorLab = readColorLab(body);
    if (typeof body.fiberDirection !== "number" || typeof body.thickness !== "number") {
      throw fail(400, "fiberDirection 和 thickness 必须是数值");
    }
    const rubbing = {
      id: makeId("rubbing"),
      code: body.code,
      source: body.source,
      paperSize: body.paperSize,
      note: body.note || "",
      warehouse: body.warehouse,
      fiberDirection: body.fiberDirection,
      colorLab,
      thickness: body.thickness,
      createdAt: new Date().toISOString()
    };
    db.rubbings.push(rubbing);
    await writeDb(db);
    return send(res, 201, { data: rubbing });
  }

  const rubbingDamagesMatch = pathname.match(/^\/rubbings\/([^/]+)\/damages$/);
  if (rubbingDamagesMatch && req.method === "GET") {
    const rubbingId = rubbingDamagesMatch[1];
    findRubbing(db, rubbingId);
    return send(res, 200, { data: db.damages.filter((item) => item.rubbingId === rubbingId) });
  }

  if (rubbingDamagesMatch && req.method === "POST") {
    const rubbingId = rubbingDamagesMatch[1];
    findRubbing(db, rubbingId);
    const body = await parseBody(req);
    required(body, ["position", "type", "beforePhotoUrl"]);
    const damage = {
      id: makeId("damage"),
      rubbingId,
      position: body.position,
      type: body.type,
      beforePhotoUrl: body.beforePhotoUrl,
      afterPhotoUrl: "",
      status: "pending",
      repairNote: "",
      batchId: null,
      createdAt: new Date().toISOString(),
      repairedAt: null
    };
    db.damages.push(damage);
    await writeDb(db);
    return send(res, 201, { data: damage });
  }

  if (req.method === "GET" && pathname === "/damages") {
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const data = db.damages.filter((item) => (!status || item.status === status) && (!type || item.type === type));
    return send(res, 200, { data });
  }

  const damagePatchMatch = pathname.match(/^\/damages\/([^/]+)$/);
  if (damagePatchMatch && req.method === "PATCH") {
    const damage = db.damages.find((item) => item.id === damagePatchMatch[1]);
    if (!damage) return send(res, 404, { error: "缺损项不存在" });
    const body = await parseBody(req);
    Object.assign(damage, {
      position: body.position ?? damage.position,
      type: body.type ?? damage.type,
      beforePhotoUrl: body.beforePhotoUrl ?? damage.beforePhotoUrl,
      afterPhotoUrl: body.afterPhotoUrl ?? damage.afterPhotoUrl,
      status: body.status ?? damage.status,
      repairNote: body.repairNote ?? damage.repairNote
    });
    damage.repairedAt = damage.status === "repaired" ? new Date().toISOString() : damage.repairedAt;
    await writeDb(db);
    return send(res, 200, { data: damage });
  }

  if (req.method === "GET" && pathname === "/papers") {
    const warehouse = url.searchParams.get("warehouse");
    const data = db.papers.filter((paper) => !warehouse || paper.warehouse === warehouse);
    return send(res, 200, { data });
  }

  if (req.method === "POST" && pathname === "/papers") {
    const body = await parseBody(req);
    required(body, ["code", "name", "warehouse", "fiberDirection", "thickness", "storedAt"]);
    const colorLab = readColorLab(body);
    if (typeof body.fiberDirection !== "number" || typeof body.thickness !== "number") {
      throw fail(400, "fiberDirection 和 thickness 必须是数值");
    }
    const paper = {
      id: makeId("paper"),
      code: body.code,
      name: body.name,
      warehouse: body.warehouse,
      fiberDirection: body.fiberDirection,
      colorLab,
      thickness: body.thickness,
      storedAt: readIsoDate(body.storedAt, "storedAt"),
      createdAt: new Date().toISOString()
    };
    db.papers.push(paper);
    await writeDb(db);
    return send(res, 201, { data: paper });
  }

  const trialMatchMatch = pathname.match(/^\/damages\/([^/]+)\/trial-match$/);

  if (trialMatchMatch && req.method === "GET") {
    const damage = findDamage(db, trialMatchMatch[1]);
    return send(res, 200, { data: trialMatchView(db, damage) });
  }

  // 登记三张候选纸样：服务端按拓片基准算差值、排序并写排序理由
  if (trialMatchMatch && req.method === "PUT") {
    const damage = findDamage(db, trialMatchMatch[1]);
    const rubbing = findRubbing(db, damage.rubbingId);
    const body = await parseBody(req);
    const paperIds = body.paperIds;
    if (!Array.isArray(paperIds) || paperIds.length !== 3) {
      throw fail(400, "每项缺损必须登记恰好三张候选纸样（paperIds 长度为3）");
    }
    if (new Set(paperIds).size !== 3) {
      throw fail(400, "三张候选纸样不能重复");
    }
    const missing = paperIds.filter((id) => !db.papers.find((paper) => paper.id === id));
    if (missing.length) throw fail(400, `纸样不存在：${missing.join(", ")}`);
    const busyBatch =
      db.batches.find(
        (batch) =>
          batch.status === "in_progress" &&
          batch.items.some((item) => item.damageId === damage.id && item.status !== "replaced")
      ) || null;
    if (busyBatch) {
      throw fail(400, `缺损已在开工批次「${busyBatch.name}」中，请走批次换纸样流程，不能直接改试配`);
    }
    const papers = paperIds.map((id) => db.papers.find((paper) => paper.id === id));
    const candidates = rankCandidates(rubbing, papers);
    const now = new Date().toISOString();
    let match = getTrialMatch(db, damage.id);
    if (!match) {
      match = {
        id: makeId("trial"),
        damageId: damage.id,
        status: "pending",
        candidates: [],
        selectedPaperId: null,
        confirmedAt: null,
        history: []
      };
      db.trialMatches.push(match);
    }
    match.history.push({
      at: now,
      action: "registered",
      candidates: match.candidates.length ? match.candidates : null,
      newCandidates: candidates
    });
    match.candidates = candidates;
    match.status = "pending";
    match.selectedPaperId = null;
    match.confirmedAt = null;
    await writeDb(db);
    return send(res, 200, { data: trialMatchView(db, damage) });
  }

  const trialConfirmMatch = pathname.match(/^\/damages\/([^/]+)\/trial-match\/confirm$/);
  if (trialConfirmMatch && req.method === "POST") {
    const damage = findDamage(db, trialConfirmMatch[1]);
    const match = getTrialMatch(db, damage.id);
    if (!match || match.candidates.length !== 3) {
      throw fail(400, "尚未登记三张候选纸样，不能确认试配");
    }
    const body = await parseBody(req);
    const paperId = body.paperId || match.candidates[0].paperId;
    if (!match.candidates.some((candidate) => candidate.paperId === paperId)) {
      throw fail(400, "确认的纸样不在三张候选纸样之内");
    }
    const now = new Date().toISOString();
    match.status = "confirmed";
    match.selectedPaperId = paperId;
    match.confirmedAt = now;
    match.history.push({
      at: now,
      action: "confirmed",
      paperId,
      paperCode: match.candidates.find((candidate) => candidate.paperId === paperId).paperCode,
      rank: match.candidates.find((candidate) => candidate.paperId === paperId).rank,
      operatorNote: body.operatorNote || ""
    });
    await writeDb(db);
    return send(res, 200, { data: trialMatchView(db, damage) });
  }

  if (req.method === "GET" && pathname === "/batches") {
    return send(res, 200, { data: db.batches.map((batch) => enrichBatch(db, batch)) });
  }

  // 建批：只收已确认试配的缺损，冻结选中纸样与排序理由，批次待开工
  if (req.method === "POST" && pathname === "/batches") {
    const body = await parseBody(req);
    required(body, ["name", "damageIds"]);
    if (!Array.isArray(body.damageIds) || body.damageIds.length === 0) {
      throw fail(400, "damageIds必须是非空数组");
    }
    const invalid = body.damageIds.filter((id) => !db.damages.find((damage) => damage.id === id));
    if (invalid.length) throw fail(400, `缺损项不存在：${invalid.join(", ")}`);
    const problems = [];
    for (const damageId of body.damageIds) {
      const damage = db.damages.find((item) => item.id === damageId);
      const reasons = [];
      const otherBatch = findOpenBatchForDamage(db, damageId, null);
      if (otherBatch) reasons.push(`缺损已在未结批次「${otherBatch.name}」中`);
      const match = getTrialMatch(db, damageId);
      if (!match || match.status !== "confirmed" || !match.selectedPaperId) {
        reasons.push("试配未确认");
      }
      if (reasons.length) {
        problems.push({ damageId, position: damage.position, reasons });
      }
    }
    if (problems.length) {
      throw fail(400, "存在不能建批的缺损项", { problems });
    }
    const now = new Date().toISOString();
    const batch = {
      id: makeId("batch"),
      name: body.name,
      status: "ready",
      damageIds: body.damageIds,
      items: body.damageIds.map((damageId) => {
        const damage = db.damages.find((item) => item.id === damageId);
        const match = getTrialMatch(db, damageId);
        return freezeItem(db, damage, match);
      }),
      note: body.note || "",
      createdAt: now,
      startedAt: null,
      completedAt: null
    };
    db.batches.push(batch);
    for (const damageId of body.damageIds) {
      const damage = db.damages.find((item) => item.id === damageId);
      const match = getTrialMatch(db, damageId);
      damage.batchId = batch.id;
      damage.status = "ready";
      match.history.push({
        at: now,
        action: "frozen",
        batchId: batch.id,
        batchName: batch.name,
        paperId: match.selectedPaperId
      });
    }
    await writeDb(db);
    return send(res, 201, { data: enrichBatch(db, batch) });
  }

  const batchMatch = pathname.match(/^\/batches\/([^/]+)$/);
  if (batchMatch && req.method === "GET") {
    const batch = db.batches.find((item) => item.id === batchMatch[1]);
    if (!batch) return send(res, 404, { error: "修补批次不存在" });
    return send(res, 200, { data: enrichBatch(db, batch) });
  }

  // 开工：逐项校验试配确认、同库房、未被其他未结批次占用；任一不过则说明原因且不开工
  const startMatch = pathname.match(/^\/batches\/([^/]+)\/start$/);
  if (startMatch && req.method === "POST") {
    const batch = db.batches.find((item) => item.id === startMatch[1]);
    if (!batch) return send(res, 404, { error: "修补批次不存在" });
    if (batch.status === "completed") throw fail(400, "批次已完结，不能开工");

    // 换纸样后重新试配确认的缺损，重启时在此重新冻结
    for (const damageId of batch.damageIds) {
      const damage = db.damages.find((item) => item.id === damageId);
      const match = getTrialMatch(db, damageId);
      const active = findActiveItem(batch, damageId);
      // 退回待试配后重新确认，或建批后开工前改了试配选择：冻结最新选择
      if ((!active || (match && match.status === "confirmed" && match.selectedPaperId !== active.paperId))
        && match && match.status === "confirmed" && match.selectedPaperId) {
        if (active) {
          active.status = "replaced";
          active.replacedAt = new Date().toISOString();
          active.replaceReason = "开工前试配选择变更，冻结最新选择";
        }
        const item = freezeItem(db, damage, match);
        batch.items.push(item);
        damage.status = "ready";
        match.history.push({
          at: new Date().toISOString(),
          action: "frozen",
          batchId: batch.id,
          batchName: batch.name,
          paperId: match.selectedPaperId,
          note: active ? "换纸样后重新开工冻结" : "冻结最新试配选择"
        });
      }
    }

    const problems = [];
    for (const damageId of batch.damageIds) {
      const damage = db.damages.find((target) => target.id === damageId);
      const rubbing = findRubbing(db, damage.rubbingId);
      const reasons = [];
      const match = getTrialMatch(db, damageId);
      const item = findActiveItem(batch, damageId);
      if (!item) {
        reasons.push("试配未确认（缺损已退回待试配，需重新登记候选并确认）");
      } else if (!match || match.status !== "confirmed" || match.selectedPaperId !== item.paperId) {
        reasons.push("试配未确认");
      }
      if (item) {
        const paper = db.papers.find((target) => target.id === item.paperId);
        if (!paper) {
          reasons.push(`纸样 ${item.paperCode} 的档案已不存在`);
        } else {
          if (paper.warehouse !== rubbing.warehouse) {
            reasons.push(`不在同库房：纸样在「${paper.warehouse}」，拓片在「${rubbing.warehouse}」`);
          }
          const occupier = findOpenBatchForPaper(db, item.paperId, batch.id);
          if (occupier) {
            reasons.push(`纸样 ${item.paperCode} 被别的未结批次「${occupier.name}」（${occupier.id}）占用`);
          }
        }
      }
      if (reasons.length) {
        problems.push({
          damageId: damage.id,
          position: damage.position,
          paperId: item ? item.paperId : null,
          paperCode: item ? item.paperCode : null,
          reasons
        });
      }
    }
    if (problems.length) {
      return send(res, 409, { error: "开工校验未通过，不能开工", problems });
    }

    batch.status = "in_progress";
    if (!batch.startedAt) batch.startedAt = new Date().toISOString();
    for (const item of activeItems(batch)) {
      const damage = db.damages.find((target) => target.id === item.damageId);
      damage.status = "in_repair";
    }
    await writeDb(db);
    return send(res, 200, { data: enrichBatch(db, batch) });
  }

  // 开工后换纸样：仅相关缺损退回待试配，旧冻结记录留档，其他项留在原批次
  const reselectMatch = pathname.match(/^\/batches\/([^/]+)\/items\/([^/]+)\/reselect$/);
  if (reselectMatch && req.method === "POST") {
    const batch = db.batches.find((item) => item.id === reselectMatch[1]);
    if (!batch) return send(res, 404, { error: "修补批次不存在" });
    const damageId = reselectMatch[2];
    const item = findActiveItem(batch, damageId);
    if (!item) return send(res, 404, { error: "该缺损不在此批次的开工明细中" });
    if (batch.status !== "in_progress") {
      throw fail(400, "批次尚未开工，不能换纸样；可直接修改试配后重建批次");
    }
    const body = await parseBody(req);
    const damage = findDamage(db, damageId);
    const match = getTrialMatch(db, damageId);
    const now = new Date().toISOString();

    item.status = "replaced";
    item.replacedAt = now;
    item.replaceReason = body.reason || "师傅开工后要求更换补纸";

    if (match) {
      match.history.push({
        at: now,
        action: "released_for_reselect",
        batchId: batch.id,
        batchName: batch.name,
        reason: item.replaceReason,
        previousSelection: {
          paperId: item.paperId,
          paperCode: item.paperCode,
          paperName: item.paperName,
          selectedRank: item.selectedRank,
          ranking: item.ranking,
          rankingReason: item.rankingReason,
          frozenAt: item.frozenAt
        }
      });
      match.status = "pending";
      match.candidates = [];
      match.selectedPaperId = null;
      match.confirmedAt = null;
    }
    damage.status = "pending";
    // batchId 保留：重新试配确认后仍回到本批次，旧选择在试配历史中可查
    await writeDb(db);
    return send(res, 200, { data: enrichBatch(db, batch) });
  }

  const completeMatch = pathname.match(/^\/batches\/([^/]+)\/complete$/);
  if (completeMatch && req.method === "POST") {
    const batch = db.batches.find((item) => item.id === completeMatch[1]);
    if (!batch) return send(res, 404, { error: "修补批次不存在" });
    if (batch.status !== "in_progress") throw fail(400, "批次尚未开工，不能完结");
    const awaiting = batch.damageIds.filter((damageId) => !findActiveItem(batch, damageId));
    if (awaiting.length) {
      throw fail(400, `缺损 ${awaiting.join(", ")} 已退回待试配，需重新试配并开工后才能完结批次`);
    }
    const body = await parseBody(req);
    const results = Array.isArray(body.results) ? body.results : [];
    batch.status = "completed";
    batch.completedAt = new Date().toISOString();
    batch.note = body.note ?? batch.note;
    for (const item of activeItems(batch)) {
      const damage = db.damages.find((target) => target.id === item.damageId);
      const result = results.find((entry) => entry.damageId === damage.id) || {};
      item.status = "completed";
      item.completedAt = batch.completedAt;
      damage.status = "repaired";
      damage.afterPhotoUrl = result.afterPhotoUrl || body.defaultAfterPhotoUrl || damage.afterPhotoUrl;
      damage.repairNote = result.repairNote || body.defaultRepairNote || damage.repairNote;
      damage.repairedAt = batch.completedAt;
    }
    await writeDb(db);
    return send(res, 200, { data: enrichBatch(db, batch) });
  }

  return send(res, 404, { error: "接口不存在", routes });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    const body = { error: error.message || "服务器错误" };
    if (error.extra) Object.assign(body, error.extra);
    send(res, error.status || 500, body);
  });
});

server.listen(PORT, () => {
  console.log(`Rubbing repair API running at http://127.0.0.1:${PORT}`);
});
