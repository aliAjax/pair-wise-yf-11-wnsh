# 古籍拓片缺损修补API

纯后端零依赖Node服务，使用 `data/db.json` 持久化拓片、缺损项、纸样、试配记录和修补批次。

## 启动

```bash
PORT=3020 node server.js
```

## 业务流程：试配 → 建批冻结 → 开工校验 → （可换纸重配）→ 完结

1. **登记试配**：每项缺损登记**恰好三张**候选纸样。服务端按拓片原纸基准（纤维方向、Lab 色度、厚度）计算每张纸的
   纤维方向差、色差（Lab 欧氏距离）、厚度差，按 `纤维方向差 → 色差 → 厚度差` 升序排名；三项差值完全并列时
   **入库早的排前**（`storedAt` 相同再按纸样编号）。每条候选都附一句可交接的排序理由。
2. **确认试配**：师傅从三张候选中确认一张（默认第 1 名，可指定其他名次）。
3. **建批冻结**：只收已确认试配的缺损；建批时把选中纸样的档案快照、所选名次、三张候选的完整排序和排序理由
   冻结进批次明细，此后纸样档案被修改也不影响已建批次。批次状态为 `ready`（待开工）。
4. **开工校验**，任一缺损不过则整批不开工（409）并逐项说明原因：
   - 试配未确认（含开工后换纸样退回待试配、尚未重配的项）；
   - 纸样与拓片**不在同库房**；
   - 纸样被**别的未结批次**占用（状态非 `completed`，且该明细未被替换）。
5. **开工后换纸样**：只把相关缺损退回待试配（旧冻结明细标记 `replaced` 留档、旧选择写入试配历史），其他缺损
   留在原批次继续施工；该缺损 `batchId` 保留，重新登记候选并确认后再调开工接口，新选择重新冻结为有效明细，
   换班后仍可在试配历史和批次明细中看到原来的选择。
6. **完结**：有退回待试配项时禁止完结；完结后缺损标记 `repaired`，占用的纸样释放给其他批次。

## 接口

拓片与缺损：

- `GET /health`
- `GET /rubbings`
- `POST /rubbings`（含基准参数 `warehouse`、`fiberDirection`、`colorLab:{l,a,b}`、`thickness`）
- `GET /rubbings/:id/damages`
- `POST /rubbings/:id/damages`
- `GET /damages?status=&type=`
- `PATCH /damages/:id`

纸样：

- `GET /papers?warehouse=`
- `POST /papers`（`code/name/warehouse/fiberDirection/colorLab/thickness/storedAt`）

试配记录：

- `GET /damages/:id/trial-match` — 候选排序、当前选择、所在批次、完整历史
- `PUT /damages/:id/trial-match` — 登记三张候选 `{paperIds:[3个]}`，服务端排序并生成理由
- `POST /damages/:id/trial-match/confirm` — `{paperId?}`，缺省取第 1 名

批次：

- `GET /batches` / `GET /batches/:id`
- `POST /batches` — `{name, damageIds, note?}`，冻结后 `ready`
- `POST /batches/:id/start` — 开工校验，失败返回 409 + `problems`
- `POST /batches/:id/items/:damageId/reselect` — 开工后换纸，`{reason?}`，仅该缺损退回待试配
- `POST /batches/:id/complete`

## 闭环示例

```bash
# 登记三张候选并确认（默认第1名；第2、3名三项差值完全相同，入库早的排前）
curl -X PUT http://127.0.0.1:3020/damages/damage_demo_1/trial-match \
  -H 'Content-Type: application/json' \
  -d '{"paperIds":["paper_mian_1","paper_xuan_2","paper_xuan_3"]}'
curl -X POST http://127.0.0.1:3020/damages/damage_demo_1/trial-match/confirm

# 建批冻结，再开工（失败时 problems 里逐项给出原因）
curl -X POST http://127.0.0.1:3020/batches \
  -H 'Content-Type: application/json' \
  -d '{"name":"九月二批","damageIds":["damage_demo_1","damage_demo_2"]}'
curl -X POST http://127.0.0.1:3020/batches/<batchId>/start

# 开工后只给某一项换纸，重配确认后重新开工
curl -X POST http://127.0.0.1:3020/batches/<batchId>/items/damage_demo_1/reselect \
  -H 'Content-Type: application/json' -d '{"reason":"实补发现帘纹走向不符"}'
curl -X PUT  http://127.0.0.1:3020/damages/damage_demo_1/trial-match \
  -H 'Content-Type: application/json' -d '{"paperIds":["paper_xuan_2","paper_xuan_3","paper_xuan_4"]}'
curl -X POST http://127.0.0.1:3020/damages/damage_demo_1/trial-match/confirm \
  -H 'Content-Type: application/json' -d '{"paperId":"paper_xuan_2","operatorNote":"李师傅换班复核"}'
curl -X POST http://127.0.0.1:3020/batches/<batchId>/start
```

种子数据含同库房多档纸样、B 库纸样（演示跨库房拦截）和两张三项差值完全相同、入库时间不同的
净皮宣（演示并列时入库早者优先）。
