const http = require("http");
const { readFile, writeFile, mkdir } = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3020);
const DB_FILE = path.join(__dirname, "data", "db.json");

const SORT_RULE =
  "排序规则：纤维方向差升序 → 色差(ΔE)升序 → 厚度差升序；三项差值全部相同时，入库时间早者优先；排序第1的纸样为选中纸样";

const seedPaperSamples = [
  {
    id: "ps_demo_a",
    code: "ZY-BK-001",
    name: "棉料宣纸样",
    warehouse: "北库",
    fiberAngle: 10,
    color: { l: 79, a: 3, b: 13 },
    thicknessMm: 0.12,
    receivedAt: "2026-06-01T09:00:00.000Z",
    note: "六月初入库"
  },
  {
    id: "ps_demo_b",
    code: "ZY-BK-014",
    name: "净皮宣纸样",
    warehouse: "北库",
    fiberAngle: 5,
    color: { l: 80, a: 4, b: 14 },
    thicknessMm: 0.13,
    receivedAt: "2026-06-05T09:00:00.000Z",
    note: ""
  },
  {
    id: "ps_demo_c",
    code: "ZY-BK-021",
    name: "仿古宣纸样",
    warehouse: "北库",
    fiberAngle: 12,
    color: { l: 74, a: 5, b: 18 },
    thicknessMm: 0.15,
    receivedAt: "2026-06-10T09:00:00.000Z",
    note: "色偏深"
  },
  {
    id: "ps_demo_d",
    code: "ZY-NK-007",
    name: "竹纸样",
    warehouse: "南库",
    fiberAngle: 8,
    color: { l: 78, a: 3, b: 12 },
    thicknessMm: 0.12,
    receivedAt: "2026-06-02T09:00:00.000Z",
    note: "在南库，用于同库房校验演示"
  },
  {
    id: "ps_demo_e",
    code: "ZY-BK-030",
    name: "粉连纸样（早入库）",
    warehouse: "北库",
    fiberAngle: 10,
    color: { l: 79, a: 3, b: 13 },
    thicknessMm: 0.12,
    receivedAt: "2026-06-20T09:00:00.000Z",
    note: "与ZY-BK-031三项差值相同"
  },
  {
    id: "ps_demo_f",
    code: "ZY-BK-031",
    name: "粉连纸样（晚入库）",
    warehouse: "北库",
    fiberAngle: 10,
    color: { l: 79, a: 3, b: 13 },
    thicknessMm: 0.12,
    receivedAt: "2026-06-22T09:00:00.000Z",
    note: "与ZY-BK-030三项差值相同"
  },
  {
    id: "ps_demo_g",
    code: "ZY-BK-045",
    name: "皮纸样",
    warehouse: "北库",
    fiberAngle: 90,
    color: { l: 70, a: 6, b: 20 },
    thicknessMm: 0.18,
    receivedAt: "2026-06-25T09:00:00.000Z",
    note: "纤维方向差较大"
  }
];

const initialData = {
  rubbings: [
    {
      id: "rubbing_demo",
      code: "TP-清-014",
      source: "地方碑刻残页",
      paperSize: "42x68cm",
      warehouse: "北库",
      fiberAngle: 8,
      color: { l: 78, a: 3, b: 12 },
      thicknessMm: 0.12,
      note: "边缘有旧折痕",
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
      trialId: null,
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
      trialId: null,
      createdAt: new Date().toISOString(),
      repairedAt: null
    }
  ],
  paperSamples: seedPaperSamples,
  trials: [],
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
  "GET /paper-samples?warehouse=",
  "POST /paper-samples",
  "POST /damages/:id/trial",
  "POST /damages/:id/trial/confirm",
  "GET /damages/:id/trial",
  "GET /batches",
  "POST /batches",
  "GET /batches/:id",
  "POST /batches/:id/swap-paper",
  "POST /batches/:id/complete"
];

async function ensureDb() {
  await mkdir(path.dirname(DB_FILE), { recursive: true });
  try {
    return JSON.parse(await readFile(DB_FILE, "utf8"));
  } catch {
    await writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
    return JSON.parse(JSON.stringify(initialData));
  }
}

// 老数据补齐新集合与新字段，并注入演示纸样
function migrate(db) {
  let changed = false;
  if (!Array.isArray(db.paperSamples)) {
    db.paperSamples = seedPaperSamples;
    changed = true;
  }
  if (!Array.isArray(db.trials)) {
    db.trials = [];
    changed = true;
  }
  if (!Array.isArray(db.batches)) db.batches = [];
  for (const rubbing of db.rubbings || []) {
    for (const field of ["warehouse", "fiberAngle", "color", "thicknessMm"]) {
      if (rubbing[field] === undefined) {
        rubbing[field] = initialData.rubbings[0][field];
        changed = true;
      }
    }
  }
  for (const damage of db.damages || []) {
    if (!("trialId" in damage)) {
      damage.trialId = null;
      changed = true;
    }
  }
  for (const batch of db.batches) {
    if (!Array.isArray(batch.items)) {
      batch.items = batch.damageIds
        ? batch.damageIds.map((damageId) => ({ damageId, status: "active", returnedAt: null }))
        : [];
      changed = true;
    }
  }
  return changed;
}

async function readDb() {
  const db = await ensureDb();
  if (migrate(db)) await writeFile(DB_FILE, JSON.stringify(db, null, 2));
  return db;
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

function findRubbing(db, rubbingId) {
  const rubbing = db.rubbings.find((item) => item.id === rubbingId);
  if (!rubbing) {
    const error = new Error("拓片不存在");
    error.status = 404;
    throw error;
  }
  return rubbing;
}

function findDamage(db, damageId) {
  const damage = db.damages.find((item) => item.id === damageId);
  if (!damage) {
    const error = new Error("缺损项不存在");
    error.status = 404;
    throw error;
  }
  return damage;
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

// 纤维方向以180°为周期，取最小夹角
function fiberDiff(a, b) {
  const d = Math.abs(a - b) % 180;
  return round(Math.min(d, 180 - d), 2);
}

// CIE76 色差 ΔE
function colorDiff(c1, c2) {
  return round(Math.hypot(c1.l - c2.l, c1.a - c2.a, c1.b - c2.b), 2);
}

function thicknessDiff(t1, t2) {
  return round(Math.abs(t1 - t2), 3);
}

function fmtThickness(value) {
  return value.toFixed(3);
}

function rankReason(index, entry, prev) {
  if (index === 0) {
    return `排序第1并自动选中：纤维方向差${entry.fiberDiff}°、色差${entry.colorDiff}、厚度差${fmtThickness(
      entry.thicknessDiff
    )}mm，三项按规则比较后居首`;
  }
  if (entry.fiberDiff !== prev.fiberDiff) {
    return `纤维方向差${entry.fiberDiff}° 大于前一名${prev.fiberDiff}°，排在其后`;
  }
  if (entry.colorDiff !== prev.colorDiff) {
    return `纤维方向差相同（${entry.fiberDiff}°），色差${entry.colorDiff} 大于前一名${prev.colorDiff}，排在其后`;
  }
  if (entry.thicknessDiff !== prev.thicknessDiff) {
    return `纤维方向差、色差相同（${entry.fiberDiff}°/${entry.colorDiff}），厚度差${fmtThickness(
      entry.thicknessDiff
    )}mm 大于前一名${fmtThickness(prev.thicknessDiff)}mm，排在其后`;
  }
  if (new Date(entry.receivedAt).getTime() !== new Date(prev.receivedAt).getTime()) {
    return `三项差值全部相同（${entry.fiberDiff}°/${entry.colorDiff}/${fmtThickness(
      entry.thicknessDiff
    )}mm），入库时间${entry.receivedAt.slice(0, 10)}晚于前一名${prev.receivedAt.slice(
      0,
      10
    )}，按入库早者优先排在其后`;
  }
  return "各项指标均相同，按编号稳定排序";
}

function buildRanking(db, rubbing, sampleIds) {
  const samples = sampleIds.map((sampleId) => {
    const sample = db.paperSamples.find((item) => item.id === sampleId);
    if (!sample) {
      const error = new Error(`纸样不存在：${sampleId}`);
      error.status = 400;
      throw error;
    }
    return sample;
  });
  const ranked = samples
    .map((sample) => ({
      sampleId: sample.id,
      code: sample.code,
      name: sample.name,
      warehouse: sample.warehouse,
      receivedAt: sample.receivedAt,
      fiberDiff: fiberDiff(rubbing.fiberAngle, sample.fiberAngle),
      colorDiff: colorDiff(rubbing.color, sample.color),
      thicknessDiff: thicknessDiff(rubbing.thicknessMm, sample.thicknessMm)
    }))
    .sort((a, b) => {
      return (
        a.fiberDiff - b.fiberDiff ||
        a.colorDiff - b.colorDiff ||
        a.thicknessDiff - b.thicknessDiff ||
        new Date(a.receivedAt) - new Date(b.receivedAt) ||
        a.sampleId.localeCompare(b.sampleId)
      );
    });
  ranked.forEach((entry, index) => {
    entry.rank = index + 1;
    entry.reason = rankReason(index, entry, ranked[index - 1]);
  });
  return ranked;
}

function currentTrial(db, damage) {
  return db.trials.find((trial) => trial.id === damage.trialId) || null;
}

function openBatchOf(db, batchId) {
  const batch = db.batches.find((item) => item.id === batchId);
  return batch && batch.status === "open" ? batch : null;
}

// 纸样是否被“别的未结批次”的在用项占用
function occupiedByOtherBatch(db, sampleId, selfBatchId) {
  for (const batch of db.batches) {
    if (batch.status !== "open" || batch.id === selfBatchId) continue;
    const occupied = (batch.items || []).some(
      (item) => item.status === "active" && item.selectedSampleId === sampleId
    );
    if (occupied) return batch;
  }
  return null;
}

// 建批/开工前逐项校验，任何一项不过都不能开工
function validateBatchStart(db, damageIds) {
  const blocks = [];
  for (const damageId of damageIds) {
    const damage = findDamage(db, damageId);
    const reasons = [];
    const rubbing = db.rubbings.find((item) => item.id === damage.rubbingId);
    const position = `${rubbing ? rubbing.code : damage.rubbingId} / ${damage.position}`;

    const inOpenBatch = damage.batchId && openBatchOf(db, damage.batchId);
    if (inOpenBatch) {
      reasons.push(`缺损已在未结批次「${inOpenBatch.name}」中，不能重复开工`);
    }

    const trial = currentTrial(db, damage);
    let selected = null;
    if (!trial) {
      reasons.push("未登记试配记录（每项缺损须登记三张候选纸样）");
    } else if (trial.status !== "confirmed") {
      reasons.push("试配未确认");
    } else {
      selected = trial.ranking.find((entry) => entry.sampleId === trial.selectedId);
      if (selected.warehouse !== rubbing.warehouse) {
        reasons.push(
          `选中纸样${selected.code}在「${selected.warehouse}」，与拓片所在库房「${rubbing.warehouse}」不同，不在同库房`
        );
      }
      // 已在未结批次时上面的重复开工提示已足够，不再叠加占用提示
      if (!inOpenBatch) {
        const occupier = occupiedByOtherBatch(db, selected.sampleId, null);
        if (occupier) {
          reasons.push(`选中纸样${selected.code}已被别的未结批次「${occupier.name}」占用`);
        }
      }
    }

    if (reasons.length) blocks.push({ damageId, position, reasons });
  }
  return blocks;
}

function freezeTrialItem(db, trial, damage) {
  const selected = trial.ranking.find((entry) => entry.sampleId === trial.selectedId);
  return {
    damageId: damage.id,
    status: "active",
    trialId: trial.id,
    warehouse: selected.warehouse,
    selectedSampleId: selected.sampleId,
    selectedSampleCode: selected.code,
    selectedSampleName: selected.name,
    selectedReceivedAt: selected.receivedAt,
    confirmedAt: trial.confirmedAt,
    frozenAt: new Date().toISOString(),
    sortRule: SORT_RULE,
    target: { ...trial.target },
    ranking: trial.ranking.map((entry) => ({ ...entry })),
    returnedAt: null,
    swapReason: "",
    suggestedSampleId: null
  };
}

function enrichBatch(db, batch) {
  const items = (batch.items || []).map((item) => {
    const damage = db.damages.find((d) => d.id === item.damageId) || null;
    const selectedSample = item.selectedSampleId
      ? db.paperSamples.find((s) => s.id === item.selectedSampleId) || null
      : null;
    return { ...item, damage, selectedSample };
  });
  const active = items.filter((item) => item.status === "active");
  return {
    ...batch,
    items,
    total: items.length,
    activeCount: active.length,
    returnedCount: items.filter((item) => item.status === "returned").length,
    repaired: active.filter((item) => item.damage && item.damage.status === "repaired").length
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
    required(body, ["code", "source", "paperSize"]);
    if (body.warehouse === undefined || body.warehouse === "") {
      return send(res, 400, { error: "缺少字段：warehouse（库房）" });
    }
    const rubbing = {
      id: makeId("rubbing"),
      code: body.code,
      source: body.source,
      paperSize: body.paperSize,
      warehouse: body.warehouse,
      fiberAngle: body.fiberAngle ?? null,
      color: body.color ?? null,
      thicknessMm: body.thicknessMm ?? null,
      note: body.note || "",
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
      trialId: null,
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

  // 纸样档案
  if (req.method === "GET" && pathname === "/paper-samples") {
    const warehouse = url.searchParams.get("warehouse");
    const data = db.paperSamples.filter((item) => !warehouse || item.warehouse === warehouse);
    return send(res, 200, { data });
  }

  if (req.method === "POST" && pathname === "/paper-samples") {
    const body = await parseBody(req);
    required(body, ["code", "name", "warehouse", "fiberAngle", "color", "thicknessMm", "receivedAt"]);
    if (typeof body.color !== "object" || ["l", "a", "b"].some((k) => typeof body.color[k] !== "number")) {
      return send(res, 400, { error: "color必须为 {l,a,b} 数值" });
    }
    if (db.paperSamples.some((item) => item.code === body.code)) {
      return send(res, 409, { error: `纸样编号已存在：${body.code}` });
    }
    const sample = {
      id: makeId("ps"),
      code: body.code,
      name: body.name,
      warehouse: body.warehouse,
      fiberAngle: Number(body.fiberAngle),
      color: { l: Number(body.color.l), a: Number(body.color.a), b: Number(body.color.b) },
      thicknessMm: Number(body.thicknessMm),
      receivedAt: new Date(body.receivedAt).toISOString(),
      note: body.note || ""
    };
    db.paperSamples.push(sample);
    await writeDb(db);
    return send(res, 201, { data: sample });
  }

  // 登记试配：每项缺损三张候选纸样，服务端按规则排序
  const trialMatch = pathname.match(/^\/damages\/([^/]+)\/trial$/);
  if (trialMatch && req.method === "POST") {
    const damage = findDamage(db, trialMatch[1]);
    if (damage.batchId && openBatchOf(db, damage.batchId)) {
      return send(res, 409, { error: "缺损已在未结批次中，不能重新登记试配；如需换纸请走批次换纸流程" });
    }
    const rubbing = findRubbing(db, damage.rubbingId);
    if (
      !rubbing.warehouse ||
      typeof rubbing.fiberAngle !== "number" ||
      !rubbing.color ||
      typeof rubbing.thicknessMm !== "number"
    ) {
      return send(res, 400, { error: "拓片缺少原纸参数（库房/纤维方向/颜色/厚度），无法计算差值排序" });
    }
    const body = await parseBody(req);
    const sampleIds = body.sampleIds;
    if (!Array.isArray(sampleIds) || sampleIds.length !== 3) {
      return send(res, 400, { error: "每项缺损必须登记恰好三张候选纸样" });
    }
    if (new Set(sampleIds).size !== 3) {
      return send(res, 400, { error: "三张候选纸样不能重复" });
    }

    const ranking = buildRanking(db, rubbing, sampleIds);
    const trial = {
      id: makeId("trial"),
      damageId: damage.id,
      rubbingId: rubbing.id,
      candidateIds: [...sampleIds],
      target: {
        warehouse: rubbing.warehouse,
        fiberAngle: rubbing.fiberAngle,
        color: { ...rubbing.color },
        thicknessMm: rubbing.thicknessMm
      },
      ranking,
      selectedId: ranking[0].sampleId,
      status: "registered",
      sortRule: SORT_RULE,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      supersededAt: null,
      supersededReason: ""
    };
    db.trials.push(trial);
    damage.trialId = trial.id;
    damage.status = "trial_registered";
    await writeDb(db);
    return send(res, 201, { data: trial });
  }

  // 师傅确认试配
  const trialConfirmMatch = pathname.match(/^\/damages\/([^/]+)\/trial\/confirm$/);
  if (trialConfirmMatch && req.method === "POST") {
    const damage = findDamage(db, trialConfirmMatch[1]);
    const trial = currentTrial(db, damage);
    if (!trial) return send(res, 404, { error: "尚未登记试配记录" });
    if (trial.status !== "confirmed") {
      trial.status = "confirmed";
      trial.confirmedAt = new Date().toISOString();
      damage.status = "trial_confirmed";
      await writeDb(db);
    }
    return send(res, 200, { data: trial });
  }

  // 查看当前试配与历史版本
  if (trialMatch && req.method === "GET") {
    const damage = findDamage(db, trialMatch[1]);
    const history = db.trials
      .filter((trial) => trial.damageId === damage.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return send(res, 200, { data: { current: currentTrial(db, damage), history } });
  }

  if (req.method === "GET" && pathname === "/batches") {
    return send(res, 200, { data: db.batches.map((batch) => enrichBatch(db, batch)) });
  }

  // 建批即开工：全部校验通过才冻结快照，否则整批不开工并逐项说明原因
  if (req.method === "POST" && pathname === "/batches") {
    const body = await parseBody(req);
    required(body, ["name", "damageIds"]);
    if (!Array.isArray(body.damageIds) || body.damageIds.length === 0) {
      return send(res, 400, { error: "damageIds必须是非空数组" });
    }
    if (new Set(body.damageIds).size !== body.damageIds.length) {
      return send(res, 400, { error: "damageIds不能重复" });
    }
    const invalid = body.damageIds.filter((id) => !db.damages.find((damage) => damage.id === id));
    if (invalid.length) return send(res, 400, { error: `缺损项不存在：${invalid.join(", ")}` });

    const blocks = validateBatchStart(db, body.damageIds);
    if (blocks.length) {
      return send(res, 409, { error: "开工条件不满足，本批次未创建", blocks });
    }

    const batch = {
      id: makeId("batch"),
      name: body.name,
      status: "open",
      damageIds: body.damageIds,
      items: [],
      note: body.note || "",
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    for (const damageId of body.damageIds) {
      const damage = db.damages.find((item) => item.id === damageId);
      const trial = currentTrial(db, damage);
      batch.items.push(freezeTrialItem(db, trial, damage));
      damage.batchId = batch.id;
      damage.status = "in_repair";
    }
    db.batches.push(batch);
    await writeDb(db);
    return send(res, 201, { data: enrichBatch(db, batch) });
  }

  const batchMatch = pathname.match(/^\/batches\/([^/]+)$/);
  if (batchMatch && req.method === "GET") {
    const batch = db.batches.find((item) => item.id === batchMatch[1]);
    if (!batch) return send(res, 404, { error: "修补批次不存在" });
    return send(res, 200, { data: enrichBatch(db, batch) });
  }

  // 开工后换纸样：仅相关缺损退回待试配，其他项留在原批次；冻结快照保留
  const swapMatch = pathname.match(/^\/batches\/([^/]+)\/swap-paper$/);
  if (swapMatch && req.method === "POST") {
    const batch = db.batches.find((item) => item.id === swapMatch[1]);
    if (!batch) return send(res, 404, { error: "修补批次不存在" });
    if (batch.status !== "open") return send(res, 409, { error: "批次已结批，不能换纸" });
    const body = await parseBody(req);
    required(body, ["damageId"]);
    const item = batch.items.find((entry) => entry.damageId === body.damageId);
    if (!item) return send(res, 404, { error: "该缺损不在本批次中" });
    if (item.status === "returned") return send(res, 409, { error: "该缺损已因换纸退回待试配" });

    const damage = db.damages.find((entry) => entry.id === body.damageId);
    const trial = currentTrial(db, damage);
    item.status = "returned";
    item.returnedAt = new Date().toISOString();
    item.swapReason = body.reason || "开工后更换纸样";
    item.suggestedSampleId = body.suggestedSampleId || null;

    if (trial) {
      trial.status = "superseded";
      trial.supersededAt = item.returnedAt;
      trial.supersededReason = item.swapReason;
    }
    damage.batchId = null;
    damage.trialId = null;
    damage.status = "pending";

    await writeDb(db);
    return send(res, 200, {
      data: { batch: enrichBatch(db, batch), returnedDamage: damage },
      message: `缺损「${damage.position}」已退回待试配，批次内其他缺损保持不动，原选纸与排序理由仍可在批次记录中查看`
    });
  }

  const completeMatch = pathname.match(/^\/batches\/([^/]+)\/complete$/);
  if (completeMatch && req.method === "POST") {
    const batch = db.batches.find((item) => item.id === completeMatch[1]);
    if (!batch) return send(res, 404, { error: "修补批次不存在" });
    if (batch.status !== "open") return send(res, 409, { error: "批次已结批" });
    const body = await parseBody(req);
    const results = Array.isArray(body.results) ? body.results : [];
    const activeDamageIds = batch.items.filter((item) => item.status === "active").map((item) => item.damageId);
    batch.status = "completed";
    batch.completedAt = new Date().toISOString();
    batch.note = body.note ?? batch.note;
    db.damages.forEach((damage) => {
      if (!activeDamageIds.includes(damage.id)) return;
      const result = results.find((item) => item.damageId === damage.id) || {};
      damage.status = "repaired";
      damage.afterPhotoUrl = result.afterPhotoUrl || body.defaultAfterPhotoUrl || damage.afterPhotoUrl;
      damage.repairNote = result.repairNote || body.defaultRepairNote || damage.repairNote;
      damage.repairedAt = new Date().toISOString();
    });
    await writeDb(db);
    return send(res, 200, { data: enrichBatch(db, batch) });
  }

  return send(res, 404, { error: "接口不存在", routes });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => send(res, error.status || 500, { error: error.message || "服务器错误" }));
});

server.listen(PORT, () => {
  console.log(`Rubbing repair API running at http://127.0.0.1:${PORT}`);
});
