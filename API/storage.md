# 对象存储 API

书籍正文和封面不经过 `/api/sync` 传输。业务 API 只登记文件并生成预签名 URL，客户端随后直接与 S3 或 R2 通信。

所有接口都需要 Bearer token。

## 文件键规则

客户端支持的相对路径固定为：

```text
Readest/Books/<32位十六进制bookHash>/<filename>
```

服务端保存的完整对象键为：

```text
<user_id>/Readest/Books/<bookHash>/<filename>
```

`filename` 允许 `cover.png`，或以下扩展名的书籍文件：

```text
epub mobi azw azw3 fb2 fbz cbz pdf txt md
```

服务端必须拒绝反斜杠、空字节、路径穿越、错误的哈希目录、额外路径段和不支持的扩展名。URL 解码前后都需要检查。

## `POST /api/storage/upload`

登记文件并生成有效期 1800 秒的预签名 PUT URL。

请求：

```json
{
  "fileName": "Readest/Books/0123456789abcdef0123456789abcdef/book.epub",
  "fileSize": 5242880,
  "bookHash": "0123456789abcdef0123456789abcdef"
}
```

`fileSize` 必须是大于 0 的安全整数。后端按文件的新大小重新计算用户用量；替换同名文件时需要减去旧大小。

成功响应：

```json
{
  "uploadUrl": "https://storage.example.com/presigned-put-url",
  "fileKey": "user-id/Readest/Books/0123456789abcdef0123456789abcdef/book.epub",
  "usage": 10485760,
  "quota": 1073741824
}
```

前端随后对 `uploadUrl` 执行 PUT 上传。Web 使用 `fetch`，Tauri 使用原生 HTTP 传输。

## `GET /api/storage/download`

为单个文件生成有效期 1800 秒的下载 URL。

```http
GET /api/storage/download?fileKey=user-id%2FReadest%2FBooks%2F0123456789abcdef0123456789abcdef%2Fbook.epub
Authorization: Bearer <token>
```

成功响应：

```json
{
  "downloadUrl": "https://storage.example.com/presigned-get-url"
}
```

文件记录不存在或已删除时返回 `404`。

## `POST /api/storage/download`

批量获取下载 URL，主要用于并行下载书籍封面。

请求：

```json
{
  "fileKeys": [
    "user-id/Readest/Books/0123456789abcdef0123456789abcdef/cover.png",
    "user-id/Readest/Books/fedcba9876543210fedcba9876543210/cover.png"
  ]
}
```

成功响应：

```json
{
  "downloadUrls": {
    "user-id/Readest/Books/0123456789abcdef0123456789abcdef/cover.png": "https://storage.example.com/first",
    "user-id/Readest/Books/fedcba9876543210fedcba9876543210/cover.png": "https://storage.example.com/second"
  }
}
```

请求数组不能为空，且每个键都必须属于当前用户。某个文件生成 URL 失败时，该键可能从 JSON 结果中省略，其他文件仍可成功。

## `DELETE /api/storage/delete`

删除对象以及对应的 `files` 数据库记录。

```http
DELETE /api/storage/delete?fileKey=user-id%2FReadest%2FBooks%2F0123456789abcdef0123456789abcdef%2Fbook.epub
Authorization: Bearer <token>
```

成功响应：

```json
{
  "message": "File deleted successfully"
}
```

前端将云端文件删除视为尽力操作，失败时会记录警告，但不会阻止本地删除。

## 状态码

| 状态码 | 场景 |
| --- | --- |
| `400` | 路径、文件大小、哈希或数组无效 |
| `403` | 未认证、越权或存储配额不足 |
| `404` | 文件记录不存在 |
| `405` | HTTP 方法不支持 |
| `500` | 数据库或对象存储操作失败 |
