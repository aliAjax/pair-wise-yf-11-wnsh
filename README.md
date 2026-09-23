# 古籍拓片缺损修补API

纯后端零依赖Node服务，使用 `data/db.json` 持久化拓片、缺损项、纸样、试配记录和修补批次。

## 启动

```bash
PORT=3020 node server.js
```

## 业务规则

- 每个缺损登记试配时必须提供**恰好三张候选纸样**，服务端按以下规则排序，第1名为自动选中纸样：
  1. 纤维方向差（角度最小夹角）升序
  2. 色差（CIE76 ΔE）升序
  3. 厚度差升序
  4. 三项差值全部相同 → 入库时间早者优先
- 每条排序结果都带 `reason`，说明排在此位次的具体比较依据。
- 试配必须由师傅**确认**后才能用于建批。
- **建批即冻结**：批次保存每个缺损选中纸样的快照、完整排序与排序理由、试配确认时间，之后不再随纸样档案变化。
- 开工校验任一缺损不满足都**整批不开工**（返回409并逐项说明原因）：
  - 选中纸样被别的未结批次占用
  - 试配未确认（含未登记）
  - 选中纸样与拓片不在同一库房
- **开工后换纸**（`POST /batches/:id/swap-paper`）：
  - 只有相关缺损退回 `pending`（待试配），并解除其纸样占用；
  - 其他缺损留在原批次继续施工；
  - 批次里该缺损的冻结快照标记为 `returned`，换班/重启后仍可看到原来的选择和排序理由；
  - 退回的缺损需重新登记、确认试配后才能再建批。

缺损状态流转：`pending`（待试配）→ `trial_registered` → `trial_confirmed` → `in_repair` → `repaired`；换纸后退回 `pending`。

## 接口

- `GET /health`
- 拓片：`GET /rubbings`、`POST /rubbings`（建拓片须带 `warehouse`，并建议带 `fiberAngle`/`color{l,a,b}`/`thicknessMm` 作为原纸基准）
- 缺损：`GET /rubbings/:id/damages`、`POST /rubbings/:id/damages`、`GET /damages?status=&type=`、`PATCH /damages/:id`
- 纸样：`GET /paper-samples?warehouse=`、`POST /paper-samples`
- 试配：`POST /damages/:id/trial`（body `{"sampleIds":[三张]}`）、`POST /damages/:id/trial/confirm`、`GET /damages/:id/trial`（含历史版本）
- 批次：`GET /batches`、`POST /batches`、`GET /batches/:id`、`POST /batches/:id/swap-paper`、`POST /batches/:id/complete`

## 闭环示例

```bash
# 1. 登记三张候选纸样并排序
curl -X POST http://127.0.0.1:3020/damages/damage_demo_1/trial \
  -H 'Content-Type: application/json' \
  -d '{"sampleIds":["ps_demo_a","ps_demo_b","ps_demo_g"]}'

# 2. 师傅确认试配
curl -X POST http://127.0.0.1:3020/damages/damage_demo_1/trial/confirm

# 3. 建批（不满足开工条件时返回409和逐项原因）
curl -X POST http://127.0.0.1:3020/batches \
  -H 'Content-Type: application/json' \
  -d '{"name":"六月小批修补","damageIds":["damage_demo_1"]}'

# 4. 开工后换纸：仅该缺损退回待试配
curl -X POST http://127.0.0.1:3020/batches/<batchId>/swap-paper \
  -H 'Content-Type: application/json' \
  -d '{"damageId":"damage_demo_1","reason":"纸样纹路与补口不贴合"}'
```

演示数据中：`ps_demo_e` 与 `ps_demo_f` 三项差值完全相同（靠入库时间分先后），`ps_demo_d` 在南库（与北库拓片触发跨库房拦截）。
