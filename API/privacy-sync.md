# 隐私模式同步 API

隐私模式使用独立的单记录端点同步。客户端在上传前使用隐私 PIN 派生 AES-GCM 密钥，服务端只保存不透明密文，不保存 PIN、PIN 校验值或隐藏书籍哈希的明文。

安全强度取决于 PIN 的长度和随机性。4 位数字 PIN 虽然可用，但面对取得云端密文后的离线穷举明显弱于较长 PIN，建议用户使用 6 位以上且不易猜测的数字。

所有请求都需要：

```http
Authorization: Bearer <supabase_access_token>
```

## 数据模型

```ts
interface PrivacyCloudRecord {
  envelope: EncryptedPrivacyEnvelope | null;
  updatedAt: number;
}

interface EncryptedPrivacyEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: {
    algorithm: 'PBKDF2-SHA-256';
    iterations: 600000;
    salt: string; // Base64，解码后 16 字节
  };
  iv: string; // Base64，解码后 12 字节
  ciphertext: string; // Base64，包含 GCM authentication tag
}
```

`envelope: null` 表示隐私模式已关闭，是需要传播到其他设备的删除标记。锁定/解锁这种瞬时 UI 状态不参与同步。

## `GET /api/privacy-sync`

返回当前用户的权威隐私配置。未配置过时 `record` 为 `null`。

```json
{
  "record": {
    "envelope": {
      "version": 1,
      "algorithm": "AES-GCM",
      "kdf": {
        "algorithm": "PBKDF2-SHA-256",
        "iterations": 600000,
        "salt": "base64"
      },
      "iv": "base64",
      "ciphertext": "base64"
    },
    "updatedAt": 1786521600000
  }
}
```

## `PUT /api/privacy-sync`

提交客户端本地记录：

```json
{
  "envelope": null,
  "updatedAt": 1786521600000
}
```

服务端必须使用数据库内的原子最后写入者胜出操作，比较 `updated_at` 后保留时间较新的记录，并在响应中返回最终权威记录。不能先查询再无条件写入，否则两个设备并发时可能由旧数据覆盖新数据。

限制：

- 加密信封序列化后不得超过 1 MiB。
- `updatedAt` 必须为正整数毫秒时间戳，且不能明显超出服务端当前时间。
- `user_id` 只能从 Bearer token 获得，不能接受客户端传入的用户 ID。
- 数据库表 `privacy_settings` 必须启用行级访问控制，每个用户只能读写自己的单行记录。

## 客户端行为

1. 登录后拉取远端记录，并与本地 `updatedAt` 比较。
2. 本地较新时推送；远端较新时采用远端记录。
3. 远端密文无法用当前内存密钥解开时，隐藏整个书库并要求输入隐私 PIN。
4. PIN 验证和解密均成功后，才显示书籍并应用隐藏列表。
5. PIN 和 AES 密钥不得上传；应用锁定或进入后台时从内存清除 AES 密钥。

原始书籍文件不会因隐私同步而加密或重命名。云文件、书籍元数据、阅读进度等现有同步数据仍由各自端点管理；隐私模式只控制客户端是否展示和加载相关数据。

## 错误响应

| 状态码 | 场景 |
| --- | --- |
| `400` | 密文格式、大小或更新时间无效 |
| `403` | 未认证或令牌无效 |
| `405` | 请求方法不是 GET 或 PUT |
| `500` | 数据库读取或原子合并失败 |
