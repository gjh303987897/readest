# Readest 前端所需后端 API

本文档依据 `apps/readest-app` 当前代码、`docker/volumes/db/init/schema.sql` 和实际 API 路由整理。它描述 Web、Tauri、Android 和 iOS 前端连接自托管后端时必须提供的能力。

## 能力清单

| 能力 | 前端入口 | 后端要求 |
| --- | --- | --- |
| 运行时配置 | `GET /runtime-config.js?format=json` | 返回 Supabase 和业务 API 地址 |
| 用户认证 | Supabase Auth SDK | 邮箱注册、登录、密码找回、令牌刷新和退出 |
| 元数据同步 | `GET/POST /api/sync` | 同步书库、阅读进度和书签 |
| 文件上传 | `POST /api/storage/upload` | 登记文件并返回预签名 PUT URL |
| 文件下载 | `GET/POST /api/storage/download` | 返回一个或一批预签名 GET URL |
| 文件删除 | `DELETE /api/storage/delete` | 删除对象和文件记录 |

前端当前没有调用 `/api/storage/list`，也没有独立的书签端点。书签通过 `/api/sync` 的 `notes` 通道同步。

## 地址规则

用户可以在登录页填写后端根地址，例如 `https://reader.example.com`。前端先读取运行时配置，再将 `apiBaseUrl` 与 `/api` 拼接为业务 API 根地址：

```text
https://reader.example.com/api
```

Web 开发模式使用同源 `/api`。生产 Web 和所有 Tauri 客户端使用配置中的绝对地址。

## 通用认证

除运行时配置外，本文档中的业务 API 都需要：

```http
Authorization: Bearer <supabase_access_token>
```

缺少或无法验证令牌时返回：

```json
{
  "error": "Not authenticated"
}
```

当前实现使用 HTTP `403`，不是 `401`。后端必须从令牌解析当前用户，且不能信任请求体中的 `user_id`。数据库中的 `books`、`book_configs`、`book_notes` 和 `files` 均应按用户启用行级访问控制。

## 数据与存储依赖

最低数据库表：

- `books`：书籍元数据、云端文件状态和阅读页数。
- `book_configs`：当前 CFI 位置与阅读进度。
- `book_notes`：书签及未来的批注记录。
- `files`：对象存储文件键、大小和归属。

对象存储需要支持 30 分钟有效期的预签名上传与下载 URL。当前代码可使用 S3 或 Cloudflare R2。

## 详细文档

- [认证与运行时配置](./auth-and-runtime.md)
- [同步 API](./sync.md)
- [对象存储 API](./storage.md)

## 实现验收

后端适配完成后至少应验证：

1. Tauri 客户端能通过自定义后端地址注册并登录。
2. 两台设备能同步书库和阅读位置。
3. 一台设备新增、改名或删除书签后，另一台设备重新打开同一本书能得到相同结果。
4. 支持格式的书籍文件和 `cover.png` 能上传、下载和删除。
5. 用户无法读取、覆盖或删除其他用户的记录与对象。
