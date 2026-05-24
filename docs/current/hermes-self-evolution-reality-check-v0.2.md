# Hermes Self-Evolution Reality Check v0.2

Status: **Architectural decision record.** Reconciled with the landed
implementation in `hermes-runtime-adapter.mjs` / `hermes-work-order.mjs` /
`agent_runtime_adapter.schema.json`. This version **supersedes v0.1**, which
proposed a more aggressive "Layer B retirement" path that Codex's actual
landing did not take (and should not have taken — see §11).

Audience: Codex, future Droid sessions, anyone reading the Qianxuesen sidecar
architecture.

---

## 0. TL;DR

1. **Hermes 官方代码里没有任何"自进化"模块。** 之前以为 Layer B 是"还没接
   上"，实际上是**根本不存在于当前部署里**。所谓 `hermes-agent-self-evolution`
   是个独立的外部仓库，跟当前 VPS 上跑的官方 Hermes 没有关系。
2. Hermes 官方营销的 "self-improving" 是四个分散的、reactive 的、无验证闭环
   的机制凑出来的概念（skill 创建 / skill 覆写 / memory_save / session_search /
   honcho 用户建模），不是一个真正的进化循环。
3. **这四套机制没有一个适合进入钱学森控制论循环。** 它们没有 setpoint、
   没有偏差度量、没有可比较的基线。
4. **Layer B 接口保留，默认堵死。** 不退场，不删除——只是默认不信任 runtime
   log 的"进化身份"。除非上游显式标 `signal_origin = hermes_official_self_evolution`，
   否则钱学森永远不会自动把任何东西当成"官方自进化候选"。
5. plugin (`qianxuesen-runtime-adapter`) **不报废，转岗为审计带**：下游接
   红线引擎 + 异常引擎 + 审计日志，**不接锦标赛**——除非显式 Layer B 上游
   出现。
6. 真实 VPS tap 验证：51 boundary / 49 observability / 2 work order /
   SNR 0.039 / status `possibly_too_quiet`。**这是实现正确性的证明，不是缺陷。**

---

## 1. 怎么发现的（Discovery Trail）

### 1.1 起点：VPS 实测 51 个候选，100% insufficient_evidence

`hermes-evolution-evidence-tap` 上线后跑出真实数据：
- 2382 events
- 51 candidates
- 100% `insufficient_evidence_summary`

第一反应：feedback provenance 太严，或者证据采集不够。

### 1.2 第一次纠正：51 个候选是 Layer C 操作日志，不是 Layer B 候选

Codex 自查后意识到：那 51 个不是 Hermes 自进化输出，是 Hermes 普通运行时
工具调用（`skill_manage`, `memory_save`, `write_file` 等）。引入
`signal_origin` enum 区分：
- `runtime_operation_log` (Layer C)
- `hermes_official_self_evolution` (Layer B)
- `qianxuesen_replay_synthesis` (Layer A 内部合成)

报告显示：**official_evolution_candidate_count = 0**。

当时假设：Layer B 候选源还没接，等接上就有。

### 1.3 第二次纠正：Hermes 官方代码里根本没有自进化模块

本地翻 `hermes-agent-official` 全代码库：

```text
grep -r "self_evolution|SkillModule|hermes-agent-self-evolution"
→ 0 hits

AGENTS.md 列出的所有模块（run_agent / model_tools / cli / plugins / skills /
gateway / memory providers / ui-tui / tools / cron / environments ...）
→ 没有一个跟 self-evolution 沾边
```

Layer B **不是没接上，是没装**。所谓的 `hermes-agent-self-evolution` 是个
**独立的外部仓库**（社区/第三方），跟当前 VPS 上跑的官方 Hermes 没有关系。

### 1.4 第三次确认：那 plugin 是我们自己写的

`examples/hermes-runtime-plugin/plugin.yaml` 显示：

```yaml
name: qianxuesen-runtime-adapter
mode: observe_only
safety:
  writes_hermes_memory: false
  writes_hermes_skills: false
  calls_llm: false
```

这是**我们自己挂上去的钱学森采集器**，挂的是 Hermes 通用 plugin hook，
不是任何"自进化事件"接口（因为没有那种接口）。

---

## 2. 官方 README 的 "self-improving" 实际是什么

Hermes 官方 README 原话：

> The self-improving AI agent ... It's the only agent with a built-in learning
> loop — it creates skills from experience, improves them during use, nudges
> itself to persist knowledge, searches its own past conversations, and builds
> a deepening model of who you are across sessions.

拆成五条具体功能，对应实际代码模块：

| README 营销话 | 实际模块 | 实际机制 |
|---|---|---|
| creates skills from experience | `agent/skill_commands.py` + `skills/` | agent 写一个 SKILL.md 文件到 `~/.hermes/skills/` |
| improves them during use | 同上 | 文件覆写。**没有回归测试，没有 A/B 验证** |
| nudges itself to persist knowledge | `agent/memory_manager.py` | system prompt 里塞一句"记得 save"，agent 自觉调 `memory_save` |
| searches its own past conversations | `hermes_state.py`（SQLite FTS5） | `session_search` 工具，全文搜索历史会话 |
| builds a deepening model of who you are | `plugins/memory/honcho/` | 接入外部 honcho 服务，建模发生在 **honcho 服务端，不在 Hermes 内部** |

**没有一个是模型权重更新或带验证闭环的自进化。** 全部是"存文本到磁盘 → 下次读
回来"。Nous 把这套包装成 self-improving 是营销话术，技术现实是 **长期记忆 +
经验复用**，不是控制论意义上的进化。

---

## 3. 决策：四套机制是否进钱学森

钱学森控制论循环的入场券：
- **setpoint**：系统应该达到的目标状态
- **偏差度量**：当前状态偏离 setpoint 多少
- **可控动作**：能把系统拉回 setpoint 的修正手段

一项一项对：

### 3.1 自主创建技能（skill_manage create）

- setpoint：无 / 偏差度量：无 / 可控动作：能拒绝创建，但拒绝标准没有

**进钱学森：不进。** 可进红线引擎（路径过滤）和异常引擎（创建频率突增告警）。

### 3.2 技能"使用中改进"（文件覆写）

- setpoint：无 / 偏差度量：无（Hermes 自己都没有 before/after 对比）

**进钱学森：不进。** 没基线、没回归集、没度量。

### 3.3 主动持久化知识（memory_save 提醒）

- setpoint：无（记下来的内容对不对，钱学森判断不了）

**进钱学森：不进。** 可进异常引擎（写入频率突增）。

### 3.4 搜索过往对话（session_search）

- 只读操作，连副作用都没有。**进钱学森：完全不用。**

### 3.5 Honcho 用户建模

- 外部黑盒服务，看不到内部。**进钱学森：连接入点都没有。**

### 3.6 决策汇总表

| Hermes 功能 | 钱学森内核 | 红线引擎 | 异常告警 | 审计日志 |
|---|:---:|:---:|:---:|:---:|
| skill 创建 | ❌ | ✅ 路径/内容 | ✅ 频率 | ✅ |
| skill 覆写 | ❌ | ✅ 同上 | ✅ 同上 | ✅ |
| memory_save | ❌ | △ 敏感词 | ✅ 频率 | ✅ |
| session_search | ❌ | ❌ | ❌ | ✅（可选）|
| honcho 调用 | ❌ | ❌ | ✅ 频率 | ✅ |

**进钱学森内核：0 个**
**进红线引擎：1–2 个**
**进异常告警：3–4 个**
**进审计日志：5 个全进**

---

## 4. 为什么是范畴错误

钱学森控制论假设系统有**目标状态**和**主动控制意图**——"我希望系统朝 X 走"。

Hermes 这四套功能是 **reactive 记事本**：
- 用户来一句，agent 做一件
- 做完顺手把经验存下来
- 下次类似情况读回来

reactive 系统没有"应该的状态"，只有"已经发生的事实"。**控制论对它无效**——
你没法拉回一个从来没有偏离 setpoint 的系统，因为它压根没 setpoint。

---

## 5. plugin 重定位（不报废）

`examples/hermes-runtime-plugin` 这个 plugin 代码几乎不用改，**改的是它在
架构里的角色**：

### 5.1 旧角色（错的）

```text
Hermes runtime events
  → qianxuesen-runtime-adapter
  → evolution candidate stream
  → tournament gate
  → promote / reject
```

这条路在 Hermes 这边不成立（前面证明过）。

### 5.2 新角色（已经落地）

```text
Hermes runtime events
  → qianxuesen-runtime-adapter (observe_only)
  → normalized_events
  → 分三路：
     ├─ observability_stream  （默认，安静归档）
     ├─ work_order_stream     （命中 anomaly rule 或显式 evidence）
     └─ control_plane_write_deny  （硬边界，禁止任何直接写入）
```

下游**不接锦标赛**——除非未来某天上游真的开始发送
`signal_origin = hermes_official_self_evolution` 的记录。

### 5.3 NDJSON 流不变

`~/.hermes/qianxuesen-runtime-events.ndjson` 继续作为统一采集出口。改的
是下游分流和默认信任级别。

---

## 6. 受影响的现有 Spec / Artifact

**核心原则：接口保留，默认堵死。不删除既有代码，但要严格控制默认行为。**

### 6.1 接口保留，默认不信任

- `docs/current/evolution-tournament-gate-v0.18.md`
  → tournament 路径保留，**但只对显式 `hermes_official_self_evolution` 或
  `qianxuesen_replay_synthesis` 信号生效**。`runtime_operation_log` 不会
  自动进 tournament。
- `docs/current/evolution-candidate-preflight-v0.11.md`
  → preflight 仍然存在，但 Layer C 默认走 observability，不走 preflight。
- `docs/current/skill-evolution-adapter-v0.22.md`
  → 接口保留，等 Layer B 真有数据时复用。
- `docs/current/loser-pressure-quant-v0.26.md`
  → Layer A 的窗口蒸馏继续用。
- `scripts/lib/skill-evolution-supervisor.mjs`
  → 当前使用 example fixtures，等真实上游接通后再考虑接真数据。
- `hermes-evolution-evidence-tap` 系列
  → `evidence_quality / insufficient_evidence_summary / replay_proof` 等
    机制保留实现。Layer C 永远停在 `insufficient_evidence` + `advisory_only`，
    不能 promote。

### 6.2 新增的硬规则（已落地）

- **signal_origin 默认值**：没有显式 origin 的 evolution_evidence
  payload **默认归类为 `runtime_operation_log`**（不再脑补成
  `qianxuesen_replay_synthesis`）。
- **tournament_required 守门**：
  ```js
  tournament_required = goesToWorkOrder && signal_origin !== "runtime_operation_log"
  ```
  Layer C 即使因 anomaly rule 进 work_order_stream，也**不会触发 tournament**。
- **warning 不静默**：检测到 evidence_payload 没标 signal_origin 时，
  报告里会出现 "X event(s) ... cannot support promotion" 警告。
- **anomaly rule registry 版本化**：`anomaly_rules.version` 字段跟着每份报告
  走，将来阈值调整不会让旧 ledger 变得不可比较。
- **sidecar_signal_to_noise_ratio**：deterministic reducer 计算的工单噪声比，
  目标区间 0.05 - 0.20。

### 6.3 需要新建（待办）

- `docs/current/hermes-runtime-audit-tap-v0.1.md`
  → 描述 plugin 的 audit-tap 角色（与 `hermes-runtime-adapter-v0.22.md` 平行）。
- `docs/current/hermes-anomaly-engine-v0.1.md`
  → 异常规则注册表 + dismissal feedback 反向调参流程。
- `docs/current/hermes-redline-engine-v0.1.md`
  → 同步拦截策略（注意：当前 plugin 是 observe-only，"拦截"会突破这条边界，
    需要单独决策）。

### 6.4 保持不变

- `ARCHITECTURE.md` 中关于钱学森控制论 + Layer A（窗口蒸馏）的部分
- `CONTROL_CONTRACT.md`、`GOVERNANCE.md`、八条红线
- 所有跟 Layer A（local-session-distillation / hermes-distillation-mapping）
  相关的 spec

---

## 7. 三层信号模型的修正

### 7.1 旧模型（错的）

```text
Layer A : Qianxuesen window distillation   （外部认知）
Layer B : Hermes self-evolution candidates （等接入）
Layer C : Hermes runtime operation logs    （已采集）
```

三层平行，目标都是喂给钱学森锦标赛。**问题：把 Layer C 当 Layer B 用了。**

### 7.2 新模型（已落地）

```text
Layer A : Qianxuesen window distillation
          → 进入钱学森控制论循环（setpoint / 偏差 / 控制）
          → 主要锦标赛输入源

Layer B : Hermes official self-evolution
          → 当前为空（hermes-agent-official 中没有此模块）
          → 接口预留：signal_origin = "hermes_official_self_evolution"
          → 一旦上游显式发送，自动进 tournament 路径
          → 钱学森永远不会替它脑补身份

Layer C : Hermes runtime operation logs
          → 进入 Hermes 运行时治理层（红线 / 异常 / 审计）
          → 跟钱学森控制论平级
          → 即使因 anomaly rule 进 work_order_stream，也不能 promote
```

**核心变化（相比 v0.1）：**
- v0.1 主张 Layer B 完全退场 → v0.2 改为**接口预留，默认堵死**
- 这样未来真接通 Layer B 时，**只需要上游显式标 signal_origin，不需要回滚
  任何代码**

---

## 8. 给 Codex 的执行清单

按优先级排：

1. **不得从 runtime log 脑补 evolution candidate。** 当前实现已经把这条
   做成硬规则，**未来任何修改都不得放松这个默认值**。

2. **plugin 文档更新**
   - `docs/current/hermes-runtime-adapter-v0.22.md` 已经更新，把"边界观察 vs
     官方自进化"的分类讲清楚。
   - 考虑加一份 `hermes-runtime-audit-tap-v0.1.md` 强调审计角色。

3. **下游分流（已落地）**
   - observability_stream / work_order_stream 双流：完成
   - anomaly rule registry：完成
   - dismissal feedback skeleton：完成
   - retention policy 声明：完成
   - SNR 度量：完成

4. **报告字段（已落地）**
   - `signal_origin` enum schema-required：完成
   - `official_evolution_candidate_count` / `inferred_evolution_pressure_count` /
     `boundary_observation_count` / `work_order_stream_count` 拆分：完成
   - 检测到 evidence_payload 无 signal_origin 时发 warning：完成

5. **回归原点**
   - Layer A 的窗口蒸馏才是钱学森的**主要真实输入**
   - 把后续工程精力集中到 Layer A 的质量提升、距离度量、回归集建设

---

## 9. 如果将来想真接 Hermes 自进化

记一下，将来如果要把 `hermes-agent-self-evolution`（那个外部独立仓库）
装到 VPS 上：

- 那是一个**独立工程动作**，不在当前路线图里
- 装之前要先评估那个外部仓库的代码质量、维护状态、兼容性
- 装完之后，上游 Hermes 必须**显式标记**：
  ```text
  signal_origin = "hermes_official_self_evolution"
  ```
- 否则钱学森**不会替它脑补身份**——会一律按 runtime_operation_log 处理
- 一旦显式标记进来：
  - tournament_required 路径自动启用
  - evidence_quality 检查启用
  - replay_proof / holdout / baseline 三件套全启用
  - 不需要回滚任何 v0.2 代码

**默认前提仍然是：不装。** 钱学森专心做 Layer A，Hermes 治理层专心做 Layer C。

---

## 10. 真实 VPS 数据验证

最新一次本地副本运行（pre/post hook 合并 + signal_origin 严格默认值落地之后）：

```text
events                              : 2382
official_evolution_candidate_count  : 0      ← Layer B 永远空，符合预期
inferred_evolution_pressure_count   : 51
boundary_observation_count          : 51
observability_stream_count          : 49     ← 安静归档
work_order_stream_count             : 2      ← 异常进单
sidecar_signal_to_noise_ratio       : 0.039
status                              : possibly_too_quiet
```

**说明这个数字**：
- 0.039 跌出目标下沿（0.05），状态显示 `possibly_too_quiet`
- 这**不是 bug**，是 pre/post hook 合并去重后的真实信噪比
- 之前的 0.078 包含了 (pre + post) × 2 underlying actions 的重复
- 真实有效信号率本来就在 0.04 附近——目标区间下沿可能需要重新校准为
  0.03 - 0.20，但**这是另一个独立决策**
- `possibly_too_quiet` 的语义是"可能漏报"，提醒人去检查规则是否太严，
  而不是"系统坏了"

---

## 11. v0.1 → v0.2 的修订原因（Decision Revision）

### 11.1 v0.1 的错误判断

v0.1 §6.1 / §7.2 / §8 主张：
- "标记为遗产（保留代码，不再迭代）"
- "Layer B 退场"
- "不得再写 Hermes evolution candidate 相关新功能"

这个判断**过于激进**。

### 11.2 Codex 实际落地的更优方案

Codex 在两轮实现中采用了：
- **接口保留**：tournament / evidence / replay 等机制留着，schema 字段全保留
- **默认堵死**：runtime_operation_log 默认 confidence/evidence_quality 双低，
  tournament_required 守门排除 runtime_operation_log
- **显式启用**：上游必须显式标 `hermes_official_self_evolution` 才能解锁
- **warning 不静默**：检测到 origin 缺失时主动报警

**这个方案比 v0.1 的"退场"更好**，因为：
1. 未来真接通 Layer B 时，**不需要回滚任何代码**
2. schema 已经覆盖完整流程，**比"代码还没写"的状态强**
3. Layer C 仍然能被严格处理，**不会被误升为 Layer B**

### 11.3 决策修订

**v0.1 的 §6 / §7 / §8 结论部分作废**，由 v0.2 的对应章节取代。

v0.1 的 §1（discovery trail）和 §2（官方四套功能拆解）**仍然有效**，
被原样保留进 v0.2。

### 11.4 教训

写架构决策时，"接口预留 + 严格默认值"通常比"全部退场"更稳。
退场是**回滚成本高**的决策，预留是**未来扩展成本低**的决策。
当不确定 Layer B 永远不会到来时，**默认选预留**。

---

## 12. 一句话总结

**Hermes 官方的"自进化"是营销话；技术现实是长期记忆 + 经验复用，没有
验证闭环。Layer B 接口在钱学森里预留，默认严格堵死，只有显式上游才能解锁。
Layer C 进 Hermes 治理层（红线 / 异常 / 审计），不进锦标赛。plugin 转岗为
审计带，不报废。**

---

## Appendix A. 证据原文

### A.1 hermes-agent-official 全代码搜索结果

```text
Pattern: self_evolution | SkillModule | hermes-agent-self-evolution
Path: C:\Users\Administrator\Documents\New project\hermes-agent-official\
Hits: 0
```

### A.2 plugin.yaml 关键字段

```yaml
# examples/hermes-runtime-plugin/plugin.yaml
name: qianxuesen-runtime-adapter
mode: observe_only
safety:
  writes_hermes_memory: false
  writes_hermes_skills: false
  calls_llm: false
  calls_external_api: false
```

### A.3 真实 VPS 实测数据（v0.2 最新口径）

```text
Events processed                   : 2382
Boundary observations              : 51
Observability stream               : 49
Work order stream                  : 2
official_evolution_candidate_count : 0
sidecar_signal_to_noise_ratio      : 0.039
status                             : possibly_too_quiet
```

### A.4 Hermes README 营销原文位置

```text
C:\Users\Administrator\Documents\New project\hermes-agent-official\README.md
段落: "The self-improving AI agent built by Nous Research..."
```

### A.5 关键代码守门点（截至 v0.2 落地时）

```js
// scripts/lib/hermes-runtime-adapter.mjs

function signalOriginFor(event) {
  const explicit = explicitSignalOriginFor(event);
  if (explicit) return explicit;
  return "runtime_operation_log";   // ← 不脑补，永远默认 runtime
}

// tournament 守门
tournament_required = goesToWorkOrder
  && signal_origin !== "runtime_operation_log";

// warning 不静默
if (evidenceWithoutExplicitSignalOriginCount > 0) {
  warnings.push(
    `${count} event(s) supplied evolution_evidence without explicit
     signal_origin; they defaulted to runtime_operation_log and
     cannot support promotion.`
  );
}
```

---

*Decided by: Droid + user, 2026-05-24.*
*Implementation reference: Codex's two rounds of changes to
`hermes-runtime-adapter.mjs` / `hermes-work-order.mjs` /
`agent_runtime_adapter.schema.json` / `hermes-runtime-adapter-v0.22.md` /
`hermes-value-proof.mjs`.*
*Supersedes: v0.1 (never committed).*
