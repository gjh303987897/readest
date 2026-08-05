# 同步 API

同步端点同时负责书库、阅读进度和书签。请求和响应均为 JSON，且必须携带 Bearer token。

## `GET /api/sync`

拉取指定时间之后发生变化或删除的记录。

查询参数：

| 参数 | 必需 | 说明 |
| --- | --- | --- |
| `since` | 是 | Unix 毫秒时间戳 |
| `type` | 否 | `books`、`configs` 或 `notes`；省略时返回全部类型 |
| `book` | 否 | 按 `book_hash` 过滤 |
| `meta_hash` | 否 | 按 `meta_hash` 过滤；与 `book` 同时提供时使用 OR |
| `limit` | 否 | `type=books` 时启用分页，最小值为 1 |

书签拉取示例：

```http
GET /api/sync?since=0&type=notes&book=0123456789abcdef0123456789abcdef
Authorization: Bearer <token>
```

成功响应始终包含三个数组：

```json
{
  "books": [],
  "configs": [],
  "notes": [
    {
      "user_id": "2e193ca5-2df7-4a11-8de0-aaf42f278fb1",
      "book_hash": "0123456789abcdef0123456789abcdef",
      "meta_hash": "metadata-hash",
      "id": "1722859200000-a1b2c3",
      "type": "bookmark",
      "cfi": "epubcfi(/6/8!/4/2)",
      "text": "第二章",
      "note": "需要重读",
      "page": 17,
      "created_at": "2026-08-05T12:00:00.000Z",
      "updated_at": "2026-08-05T12:01:00.000Z",
      "deleted_at": null
    }
  ]
}
```

GET 返回数据库字段名，即 snake_case。

### 增量游标

- `books` 使用服务端生成的 `synced_at` 作为游标，确保服务端合并后的改动仍能被拉取。
- `configs` 和 `notes` 使用 `updated_at` 或 `deleted_at`。
- 前端当前对单本书的书签使用 `since=0` 做完整拉取，再按 ID 合并。这样不会依赖设备本地游标。
- `books` 的分页结果按 `synced_at` 升序返回，并补齐与最后一条拥有相同时间戳的记录。

## `POST /api/sync`

推送一个或多个类型的本地记录。请求字段使用前端的 camelCase 模型，响应使用数据库的 snake_case 模型。

```http
POST /api/sync
Authorization: Bearer <token>
Content-Type: application/json
```

书签推送示例：

```json
{
  "notes": [
    {
      "bookHash": "0123456789abcdef0123456789abcdef",
      "metaHash": "metadata-hash",
      "id": "1722859200000-a1b2c3",
      "type": "bookmark",
      "cfi": "epubcfi(/6/8!/4/2)",
      "text": "第二章",
      "note": "需要重读",
      "page": 17,
      "createdAt": 1785902400000,
      "updatedAt": 1785902460000,
      "deletedAt": null
    }
  ]
}
```

完整请求外形：

```ts
interface SyncData {
  books?: BookRecord[];
  configs?: BookConfigRecord[];
  notes?: BookNoteRecord[];
}
```

成功响应包含服务端最终确认的记录：

```json
{
  "books": [],
  "configs": [],
  "notes": []
}
```

响应不能简单回显客户端数据。发生冲突时必须返回最终保留的服务端记录，前端会再次合并它。

## 冲突处理

记录按主键匹配：

| 类型 | 主键 |
| --- | --- |
| `books` | `user_id + book_hash` |
| `configs` | `user_id + book_hash` |
| `notes` | `user_id + book_hash + id` |

通用策略为最后写入者胜出：比较 `updated_at` 和 `deleted_at`，任一客户端时间较新时写入客户端记录，否则保留并返回服务端记录。`books.cover_hash` 另按 `cover_updated_at` 做字段级合并。

服务端必须覆盖客户端传入的 `user_id`。新记录插入时，当前实现会将 `updated_at` 更新为服务端当前时间。

## 阅读进度字段

`configs` 只同步远端阅读进度合同：

```json
{
  "bookHash": "0123456789abcdef0123456789abcdef",
  "metaHash": "metadata-hash",
  "location": "epubcfi(/6/8!/4/2)",
  "progress": [17, 200],
  "updatedAt": 1785902460000
}
```

数据库中的 `progress` 是 JSONB。配置推送成功后，后端还会尽力把页数进度和更新时间写入匹配的 `books` 行，供书库界面在其他设备上显示。

## 书签字段映射

前端书签复用 `book_notes` 表：

| 前端书签 | notes 请求 | 数据库列 | 说明 |
| --- | --- | --- | --- |
| `id` | `id` | `id` | 每个书签独立 ID，同一页可有多个 |
| `location` | `cfi` | `cfi` | 可导航的 EPUB CFI 或阅读器位置 |
| `title` | `note` | `note` | 用户标题，前端限制最多 50 个 Unicode 字符 |
| `sectionLabel` | `text` | `text` | 章节名称 |
| `page` | `page` | `page` | 可选页码 |
| `createdAt` | `createdAt` | `created_at` | 创建时间 |
| `updatedAt` | `updatedAt` | `updated_at` | 改名或更新的时间 |
| `deletedAt` | `deletedAt` | `deleted_at` | 删除墓碑时间 |

删除书签时不能立即物理删除记录。前端保留原 `id`、位置和内容，设置 `deletedAt`，并同步墓碑。其他设备拉取后隐藏该记录，从而避免旧设备把它重新创建。

当前 Readest 客户端读取 `type=bookmark` 且包含 `cfi` 的 notes。KOReader 插件使用 `xpointer0` 定位，这类记录后端可以原样保存，但 Readest 前端目前不会把只有 XPointer、没有 CFI 的记录显示成可跳转书签。

## 错误响应

| 状态码 | 场景 |
| --- | --- |
| `400` | 缺少或无效的 `since`、不支持的类型或请求数据 |
| `403` | 未认证或令牌无效 |
| `405` | 不是 GET 或 POST |
| `500` | 数据库查询、插入或更新失败 |

错误格式：

```json
{
  "error": "error description"
}
```
