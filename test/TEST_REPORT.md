# 测试报告：Subagent 超时行为缺陷测试

## 执行摘要

为 `src/index.ts` 中 `runSubagent` 函数的三个超时相关缺陷编写了测试先行（TDD 红阶段）测试。测试通过 mock 真实 spawn 和 fake timers 验证超时逻辑的正确行为。

**测试结果：6 个新测试失败（红），证明缺陷存在；1 个新测试通过（正常行为验证）；49 个现有测试全部通过，无回归。**

## 新增测试文件

**文件：** `test/timeout-behavior.test.ts`

**测试用例清单（7 个）：**

### 缺陷 #1：stderr 不计入活动（2 个测试）

1. ✅ `should not kill process when stderr data arrives before activity timeout`
   - **对应缺陷：** 缺陷 #1
   - **测试策略：** 设置 1000ms 活动超时，先发射 stdout 数据启动计时器，800ms 后发射 stderr 数据，再等待 500ms（总计 1300ms）
   - **预期行为（修复后）：** stderr 数据应重置计时器，进程在 1300ms 时不应被 kill
   - **当前结果：** ❌ 失败 - 进程在 1000ms 时被 kill，证明 stderr 未重置计时器

2. ✅ `should handle stderr activity preventing timeout and set correct stopReason on eventual timeout`
   - **对应缺陷：** 缺陷 #1 + #3（综合测试）
   - **测试策略：** 验证 stderr 重置计时器后，最终超时仍应设置结构化 stopReason
   - **当前结果：** ❌ 失败 - 两个缺陷同时触发

### 缺陷 #2：spawn 时活动计时器未启动（2 个测试）

3. ✅ `should kill process if no activity after spawn within timeout`
   - **对应缺陷：** 缺陷 #2
   - **测试策略：** spawn 后不发射任何数据，等待完整超时时间
   - **预期行为（修复后）：** 进程应在超时后被 SIGKILL
   - **当前结果：** ❌ 失败 - 进程未被 kill，证明计时器未启动

4. ✅ `should allow process to run if activity occurs before timeout`
   - **对应缺陷：** 正常行为验证（非缺陷测试）
   - **测试策略：** 验证在超时前发射 stdout 数据可以重置计时器
   - **当前结果：** ✅ 通过 - 当前代码的 stdout 重置逻辑正常工作

### 缺陷 #3：超时 kill 无结构化标记（4 个测试）

5. ✅ `should set stopReason to 'activity_timeout' when activity timeout triggers`
   - **对应缺陷：** 缺陷 #3
   - **测试策略：** 触发活动超时，验证 `stopReason` 是否为 `"activity_timeout"`
   - **当前结果：** ❌ 失败 - `stopReason` 为 `undefined`

6. ✅ `should set stopReason to 'hard_timeout' when hard timeout triggers`
   - **对应缺陷：** 缺陷 #3
   - **测试策略：** 触发硬超时，验证 `stopReason` 是否为 `"hard_timeout"`
   - **当前结果：** ❌ 失败 - `stopReason` 为 `undefined`

7. ✅ `should include timeout info in stderr for debugging`
   - **对应缺陷：** 缺陷 #3
   - **测试策略：** 验证超时后 stderr 包含诊断信息且 stopReason 被设置
   - **当前结果：** ❌ 失败 - stopReason 未设置

## 测试运行结果

### 新测试（timeout-behavior.test.ts）

```
Test Files  1 failed (1)
     Tests  6 failed | 1 passed (7)
```

**失败详情：**

1. **Bug #1 测试失败原因：**
   - 期望：`proc.kill` 不被调用
   - 实际：`proc.kill("SIGKILL")` 被调用 1 次
   - 结论：stderr 数据未重置活动计时器，超时在 1000ms 触发

2. **Bug #2 测试失败原因：**
   - 期望：`proc.kill` 被调用
   - 实际：`proc.kill` 未被调用
   - 结论：spawn 后活动计时器未启动，进程永远不会因超时被 kill

3. **Bug #3 测试失败原因：**
   - 期望：`stopReason` 为 `"activity_timeout"` 或 `"hard_timeout"`
   - 实际：`stopReason` 为 `undefined`
   - 结论：超时 kill 时未设置结构化停止原因

### 现有测试（无回归）

```
Test Files  3 passed (3)
     Tests  49 passed (49)
```

- ✅ `config.test.ts` - 全部通过
- ✅ `cwd-resolution.test.ts` - 全部通过
- ✅ `progress-manager.test.ts` - 全部通过

### 总体结果

```
Test Files  1 failed | 3 passed (4)
     Tests  6 failed | 50 passed (56)
```

## 测试策略说明

### Mock 策略

- **Mock `node:child_process.spawn`：** 返回可控的假进程对象，可手动发射 stdout/stderr 事件
- **Mock `proc.kill`：** 记录调用但不实际 kill 进程
- **Fake Timers（`vi.useFakeTimers()`）：** 精确控制时间推进，避免真实等待

### 为什么选择集成测试而非纯函数提取

任务描述建议可以提取纯函数进行测试。我们选择集成测试的原因：

1. **测试可观测行为：** 测试的是 `runSubagent` 的外部行为（是否 kill 进程、stopReason 值），而非内部实现细节
2. **与现有测试风格一致：** `cwd-resolution.test.ts` 已采用相同的 mock spawn 模式
3. **无需重构即可编写测试：** 遵循"测试先行"原则，先定义期望行为，再由 coder 决定如何重构实现

### Fake Timers 与 Spawn 交互

**潜在复杂性：** fake timers 与 `queueMicrotask` 的交互需要谨慎处理。

**解决方案：**
- 使用 `await vi.advanceTimersByTimeAsync()` 而非同步版本，确保微任务正确执行
- spawn 回调使用 `queueMicrotask` 发射事件，与 fake timers 兼容
- 每个测试用例独立设置/清理 timers 和 mock

## 重构建议（供 coder 参考）

### 缺陷 #1 修复位置

**文件：** `src/index.ts`  
**位置：** `proc.stderr.on("data", ...)` 处理器（约 L1122）  
**修复方案：**
```typescript
proc.stderr.on("data", (data) => {
    currentResult.stderr += data.toString();
    resetActivityTimer(); // ← 添加这一行
});
```

### 缺陷 #2 修复位置

**文件：** `src/index.ts`  
**位置：** `setupHardTimer()` 调用后（约 L1173）  
**修复方案：**
```typescript
setupHardTimer();
resetActivityTimer(); // ← 添加这一行，启动初始活动计时器
```

### 缺陷 #3 修复位置

**文件：** `src/index.ts`  
**位置：** 活动超时回调（约 L1072-1080）和硬超时回调（约 L1095-1103）

**活动超时修复：**
```typescript
activityTimer = setTimeout(() => {
    currentResult.stopReason = "activity_timeout"; // ← 添加这一行
    const elapsed = Date.now() - currentResult.lastPhaseChange;
    // ... 其余代码不变
}, activityMs);
```

**硬超时修复：**
```typescript
hardTimer = setTimeout(() => {
    currentResult.stopReason = "hard_timeout"; // ← 添加这一行
    const turns = currentResult.usage.turns;
    // ... 其余代码不变
}, hardMs);
```

## 状态

| 项目 | 状态 |
|------|------|
| 新测试编写 | ✅ 完成（7 个测试用例） |
| 新测试失败（红阶段） | ✅ 6 个失败，证明缺陷存在 |
| 现有测试无回归 | ✅ 49 个全部通过 |
| src/index.ts 未修改 | ✅ 仅新增测试文件 |

## 后续建议

### 对 coder 的建议

1. **按上述修复方案实施修复**：每个缺陷的修复都很简单（1-2 行代码）
2. **修复后运行测试**：`npm test` 应该显示所有 56 个测试通过
3. **考虑边界情况**：
   - 活动超时和硬超时同时启用的优先级（当前硬超时先触发）
   - 超时后 `finalize()` 是否正确清理所有计时器
   - `stopReason` 是否会影响下游的 `isError` 判定（需确认 L1343、L1406 的逻辑）

### 对 reviewer 的建议

1. **审查修复的正确性**：确认 `resetActivityTimer()` 在 stderr 和 spawn 后都被调用
2. **审查 stopReason 值的选择**：
   - `"activity_timeout"` vs `"hard_timeout"` 是否与现有 stopReason 枚举一致
   - 是否需要添加文档说明这些新值
3. **审查测试覆盖率**：当前测试已覆盖三个缺陷的核心场景，可考虑补充：
   - 超时后 stderr 诊断信息的格式验证
   - 超时与 abort 信号的竞态条件

### 可选的额外测试

如果 coder 希望增强测试覆盖，可以考虑：

1. **单元测试提取的纯函数**（如果 coder 选择重构）：
   - `shouldResetActivityTimer(eventType: string): boolean`
   - `getTimeoutStopReason(type: "activity" | "hard"): string`

2. **竞态条件测试**：
   - 活动超时触发时，进程恰好 exit 的处理
   - abort 信号与超时同时触发的处理

3. **配置边界测试**：
   - `PI_SUBAGENT_ACTIVITY_TIMEOUT_MS = 0`（禁用活动超时）
   - 超大超时值（`Number.MAX_SAFE_INTEGER`）的处理

---

**[tester: done]**

测试已完成，等待 coder 实现修复代码使红阶段测试变绿。

---

# 第二轮测试报告：技术债补充测试（2024 年）

## 执行摘要

针对 reviewer 复审指出的 pre-aborted spawn 边缘缺陷和覆盖缺口，编写了第二轮补充测试。通过深入的执行流分析和 fake timer 诊断，发现了一个关键的时序差异：

- **Pre-aborted 情况**：`killProc()` 在 `setupHardTimer()` 之前同步执行 → 硬计时器在 abort 后被创建 → 在宽限期内触发 → **缺陷确认**
- **Abort event 情况**：`setupHardTimer()` 在 abort 事件异步触发之前执行 → 硬计时器被 abort 清除 → **缺陷未触发**

**测试结果：2 个新测试失败（红），证明 pre-aborted 缺陷存在；3 个新测试通过（绿），作为回归防护；67 个现有测试全部通过，无回归。**

## 新增测试用例

**文件：** `test/technical-debt.test.ts`（新增 Debt #5、#6、#7 三个 describe 块）

**测试用例清单（5 个）：**

### Debt #5：pre-aborted spawn + 短硬超时（2 个测试）

1. ❌ `should not arm hard timer when signal is pre-aborted`
   - **对应问题：** reviewer 重要项 #1
   - **测试策略：** signal 在 spawn 前已 aborted，硬超时 1000ms，验证 T=1000ms 时无 SIGKILL
   - **预期行为（修复后）：** 硬计时器不应被武装，无 SIGKILL
   - **当前结果：** ❌ 失败 - T=1000ms 时 SIGKILL 被调用（来自硬计时器）
   - **根因：** `setupHardTimer()` 无 `wasAborted` 守卫，在 `killProc()` 之后创建硬计时器

2. ❌ `should not set hard_timeout stopReason when signal is pre-aborted`
   - **对应问题：** reviewer 重要项 #1
   - **测试策略：** 验证 abort 宽限期内无 SIGKILL（间接证明 stopReason 不会被误标为 hard_timeout）
   - **当前结果：** ❌ 失败 - SIGKILL 被调用

### Debt #6：abort 事件清除硬计时器（1 个测试）

3. ✅ `should not fire hard timer after abort event`
   - **对应问题：** reviewer 建议项 #2(a) 覆盖缺口
   - **测试策略：** abort 事件在 T=100ms 触发，硬超时 1000ms，验证 T=1100ms 时无 SIGKILL
   - **当前结果：** ✅ 通过 - 硬计时器被正确清除
   - **原因分析：** Node.js `AbortController.abort()` 异步派生事件（通过 microtask），`setupHardTimer()` 在事件触发前已执行。当 abort 事件触发时，`killProc()` 清除的是 spawn 时创建的硬计时器，而非新创建的。新硬计时器理论上会被创建，但实际测试中未观察到（可能因时序原因被后续逻辑覆盖）。
   - **测试价值：** 作为回归防护，确保未来代码重构不会引入此缺陷

### Debt #7：覆盖缺口 — 已有守卫验证（2 个测试）

4. ✅ `should not re-arm activity timer when stderr data arrives after abort`
   - **对应问题：** reviewer 建议项 #2(b)
   - **测试策略：** abort 后发射 stderr 数据，验证活动计时器不被重新武装
   - **当前结果：** ✅ 通过
   - **原因：** `resetActivityTimer()` L1077 已有 `wasAborted` 守卫：`if (resolved || wasAborted || exitCodeValue !== null) return;`

5. ✅ `should not re-arm activity timer when stdout data arrives after exit`
   - **对应问题：** reviewer 建议项 #2(c)
   - **测试策略：** 进程 exit 后发射 stdout 尾包，验证活动计时器不被重新武装
   - **当前结果：** ✅ 通过
   - **原因：** `resetActivityTimer()` L1077 已有 `exitCodeValue !== null` 守卫

## 测试运行结果

### 新测试（technical-debt.test.ts 新增部分）

```
Test Files  1 failed (1)
     Tests  2 failed | 3 passed (5)
```

**失败详情：**

1. **Debt #5 测试 1 失败原因：**
   - 期望：T=1000ms 时 kill 调用次数为 1（仅 SIGTERM）
   - 实际：kill 调用次数为 2（SIGTERM + SIGKILL）
   - 结论：硬计时器在 abort 宽限期内触发，发送了错误的 SIGKILL

2. **Debt #5 测试 2 失败原因：**
   - 期望：无 SIGKILL 调用
   - 实际：检测到 SIGKILL 调用
   - 结论：硬计时器触发导致 stopReason 可能被误标为 "hard_timeout"

### 现有测试（无回归）

```
Test Files  5 passed (5)
     Tests  67 passed (67)
```

- ✅ `config.test.ts` - 全部通过
- ✅ `cwd-resolution.test.ts` - 全部通过
- ✅ `progress-manager.test.ts` - 全部通过
- ✅ `technical-debt.test.ts`（原有部分）- 全部通过
- ✅ `timeout-behavior.test.ts` - 全部通过

### 总体结果

```
Test Files  1 failed | 4 passed (5)
     Tests  2 failed | 70 passed (72)
```

## 根因分析：Pre-aborted vs Abort Event 的时序差异

通过深入的 fake timer 诊断，发现了关键的执行流差异：

### Pre-aborted 情况（缺陷存在）

```
T=0: spawn callback 作为 microtask 执行
  ↓
  signal.aborted === true
  ↓
  killProc() 同步执行：
    - wasAborted = true
    - clearTimeout(hardTimer) // hardTimer 为 undefined，无操作
    - proc.kill("SIGTERM")
    - sigkillTimer = setTimeout(5000ms) → T=5000ms
  ↓
  setupHardTimer() 执行：
    - hardTimer = setTimeout(1000ms) → T=1000ms  ← 缺陷！
  ↓
  resetActivityTimer() 返回（wasAborted 守卫）

T=1000ms: hardTimer 触发
  ↓
  proc.kill("SIGKILL")  ← 错误的 SIGKILL
  currentResult.stopReason = "hard_timeout"  ← 错误的标记
```

**关键：** `killProc()` 在 `setupHardTimer()` 之前执行，硬计时器在 abort 后被创建。

### Abort Event 情况（缺陷未触发）

```
T=0: spawn callback 作为 microtask 执行
  ↓
  signal.aborted === false
  ↓
  signal.addEventListener("abort", killProc)
  ↓
  setupHardTimer() 执行：
    - hardTimer = setTimeout(1000ms) → T=1000ms
  ↓
  resetActivityTimer() 执行

T=100ms: controller.abort() 调用
  ↓
  abort 事件异步派生（通过 microtask/setImmediate）
  ↓
  advanceTimersByTimeAsync() 处理 microtask
  ↓
  abort 事件触发，killProc() 执行：
    - wasAborted = true
    - clearTimeout(hardTimer) // 清除 T=0 创建的硬计时器
    - proc.kill("SIGTERM")
    - sigkillTimer = setTimeout(5000ms) → T=5100ms
  ↓
  setupHardTimer() 已执行过，不会再次执行

T=5100ms: sigkillTimer 触发（正常 abort 宽限期结束）
```

**关键：** `setupHardTimer()` 在 abort 事件触发前已执行。Node.js 的 `AbortController.abort()` 异步派生事件，使得 `killProc()` 在 `setupHardTimer()` 之后执行。

### 为什么 Default 配置不触发

- `PI_SUBAGENT_HARD_TIMEOUT_MS` 默认为 0（禁用）
- `setupHardTimer()` 内部检查 `if (hardMs > 0)`，默认不创建硬计时器
- 因此 pre-aborted 缺陷在默认配置下不触发

## 修复建议（供 coder 参考）

### Pre-aborted 缺陷修复

**文件：** `src/index.ts`  
**位置：** `setupHardTimer()` 函数（约 L1101）或调用处（L1207）

**方案 A：在 `setupHardTimer()` 内部添加守卫**

```typescript
const setupHardTimer = () => {
    // 不在 abort 后武装硬计时器
    if (wasAborted) return;
    
    const hardMs = parseEnvInt(
        process.env.PI_SUBAGENT_HARD_TIMEOUT_MS,
        DEFAULT_HARD_TIMEOUT_MS,
    );
    if (hardMs > 0) {
        hardTimer = setTimeout(() => {
            currentResult.stopReason = "hard_timeout";
            // ... 其余代码
        }, hardMs);
    }
};
```

**方案 B：在调用处添加守卫**

```typescript
if (signal) {
    killProc = () => { /* ... */ };
    if (signal.aborted) killProc();
    else signal.addEventListener("abort", killProc, { once: true });
}

// 仅在非 abort 状态下武装硬计时器
if (!wasAborted) {
    setupHardTimer();
}
resetActivityTimer();
```

**推荐方案 A**，因为：
1. 守卫逻辑封装在函数内部，更符合单一职责原则
2. 即使未来有其他地方调用 `setupHardTimer()`，也能保证安全
3. 与 `resetActivityTimer()` 的守卫模式一致

## 测试覆盖矩阵

| 场景 | 硬计时器清除 | 活动计时器清除 | 状态 |
|------|------------|--------------|------|
| Pre-aborted + 短硬超时 | ❌ 未清除（缺陷） | ✅ 已清除 | 🔴 RED |
| Abort event + 短硬超时 | ✅ 已清除（时序保护） | ✅ 已清除 | 🟢 GREEN |
| Abort 后 stderr 数据 | N/A | ✅ 已清除（wasAborted 守卫） | 🟢 GREEN |
| Exit 后 stdout 尾包 | N/A | ✅ 已清除（exitCodeValue 守卫） | 🟢 GREEN |

## 状态

| 项目 | 状态 |
|------|------|
| 新测试编写 | ✅ 完成（5 个测试用例） |
| Pre-aborted 缺陷测试（红阶段） | ✅ 2 个失败，证明缺陷存在 |
| 覆盖缺口测试（回归防护） | ✅ 3 个通过，验证现有守卫 |
| 现有测试无回归 | ✅ 67 个全部通过 |
| src/index.ts 未修改 | ✅ 仅修改测试文件 |
| TEST_REPORT.md 已更新 | ✅ 记录两轮测试 |

## 后续建议

### 对 coder 的建议

1. **优先修复 pre-aborted 缺陷**：在 `setupHardTimer()` 添加 `if (wasAborted) return;` 守卫
2. **修复后运行测试**：`npm test` 应显示 72 个测试全部通过
3. **考虑添加注释**：在守卫处添加注释说明原因，例如：
   ```typescript
   // Don't arm hard timer after abort: the abort grace period (5s SIGKILL delay)
   // should not be interrupted by a hard timeout. See technical-debt.test.ts Debt #5.
   if (wasAborted) return;
   ```

### 对 reviewer 的建议

1. **审查修复方案**：确认方案 A（函数内部守卫）vs 方案 B（调用处守卫）的选择
2. **验证测试覆盖**：当前测试已覆盖 pre-aborted 缺陷和三个覆盖缺口
3. **考虑是否需要更多测试**：
   - abort event + 极短硬超时（如 1ms）的边界情况
   - 多个 abort 信号源的竞态条件

### 测试质量评估

- **覆盖率**：pre-aborted 缺陷有 2 个测试用例，覆盖缺口有 3 个回归防护测试
- **可维护性**：测试命名清晰，注释详细，易于理解
- **稳定性**：使用 fake timers，无外部依赖，可重复执行
- **诊断价值**：详细的根因分析帮助 coder 理解问题本质

---

**[tester: done]**

第二轮测试已完成。Pre-aborted 缺陷已捕获（2 个红测试），覆盖缺口已补充（3 个绿测试作为回归防护）。等待 coder 实现修复使红测试变绿。

---

# 最终结果：修复后全绿状态（Post-fix）

## 执行摘要

超时技术债修复已全部完成。三轮修复均在 `src/index.ts` 实施，修复后测试套件 **72/72 全部通过**（5 个测试文件），无回归。每次修复后运行 `npm run typecheck`（`tsc --noEmit`）均无错误。

**最终测试结果：Test Files 5 passed (5)，Tests 72 passed (72)。**

## 三轮修复过程

| 轮次 | 测试文件 | 修复前（红阶段） | 修复后 | 修复内容 |
|------|---------|----------------|--------|----------|
| 第一轮 | timeout-behavior.test.ts | 7 用例：6 红 1 绿 | 56/56 全绿 | 缺陷 #1：stderr 数据重置活动计时器；缺陷 #2：spawn 时启动活动计时器；缺陷 #3：超时 kill 设置结构化 stopReason |
| 第二轮 | technical-debt.test.ts | 11 用例：7 红 4 绿 | 67/67 全绿 | 按修复建议落实技术债修复，红测试转绿 |
| 第三轮 | technical-debt.test.ts（pre-aborted 补测） | 5 用例：2 红 3 绿 | 72/72 全绿 | `setupHardTimer()` 添加 `wasAborted` 守卫（推荐方案 A），pre-aborted 情况下不再错误武装硬计时器 |

## 最终测试运行结果

**运行命令：** `npm test`

```
Test Files  5 passed (5)
     Tests  72 passed (72)
```

- ✅ `config.test.ts` - 全部通过
- ✅ `cwd-resolution.test.ts` - 全部通过
- ✅ `progress-manager.test.ts` - 全部通过
- ✅ `technical-debt.test.ts` - 全部通过
- ✅ `timeout-behavior.test.ts` - 全部通过

**类型检查：** `npm run typecheck`（`tsc --noEmit`）每轮修复后均无错误。

## 变更范围（最终清单）

### 源代码（修复）

- `src/index.ts` — `runSubagent` 超时逻辑修复：
  1. stderr `data` 处理器中调用 `resetActivityTimer()`（缺陷 #1）
  2. `setupHardTimer()` 调用后启动初始活动计时器（缺陷 #2）
  3. 活动超时与硬超时回调中设置 `stopReason`（`"activity_timeout"` / `"hard_timeout"`，缺陷 #3）
  4. `setupHardTimer()` 添加 `wasAborted` 守卫，pre-aborted 时不武装硬计时器（Debt #5）

### 测试文件（新增/补充）

- `test/timeout-behavior.test.ts` — 新增 7 个测试（第一轮）
- `test/technical-debt.test.ts` — 第二轮 11 个用例 + 第三轮 pre-aborted 补测 5 个用例

## 状态

| 项目 | 状态 |
|------|------|
| 三轮缺陷修复 | ✅ 全部完成 |
| 测试全部通过（72/72） | ✅ Test Files 5 passed (5) |
| 类型检查（tsc --noEmit） | ✅ 无错误 |
| 现有测试无回归 | ✅ 49 个原有测试持续通过 |

---

**[tester: done]**

修复已完成并验证。测试套件 72/72 全绿，类型检查通过，超时技术债修复任务收尾。
