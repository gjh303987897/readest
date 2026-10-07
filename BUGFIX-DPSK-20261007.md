# Readest 代码复查与修复报告（BUGFIX-DPSK-20261007）

- 核验日期：2026-10-07（Asia/Shanghai）
- 仓库：`D:/workspace/readest`
- 核验基线：`023c3c0bb53073a5b8ce15bda75c53911b58e746` — `fix(app): resolve verified library and desktop defects`
- 范围：原报告 20 项已定级条目及 4 项疑似观察，共 **24 项**。逐项阅读所列代码、调用方、状态更新及必要的本地依赖实现，并执行受控诊断。没有把这次核验扩大为全仓审计。
- 核验阶段：纠正本报告，保留原文备份和诊断证据；该阶段未修改生产代码，临时诊断已移出源码目录。
- 后续修复阶段：按修订后的范围修改生产代码，新增正式回归测试；**修复、正式回归测试及本报告纳入本次本地 Git 提交。最新实施结果见第 8 节。**第 1–7 节保留基线上的核验结论和历史证据，所列代码行号属于修复前版本。
- 原报告写成时修复尚未提交；当前历史修复已包含在上述提交中。本报告判断的是该提交上的代码，旧编号仅用于追踪，编号中的 P1/P2/P3 不再代表修订后的等级。

## 1. 修订结论

| 核验结论 | 数量 | 编号 |
| --- | ---: | --- |
| 确认存在 | 8 | P1-1、P2-2、P2-6、P2-7、P3-1、P3-3、P3-5、P3-6 |
| 部分成立：代码条件成立，但原范围、影响、原因或运行路径需要收窄 | 13 | P1-2、P1-3、P1-4、P2-1、P2-3、P2-4、P2-5、P2-8、P3-2、P3-4、P3-7、P3-8、C3 |
| 原缺陷推断不成立 | 1 | C2 |
| 设计行为，尚无缺陷证据 | 1 | C4 |
| 待完整生命周期复现 | 1 | C1 |
| 合计 | 24 | C1–C4 对应原第 5 节的四项疑似观察 |

“部分成立”不等于 13 项均已造成用户故障：其中包含受控条件下的真实异常、尚未进入现有用户流程的 API 风险和正常设计下的资源优化候选。不能沿用原来的“4 项 P1、8 项 P2、8 项 P3”作为已确认事故统计。

主要纠正：

1. **活动传输取消后可被成功覆盖，已复现；“取消链路完全失效”过宽。**待处理任务可取消，取消后的新进度会被过滤，失败分支也会保留取消状态。
2. **Android 权限错误存在“未保存却 resolve”的分支；获权后的立即重试失败会 reject。**后者不是吞错分支，不能将两条路径混为一谈。
3. **键盘监听和回调问题成立，但普通 rerender 不会自动叠加监听。**保留同一元素并禁用/重启 effect 时会累积；未证明卸载节点形成永久内存泄漏。
4. **同步结果更新后的任务替换不等于自身发布引发无限重启。**旧任务的发布会被取消标记拦住，底层封面网络请求不会因该标记自动中断。
5. **`kr` 是合法的 Kanuri 语言码，`ko` 才是韩语。**错误在于 CJK 分类，而非 `kr` 本身非法。
6. **封面 memo 包含 `updatedAt`；阅读器事件绑定有明确 store 通知；共享 `/reader` 缓存键是页面壳设计。**不能省略这些机制直接断定标题永不刷新、事件永不绑定或书籍内容缓存串页。

## 2. 原 P1 条目核验

### P1-1：活动传输取消后仍可完成并覆盖取消状态

**确认存在；修订优先级 P2。**位置：`apps/readest-app/src/services/transferManager.ts:134`、`:279`、`:381`，及 `src/services/appService.ts` 的传输接口。

`cancelTransfer` 会 abort 控制器并标记 cancelled，但 `executeBookTransfer` 的 `_abortController` 未使用，上传/下载/删除接口也没有传入此信号。正常完成后，内部仍写入 `uploadedAt`/`downloadedAt` 并调用 `updateBook`，外层无取消检查便改为 completed。

受控验证：让上传 Promise 暂停，取消时状态为 cancelled；随后令上传成功，状态变成 completed，并写入时间戳、调用更新。这证明**活动传输的取消没有贯穿底层操作与完成写回**。

反例与影响边界：暂停队列后取消 pending 项，再恢复队列，该项不执行且保持 cancelled；进度处理器检查 aborted，catch 分支也检查 aborted。因此撤回“所有取消完全无效”。底层操作完成时，本地/云端可能都已经完成，不能仅凭状态回写就声称二者必然不一致或丢失文件。问题是用户的取消意图与队列呈现、继续写回不符。

建议：先保证取消后不发布成功结果或继续写回；再明确底层请求是否支持真正停止，以及不能撤销已完成远端操作的边界。不能仅在外层改状态而保留内部时间戳写回。

### P1-2：部分 Android 权限失败被当成保存成功

**部分成立；修订优先级 P1。**位置：`apps/readest-app/src/services/appService.ts:307–330`、`src/utils/permission.ts:12–26`。

触发条件须同时满足 Android 平台及 `isStoragePermissionError` 判定。首次失败后申请权限，若返回 false，会 warn 后 resolve；后续新的保存调用再次遇到权限错误且本会话已经申请过，也会 warn 后 resolve。调用方不能从结果区分“已保存”与“未保存”。现有测试明确断言拒绝权限时 resolve，这证明当前行为，不证明该行为对调用方足够安全。

**重要反例：**首次申请返回 true 后执行的是 `return await LibrarySvc.saveLibraryBooks(...)`；这次立即重试的拒绝会向上传递。新增诊断已验证其 reject。申请权限本身抛错、非权限错误以及非 Android 平台错误同样不由末尾 warn 吞掉。撤回“重试再次失败也一概正常 resolve”的表述。

实际风险：内存更新未落盘，退出后可能丢失本次未持久化的变化；不等于一定删除已有磁盘书籍，也没有真实 Android 拒权、退出重启后的数据损失实测。应将这是功能取舍后的错误契约缺口说清楚，不能仅以避免未处理 rejection 替代保存结果反馈。

建议：向调用方提供可辨识的未保存结果/错误，由调用方显示提示、保留待保存状态并重试；覆盖拒权、获权重试失败及后续再次失败。

### P1-3：元素监听清理不对称与过期键盘回调

**部分成立；修订优先级 P2。**位置：`apps/readest-app/src/hooks/useKeyDownActions.ts:25–68`；消费者包括 `components/Alert.tsx`、`Menu.tsx`、`Popup.tsx`。

元素监听未移除，effect 又没有用 ref/依赖更新 onCancel/onConfirm，两处问题均成立。诊断验证：换入新的 onCancel 后按 Escape 仍调用旧回调；同一元素经历 enabled=true → false → true 后，一次 Escape 调用回调两次。

原触发条件需纠正：**仅普通 rerender 不会使这个 effect 重新绑定**；监听累积需要 effect 重启且仍使用同一元素，例如 enabled 或 Android 标志变化。完全卸载、旧节点脱离且不再被引用时，没有证据证明其监听形成永久泄漏。不能将资源清理不对称直接等同高优先级持久内存泄漏。

建议：捕获本次绑定的元素并在 cleanup 对称移除，以 ref 读取最新回调；同时考虑 providedRef 或其元素改变时的绑定策略。

### P1-4：原地更新 settings 不通知整个 settings 对象的订阅者

**部分成立；修订优先级 P2。**位置：`apps/readest-app/src/hooks/useSync.ts:135–168`、`:176–179`；`src/store/settingsStore.ts:23`。

原地修改 latest 后 `setSettings(latest)` 确实保留同一个 settings 引用。诊断对真实 Zustand store 验证：`s => s.settings` 的 hook 不因此 rerender，但**订阅整个 store 的 hook 会 rerender**，因为外层 state 对象发生变化；直接选择已变化的标量也可收到新值。依赖 `[settings]` 的 memo/effect 不会仅因对象内部被修改而重新计算。

现有整个 settings 选择器包括 TTSPanel、useBookmarks、useBookmarkSync；它们证明这种订阅方式确实存在，但这次游标字段变更未证明这些界面一定发生可见故障。`useSync` 自己另有 lastSyncedAtBooks/Configs 局部状态，因此不能断定同步游标本身从此不更新。撤回“所有 settings 订阅组件均不重渲染”与未经验证的高优先级 UI 失效结论。

建议：以新对象更新游标及 keepLogin 等字段，保持不可变更新契约；针对实际使用字段的消费者验收。

## 3. 原 P2 条目核验

### P2-1：重导入返回的已有对象未取得新生成的封面 URL

**部分成立；修订优先级 P2。**位置：`apps/readest-app/src/services/bookService.ts:642–644`、`:210–214`。

新 URL 赋给临时 book，返回却是 existingBook。完整 importBook 的受控测试验证：原 URL 为空时仍为空；原 URL 为 `blob:old` 时仍为旧值，虽然生成函数返回 `blob:fresh`。因此缺少“把本次生成结果交给返回对象”的步骤。

撤回“重新导入一定丢失封面 URL”：代码没有主动清空已有 URL；同 hash 原 URL 仍可有效，桌面 URL 常由固定路径生成。Web blob 或 metaHash 换 hash/目录等情形更可能需要新 URL，但这次没有实际图像失效端到端复现。

建议：把新 URL 写到实际返回对象，并结合路径/覆盖变化验证；不要假定重新导入必然清空已有封面。

### P2-2：Web removeDir 使用无目录边界的前缀

**确认存在；修订优先级 P2。**位置：`apps/readest-app/src/services/webAppService.ts:167–188`。

受控 IndexedDB 接口中执行真实 fs.removeDir('ab', 'Books')，同时匹配并删除 `Readest/Books/ab/file.epub` 和 `Readest/Books/abc/file.epub`。`startsWith(fp)` 缺少目录分隔符边界；readDir 已有正确的 prefix 处理，但不会替 removeDir 提供保护。

测试使用模拟 IndexedDB 事务/记录，没有删除真实浏览器数据。普通不同书籍的完整定长 MD5 hash 通常不会形成这种严格前缀关系，因此这个短目录示例不是已证明的常规书籍删除事故；API 在合法的任意目录前缀上仍有误删缺陷。

建议：仅删除目录记录自身或 `fp + '/'` 下的记录，正确处理根目录与结尾已有分隔符。

### P2-3：阅读器关闭节流按 render 重建，缺数据分支在 render 调度定时器

**部分成立；修订优先级 P2。**位置：`apps/readest-app/src/app/reader/components/ReaderContent.tsx:193–197`、`:239–244`。

两处代码结构成立。诊断从当前源码提取实际初始化表达式：两个“render”产生的节流实例在同一 200 ms 窗口各执行一次关闭；提取缺数据分支，执行两次便产生两次延时 setLoading。它们验证局部函数的行为，**不是完整 ReaderContent 用户端重复关闭复现**。

同一实例内节流仍有效；必须有两次触发分别经过重渲染前后的不同实例，或旧实例尾调用尚未清理，才能跨实例重复。渲染期 timer 仅在书籍数据/文档/设置缺失分支调度，并非每次正常 reader render 都创建。不能直接概括为关闭节流完全失效或始终重复保存。

建议：稳定节流并更新其依赖/回调，清理尾调用；将 loading timer 移入 effect，定义明确的缺数据条件及 cleanup。

### P2-4：新同步结果替换旧任务；并非自身发布循环

**部分成立（资源优化候选）；修订优先级 P3。**位置：`apps/readest-app/src/app/library/hooks/useBooksSync.ts:119–208`。

syncedBooks 引用变化会替换 updateLibrary/debounce，cleanup 将旧 controller 标为 aborted 并清理去抖，再安排新结果的处理。这是**新结果优先、阻止旧结果发布**的机制，不能仅凭依赖变化认定为功能缺陷。

反例测试：同一同步结果完成 setLibrary/save 后再 rerender，封面下载和保存各只有一次；library/isSyncing 不在该 effect 的启动依赖中，**自身发布不会因此重启同一任务**。

条件性资源问题：新结果在旧封面请求等待时到达，可安排新请求；downloadBookCovers 未接收此 signal，标记 aborted 不会终止底层旧网络请求。诊断验证旧请求继续等候，结束后不发布旧书库；最终只有新任务保存一次。原“下载任务被中途 abort、产生重复写盘”缺少依据，应改成“旧发布被取消，底层网络仍可能完成；重复网络工作取决于结果变化频率和内容”。也未复现进度重置循环。

建议：若实际观察到高频相同结果/重复网络开销，再做结果去重、增量处理或向下传递取消；不要简单把 syncedBooks 放进 ref 而漏处理真正的新结果。

### P2-5：自动保存的延时可能越过卸载；旧环境仅为条件性问题

**部分成立；修订优先级 P2。**位置：`apps/readest-app/src/app/reader/hooks/useProgressAutoSave.ts:26–44`、`:69–81`；`src/context/EnvContext.tsx:17`。

未清理的 1 秒 debounce 和其 500 ms timer 都可能越过卸载。保留 config、改变 location 后卸载的诊断，1.5 秒后确实调用 saveConfig；现有卸载动作 flushPendingLibrarySave 已执行，但它不是取消/flush 这个 config 保存 timer。

该回调执行时重新 getConfig，因此**并不持有旧 config 快照**。如果 config 已清除则会直接 return；没有据此证明旧进度必然覆盖新进度。人为替换 envConfig 的 hook 测试会使用最初环境，但真实 EnvProvider 使用一次初始化的 useState 保存 envConfig，当前 provider 内不会正常替换这个对象，不能将“旧 envConfig 写盘”当作已复现的正常用户流程。

建议：明确卸载时应 flush 最新 config 还是取消尾任务，保留最后阅读位置；然后清理内层 timer。不能仅取消两个 timer 而忽略最后进度的持久化需求。

### P2-6：URI 文件名中的非法百分号编码可抛 URIError

**确认存在；修订优先级 P2。**位置：`apps/readest-app/src/utils/path.ts:4–12`。

`getFilename('file:///books/50% off.epub')` 实际抛 URIError；非法/不完整百分号编码也可触发。只在被识别为 URL、content URI 或 file URI 后才 decodeURI；`D:\books\50% off.epub` 等普通本地路径不会在这里解码，测试能正常提取文件名。

影响为相应调用失败，外围能否恢复取决于调用方 catch，不等于所有导入/列表都会崩溃。建议对解码失败回退原值或返回可辨识错误，并覆盖各 URI 类型。

### P2-7：非 JSON 错误响应使 fetchWithAuth 丢失 HTTP 错误语义

**确认存在；修订优先级 P2。**位置：`apps/readest-app/src/utils/fetch.ts:25–29`。

受控 502 HTML 响应使真实 fetchWithAuth 抛 SyntaxError，而未走后续业务错误构造；空响应体也存在同类路径。报告应限定这个 helper，不能推断全仓所有 HTTP 错误处理都相同。即使是 JSON 分支，无 error 字段时实际 throw 的 fallback 是 `Request failed`，并非 statusText。

建议：容错读取/解析错误响应，并保留 HTTP 状态及合理 fallback；不能只依赖 Content-Type，因为响应头也可能失真。

### P2-8：PostgREST 过滤表达式中的客户端值未做语法隔离

**部分成立；修订优先级 P2。**位置：`apps/readest-app/src/pages/api/sync.ts:297–316`；`src/utils/transform.ts`；`src/utils/supabase.ts:55–66`。

orConditions 直接拼接值属实；对象中的 user_id 被服务端用户身份覆盖，但 book_hash 和 notes 主键 id 等客户端值仍进入 PostgREST 过滤表达式。受控测试用当前源码生成表达式并调用真实 Supabase SDK，确认其 URL 编码没有移除表达式中的 `,`/`)` 语法。这是过滤语法污染风险，**不是 SQL 原文拼接**。

没有连接真实 PostgREST 验证具体输入的解析结果。某些字符/表达式可能导致解析错误或改变匹配范围，不能断定任何含逗号/括号的值都必然返回 500；若后端 fetchError 返回，当前 API 确有转成 500 的路径。

RLS 边界须有条件：仓库 schema 为 books/book_configs/book_notes 启用按 auth.uid() 限制的策略；该接口使用 anon key + 用户 Authorization token 创建普通 client，没有调用 createSupabaseAdminClient。**在正确部署这些策略、密钥及普通权限模型时，RLS 提供跨用户隔离。**本次未审计已部署数据库策略/密钥，撤回无条件的“绝不构成跨用户泄露”保证；也没有证据升级为已复现越权。

建议：按真实主键格式验证所有进入表达式的值，或采用安全构造方式；只约束 book_hash 为十六进制不覆盖 notes.id。增加真实 PostgREST/RLS 验证后再扩大影响结论。

## 4. 原 P3 条目核验

| 原编号 / 修订结论 | 当前代码位置（前缀 `apps/readest-app/`） | 验证结果与影响纠正 | 建议 |
| --- | --- | --- | --- |
| **P3-1：确认存在，P3** | `src/utils/number.ts:28–29` | 实际 `localizeNumber(100000000,'zh-CN')` 为 `一亿万`；`200005000` 为 `二亿万五千`。需处理整个四位组，而非仅判断万位单个数字是否为零，否则会误伤万位为零但该组仍非零的数。常用小数值/非中文输出不因此全部错误。 | 按四位分组处理万/亿及组间零；覆盖整亿、跨组零和一般非零组。 |
| **P3-2：部分成立，P3** | `src/utils/lang.ts:160–170` | ko-KR 被此函数标为非 CJK，kr 被标为 CJK。**kr 合法，代表 Kanuri；ko 才代表 Korean。**当前消费者 languageTransformer 读取的是 direction，另一个 isCJKLang 已正确包含 ko/kor；不能据此声称全应用韩语字体/CJK 行为恒定失败。语言码依据见下方标准来源。 | 修正该返回字段的分类；按实际消费者评估显示影响。 |
| **P3-3：确认存在，P3** | `src/libs/storage.ts:17–35` | 总量为 0 时，0/0 实际向回调传 NaN，1/0 传 Infinity。TransferManager 的另一处 total>0 保护不能修复这个聚合函数内部先产生的值；不代表未知总量下载必然失败。 | 将未知总量作为不确定进度处理，同时定义 totalFiles 为 0 的行为。 |
| **P3-4：部分成立，P3** | `src/utils/file.ts:346–375` 及 `:393` 后读取代码 | 对缺失大小头的 200 响应，HEAD/X-Total-Size 路径实际 size=0，Content-Range 路径为 NaN。缺乏契约校验成立；需要相应服务器响应缺失/不合法才触发。没有实测所有后续缓存/分片静默失败；正常空文件 size=0 也不是异常。 | 校验响应状态、范围和可用大小，区分空文件/未知大小/非法声明；必要时有限 fallback。 |
| **P3-5：确认存在，P3** | `src/utils/validation.ts:78–124` | `2023-02-31` 实际返回 isValid=true 和 `2023-03-03T00:00:00.000Z`；格式及日值 1–31 校验不等于真实日历日校验。未实际编辑保存用户元数据。 | 比较解析后的年月日与输入，覆盖闰年、月末及无效日期。 |
| **P3-6：确认存在，P3** | `src/components/Toast.tsx:72–118` | 先显示 timeout=2000 的 toast，再显示未指定 timeout 的 toast，后者仍按 2000 ms 而非初始 5000 ms 消失；callback timer 在卸载后仍执行，均已用真实组件验证。callback 的生命周期是否应独立于 Toast 仍需产品决定，不能简单认为所有延迟 callback 都应取消。 | 每条 toast 明确默认时长，跟踪/定义回调及动画清理 timer 的生命周期。 |
| **P3-7：部分成立，P3** | `src/components/BookCover.tsx:136–150` | 保持 updatedAt/URL/样式不变、只换 title 和 onImageError 时，实际保留旧文案并调用旧回调；比较器缺字段成立。**updatedAt 改变时，新标题可以刷新**，测试有反例。因此需限定字段更新和引用条件，不能声称标题/作者变化一律不更新。 | 比较渲染和事件使用的完整 props，或采用一致的不可变版本契约；验证 title、author 及两个回调。 |
| **P3-8：部分成立，P3** | `src/hooks/useTransferQueue.ts:24–40` | 挂载后立即卸载，delayInit 到期仍调用 initialize，诊断确认；没有组件 cleanup。真实管理器在初始化前部同步设置幂等标志，重复调用不等于重复初始化/重复传输。它是全局后台队列，是否必须随某个 UI 卸载而取消初始化需要明确，未证明已有用户流程失效。 | 若此延时属于当前界面任务则清理；若为全局启动则明确所有权并避免过期参数/多余调度。 |

P3-2 的语言码事实依据：[Library of Congress ISO 639 code list](https://www.loc.gov/standards/iso639-2/php/code_list.php)。此来源仅用于核对语言码，其他条目依据当前仓库代码和本地验证。

## 5. 原疑似观察核验（C1–C4）

### C1：空值非空断言引发阅读器生命周期异常

**待完整生命周期复现，未按已确认用户缺陷定级。**位置：`src/app/reader/components/sidebar/SearchBar.tsx:100`、`:209` 等；`src/app/reader/components/ProgressBar.tsx:40`；`src/app/reader/components/FoliateViewer.tsx:538`、`:719`。本节路径前缀为 `apps/readest-app/`。

`!` 只影响类型检查，不提供运行时保护；ProgressBar 的 viewSettings 随后被直接解引用，SearchBar 部分事件也会使用 view。因此在确实缺少对应 state 的条件下可以抛错。

但不能省略父组件约束：BooksGrid 的 BookCell 在没有 book/config/bookDoc/viewSettings/viewState 时 return null；SideBar 至少验证书籍及文档才挂载内容。SearchBar 没有单独保证 view 已就绪，异步 open/关闭期间仍值得验证。FoliateViewer 的 applyMarginAndGap 已有 null guard，不能把该处也计为当前缺陷。

还需通过“慢 openBook → 提前搜索/关闭 → 事件或主题变化”完整流程确认哪个回调实际越过卸载和父层 guard。没有进行此生命周期端到端复现，不能仅按 `!` 的数量宣布崩溃已发生。

### C2：ref 写入后没有可靠重渲染，事件只能靠无关 rerender 绑定

**原推断不成立。**位置：`src/app/reader/components/FoliateViewer.tsx:515–517`、`:558–559`；`src/app/reader/hooks/useCapturedTurn.ts:230–266`；`src/store/readerStore.ts:102–108`。

写 ref 本身不触发 rerender 属实，但完整路径随后调用 setFoliateView（实际为 setView）更新 viewStates。useCapturedTurn 在同一组件内使用无 selector 的 useReaderStore，订阅整个 store；BookCell 也订阅该书的 viewState。**有明确的相关状态通知，不能归因于偶然无关重渲染。**

受控 hook 适配验证：使用同样的整 store 订阅及真实 useFoliateEvents，写 ref 后 setView 即完成绑定，relocate 能被处理。这不是整个 FoliateViewer/native capture 的端到端测试。首次 view.init 是否可能在 effect 绑定前发出早期事件是另一项时序问题，需独立复现，不能把它替换为“永远不绑定”。

### C3：syncConfigs 在同一 hook 内更换 bookKey 时保留旧闭包

**部分成立（条件性 API 风险）；修订观察优先级 P3。**位置：`apps/readest-app/src/hooks/useSync.ts:212–232`。

诊断强制同一 useSync 实例从 book-a rerender 为 book-b，游标/初始化依赖不变；syncConfigs 引用仍相同，调用后 setConfig 使用 book-a，旧闭包风险成立。

当前带 bookKey 的消费者是 FoliateViewer 内的 useProgressSync；BooksGrid 的 BookCell 按 bookKey 设 key，FoliateViewer 还有 viewerKey。正常切换书籍通常重建该实例，**尚未发现并复现现有 UI 把同一实例换成另一 bookKey 的流程**。因此不能把测试强制复用当成用户端错书配置事故。

建议：补足依赖或使用最新 ref，并明确初始化状态的 bookKey 生命周期；优先级应与实际复用路径证据相称。

### C4：Service Worker 将同类阅读器导航合并缓存键

**设计行为，尚无缺陷证据。**位置：`apps/readest-app/src/sw.ts:31–53`；`src/pages/reader/[ids].tsx`；`src/app/reader/components/Reader.tsx:52–58`。

键合并属实，诊断确认 `/reader/book-a?...` 与 `/reader/book-b?...` 均得到 `${origin}/reader`；但规则只匹配 navigate 文档，缓存的是页面壳，**不是书籍文件/blob、书籍数据库记录或搜索结果**。

Reader 从 ids prop、window.location.search 或 pathname 获取目标书籍，页面入口也从客户端 router.query 取得 ids。相同外壳被复用本身不能证明打开错误书籍。原报告已经提到壳设计的可能性，修订结论应明确不把合并键直接算缺陷。

若要证明缓存问题，需在实际启用 SW 的 Web/PWA 构建中测试离线跨书籍导航、混合 App/Pages 路由与 hydration 的一致性。此次没有做该测试，也不保证所有离线场景均无异常。

## 6. 修复前核验的方法与证据

- **8 个测试文件、150 项通过。**其中 **31 项为新增诊断**，119 项为复制运行的既有相关测试。诊断有意断言缺陷行为和反例；测试通过表示观察被验证，**不表示问题已修复**。
- 真实执行的对象包括 transferManager/store、BaseAppService、完整 importBook、Web removeDir、useKeyDownActions、useProgressAutoSave、useSync、useBooksSync、useTransferQueue、Toast、BookCover 及多个工具函数。网络、文档加载、Android 权限和 IndexedDB 数据/事务均为受控依赖，未使用真实账户/书库。
- ReaderContent 两处表达式、API orConditions 以及 SW 键回调由 TypeScript AST 从当前源码提取执行；验证这些局部逻辑，不构成整页渲染、PostgREST 服务器解析或实际 Service Worker 缓存运行。
- C2 使用真实 reader store/useFoliateEvents 和与 useCapturedTurn 相同的 store 订阅方式做适配验证，没有运行整个 FoliateViewer 的原生捕获路径。
- 本次未做真实 Android 系统权限、已部署数据库 RLS、阅读器销毁时序、PWA 离线 E2E 或全仓资源耗尽测试；未新增生产构建。历史提交已有的构建/回归结果不能代替这些条目的专项运行验证。

证据保存在被忽略的 `.devtools/report-verification/`：

| 文件 | 内容 |
| --- | --- |
| `BUGFIX-DPSK-20261007.original.md` | 修改前原文 |
| `dpsk-tests-final.log` | 最终 8 文件/150 项的逐项测试结果 |
| `dpsk-verification/utilities.test.tsx` | 边界输入、键盘、settings、自动保存、Toast、封面诊断 |
| `dpsk-verification/app-service.test.ts` | Android 保存既有测试及获权后重试失败反例 |
| `dpsk-verification/import-cover.test.ts` | 既有导入测试及两个返回封面 URL 诊断 |
| `dpsk-verification/transfer.test.ts` | 既有传输测试及活动/待处理取消诊断 |
| `dpsk-verification/web-filesystem.test.ts` | 既有 Web service 测试及真实 removeDir 前缀诊断 |
| `dpsk-verification/sync-lifecycle.test.tsx` | 既有书库回归及自身发布/新结果替换诊断 |
| `dpsk-verification/source-and-lifecycle.test.tsx` | AST 局部执行、SDK 过滤表达式及生命周期反例 |
| `dpsk-verification/sync-closure.test.tsx` | 强制复用 useSync 实例的旧 bookKey 诊断 |

临时文件测试时位于 `apps/readest-app/src/__tests__/dpsk-verification/`，结束后移至上述证据目录。它们断言的是修复前行为，只能在核验基线的独立副本中用于复核，不能当作当前修复代码的通过标准。当前验收使用第 8 节列出的正式回归测试。忽略目录中的证据不会自动进入 Git 提交。

## 7. 修订后的处理建议

| 顺序 | 条目与等级 | 验收重点 |
| ---: | --- | --- |
| 1 | **P1-2：P1** | 未保存的权限失败对调用方可见；拒权、获权重试失败及后续保存分支分别验收，不删除已有书库、不静默丢失未保存状态。 |
| 2 | **P1-1、P2-2：P2** | 活动取消不被完成/写回覆盖；明确底层取消和已完成操作的语义；Web 目录删除有边界，不误匹配兄弟目录。 |
| 3 | **P1-3、P1-4、P2-1：P2** | 同一元素禁用/重启后只有一个最新回调；settings 不可变更新；封面生成结果交给真实返回对象。 |
| 4 | **P2-3、P2-5：P2** | 节流实例稳定，render 无 timer 副作用；定义并验收卸载后的最后进度保存/flush，而非只删 timer。 |
| 5 | **P2-6、P2-7、P2-8：P2** | 非法 URI 编码可恢复；HTTP 错误保留状态信息；客户端主键不能破坏过滤语法，并在实际 PostgREST/RLS 环境验证。 |
| 6 | **P3-1–P3-8：P3；P2-4、C3：P3 观察项** | 各工具/组件边界按本文条件回归；同步结果去重和 hook 复用先补真实影响证据，避免把正常任务替换当成缺陷。 |
| 7 | **C1：待复现；C2：撤回原推断；C4：设计行为** | C1 补完整打开/关闭/提前操作场景；C2 若发现早期事件遗漏，单独复现；C4 以实际 PWA 离线/路由结果判断。 |

对前 21 项确认/部分成立条目的处理与观察分组为：**P1 1 项、P2 10 项、P3 10 项**。这是修订后的工作排序，不是 21 项均已发生用户故障的统计。C1/C2/C4 不并入已定级缺陷数量。

## 8. 按修订结论实施的修复（2026-10-07）

20 个原定级条目及 C3 的明确代码条件已处理。其中 P2-4 属于资源优化、C3 属于 hook 复用时的防护，不计为新确认的用户事故。其余三项按核验结论保留：C1 待完整生命周期复现，C2 原推断撤回，C4 保持页面壳缓存设计。

### 8.1 实施结果

| 编号 | 当前处理 | 修复后的行为与验收重点 |
| --- | --- | --- |
| P1-1 | 已修复取消状态和迟到写回；增加可用的底层取消 | 传输使用书籍副本；取消后不更新书库时间戳、不发布完成提示、不发布缓冲中的进度。取消信号传到签名 URL 请求、云端删除请求和 Web 上传/下载。原生传输边界见下文。 |
| P1-2 | 已修复 | Android 拒权及会话内后续拒权保存均 reject 原错误；仍只申请一次权限；获权后的立即重试失败继续 reject。正常保存行为不变。 |
| P1-3 | 已修复 | 键盘/native Back 使用最新回调；cleanup 同时移除 window 和当次绑定元素上的监听；禁用/重启及卸载后无重复响应。 |
| P1-4 | 已修复 | 分页游标、书籍/配置同步时间和认证失败的 keepLogin 均用新 settings 对象发布；订阅 settings 的组件获得更新，旧对象不被修改。 |
| P2-1 | 已修复 | 重新导入生成的封面 URL 赋给实际返回的 existingBook 或新书对象；验证缺失旧 URL 和已有旧 URL 两种情况。 |
| P2-2 | 已修复 | Web removeDir 仅匹配目录记录本身或带 `/` 边界的子路径；含尾部 `/` 的输入也不会删除同前缀兄弟目录。 |
| P2-3 | 已修复 | ReaderContent 关闭节流实例跨 rerender 保持稳定并在卸载时取消；加载延迟改为 effect 中单一、可清理的计时器，render 不再创建 timer。 |
| P2-4 | 已完成资源防护 | 同步封面任务的 AbortSignal 传入下载链；被替换的任务停止可中止的请求，结果仍按 latest-wins 发布。没有把正常的新结果任务替换改成错误，也没有添加未经证实必需的结果去重。 |
| P2-5 | 已修复 | 自动保存改为一个 1500ms 防抖；使用最新环境；每本书独立保存会话；卸载取消延迟并捕获最后 config，等待 per-book 保存后再 flush 书库。初始 relocate 仍不抬高 updatedAt。 |
| P2-6 | 已修复 | URI 解码失败时保留原字符串提取文件名；原生路径、正常百分号编码及格式不完整的 `%` 均可处理。 |
| P2-7 | 已修复 | HTML/空响应等非 JSON 错误不会用 JSON 解析异常覆盖 HTTP 错误；保留状态码和状态文本，合法后端 error 字符串仍优先显示。 |
| P2-8 | 已修复过滤表达式构造 | POST 主键及 GET 组合筛选使用 PostgREST 双引号字面量，转义引号与反斜线；逗号、括号等作为值传递。数据库 RLS 实环境仍未执行，见验证边界。 |
| P3-1 | 已修复 | 中文数字按四位分组，仅为非零组附加万/亿/万亿，补正确跨组零；保留繁体、索引数字和非中文输出。 |
| P3-2 | 已修复 | CJK 分类使用 ko；kr 仍是可接受的 Kanuri 语言码，但不再被当作 CJK。 |
| P3-3 | 已修复 | 未知/非法总量产生有限值和 total=0 的不确定进度；已知总量按文件批次聚合且限定 0–100。 |
| P3-4 | 已修复 | RemoteFile 的大小头必须为非负安全整数；范围探测必须有符合请求的 206 Content-Range；缺失、非法或不匹配的大小明确报错，不再静默返回 0/NaN。合法零字节 HEAD 仍可用。 |
| P3-5 | 已修复 | 对照解析结果的 UTC 年/月/日，拒绝自动滚到下一月的无效日期；有效闰日及年/月简写继续通过。 |
| P3-6 | 已修复 | 每次 Toast 恢复默认 5000ms 或使用此次自定义值；替换/重复消息重新计时；旧消失动画不能清除新消息；卸载清理显示、关闭、清空和回调计时器。 |
| P3-7 | 已修复 | BookCover memo 比较补齐标题、作者、metadata.author 和两个回调；updatedAt 不变也能刷新文本和事件处理。 |
| P3-8 | 已修复 | useTransferQueue 清理尚未触发的延迟初始化；依赖变化只保留最新延迟；不销毁其他页面共用的已初始化管理器。 |
| C3 | 已加固 | useSync 的 pull/push 回调依赖完整，切换 bookKey 重新初始化对应游标；复用实例时配置同步写入当前书籍。现有 keyed viewer 的正常结构保留。 |

### 8.2 取消和卸载语义

- **原生 Tauri 上传/下载目前没有中途停止的命令。**本轮保证取消后不发布其完成结果、时间戳或封面状态，并阻止后续请求和写回；已经启动的原生 I/O 仍可能完成并留下文件/远端对象。取消不能撤销已经完成的云端操作。本报告不将该边界写成“原生网络传输已经立即终止”。
- Web 请求可用 AbortSignal/abort 中止；签名 URL、删除及封面批次请求使用同一信号。任务替换仍由旧任务的信号保护书库发布。
- 自动保存取消延迟任务后主动保存最后进度，避免单纯清掉计时器造成进度丢失。配置已由其他销毁逻辑清除时不再写入；已有保存任务先结束再刷新书库。
- Toast 被下一条替换时，已有业务 callback 保留原定执行时间；Toast 整体卸载时取消这些回调，避免旧页面上的延迟操作。相同消息再次展示会重新计算显示时长。

### 8.3 本轮回归与验证边界

正式回归测试位于 `apps/readest-app/src/__tests__/`，包含工具边界、键盘/native Back、自动保存、同步不可变状态及 hook 复用、ReaderContent 整组件生命周期、Toast/封面、真实 importBook、Web removeDir、传输管理器和浏览器传输取消。原有相关测试与新增用例一起运行；网络、权限、IndexedDB 事务及书籍数据为受控依赖，不操作个人账户或真实书库。

本轮新增 **65 项正式回归用例**，并修订两项既有拒权保存测试，使其验收正确的失败契约。结果如下：

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 主要修复版本的全量 Vitest 单元回归 | **239 个文件通过；2999 项通过、1 项跳过**；排除 `scripts/version.test.mjs`，该文件属于独立 Node 测试命令 | `dpsk-fix-full-final.log` |
| 末轮取消日志/清理收尾后的相关回归 | **6 个文件、136 项通过**，包含额外新增的“正常取消不产生 console error”用例 | `dpsk-fix-final-targeted.log` |
| 独立 Node 版本测试 | **3 项通过**，单独执行 `scripts/version.test.mjs` | `dpsk-fix-version.log` |
| 专项初轮回归 | 11 个文件、182 项通过；随后 ReaderContent 整组件与浏览器取消 2 个文件、6 项通过，均已纳入全量回归 | `dpsk-fix-focused.log`、`dpsk-fix-extra.log` |
| TypeScript 类型检查 | **通过**，使用仓库安装的 `tsgo --noEmit` | `dpsk-fix-types.log` |
| 改动文件格式与静态检查 | **35 个源码/测试文件通过**，无 lint 错误；`git diff --check` 通过 | `dpsk-fix-format.log`、`dpsk-fix-lint.log` |
| Tauri 前端生产构建 | **通过**，Next.js 完成编译、类型检查、静态页面生成与导出 | `dpsk-fix-build.log` |

全量首轮在受限 Windows 进程环境出现 `spawn EBUSY`，只执行部分文件，**不算通过结果**；在正常本地执行权限下重跑得到上述全量通过结果。日志中的 Vite tsconfig 扫描警告来自忽略目录里的 Rust 依赖源码；生产构建仍有既有的静态导出 headers/rewrites 与 `styled-jsx/style.js` 警告，构建退出码为 0。本轮未改动 Rust，未重新执行原生 Rust 编译/测试，也未新增实际桌面 UI 自动化验收。

尚未实测真实 Android 权限页面、部署中的 PostgREST/RLS、真实云账户取消与 PWA 离线导航；C1 的完整阅读器销毁/早期操作场景仍待复现。回归通过不能替代这些运行环境的验证。

核验阶段报告备份：`.devtools/report-verification/BUGFIX-DPSK-20261007.verified-before-fixes.md`。原始诊断及此次检查日志同目录保留；新增正式测试随生产修复一起归档到本次提交。
