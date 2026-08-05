# 认证与运行时配置

## `GET /runtime-config.js?format=json`

桌面端的自定义后端表单使用此请求探测服务。该接口不需要认证，必须禁用缓存或允许客户端使用 `cache: no-store`。

成功响应：

```json
{
  "supabaseUrl": "https://supabase.example.com",
  "supabaseAnonKey": "public-anon-key",
  "apiBaseUrl": "https://reader.example.com",
  "objectStorageType": "s3",
  "storageFixedQuota": 1073741824
}
```

字段说明：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `supabaseUrl` | 是 | Supabase API 根地址，只允许 HTTP 或 HTTPS |
| `supabaseAnonKey` | 是 | 可公开给客户端的 anon key，不能返回 service role key |
| `apiBaseUrl` | 否 | 业务 API 所在根地址，省略时使用当前后端根地址 |
| `objectStorageType` | 否 | `s3` 或 `r2`，用于部署配置 |
| `storageFixedQuota` | 否 | 每用户固定存储配额，单位为字节 |

Web 页面加载时也会请求不带查询参数的 `/runtime-config.js`。该形式可以返回设置全局变量的 JavaScript：

```js
window.__READEST_RUNTIME_CONFIG = {
  supabaseUrl: 'https://supabase.example.com',
  supabaseAnonKey: 'public-anon-key',
  apiBaseUrl: 'https://reader.example.com',
};
```

## Supabase Auth 能力

认证不经过 `apps/readest-app/src/pages/api`，而是由前端直接使用 Supabase Auth SDK。后端应启用以下能力：

- 邮箱和密码注册。
- 邮箱和密码登录。
- 注册确认邮件。
- 忘记密码邮件和密码更新。
- `getSession`、`setSession` 和 `refreshSession`。
- `getUser(access_token)`，业务 API 用它验证 Bearer token。
- `signOut`。
- 认证状态变化订阅。

当前 UI 不启用第三方登录，也不启用 magic link。

## 回调地址

Web 客户端认证回调：

```text
https://<web-origin>/auth/callback
```

Tauri 客户端认证回调：

```text
readest://auth-callback
```

Supabase Auth 的允许重定向地址中需要配置相应值。密码恢复链接最终进入 `/auth/recovery`，并通过 Supabase SDK 更新用户密码。

## 令牌使用

业务 API 收到 Bearer token 后调用 Supabase `getUser(token)` 验证身份。以下内容必须由后端决定：

- `user_id` 始终取已验证用户 ID。
- 文件对象键必须以 `<user_id>/` 开头。
- 存储配额从已验证令牌的声明和服务端固定配额计算。

不要接受客户端自行声明的用户 ID、存储用量或配额。
