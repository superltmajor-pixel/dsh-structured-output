# 自适应表达 · Adaptive Responses

让 DeepSeek Harness 根据问题选择合适的回答方式。简单问题直接答，复杂问题先给结论，再按需要展开依据、步骤和风险。第一次用到的术语会尽量用白话解释。用户指定的格式和详略优先。

## 安装

首发版本适用于已验证的 **DeepSeek Harness 0.2.2-rc.5**。

在 DeepSeek Harness 的插件管理中选择通过 npm 安装，输入 `dsh-structured-output`。也可以使用命令行：

```sh
dsh plugin --profile desktop add dsh-structured-output
```

桌面版使用 `desktop`，独立 Web 配置可将其替换为 `web`。如果已启用旧的本地版 `@local/dsh-structured-output`，请先停用它，再安装公开版。安装后可在插件管理中停用、重新启用或卸载「自适应表达」。

## 怎么用

平时照常提问即可。如果需要特定格式，可以把要求放在句首，例如「只返回 JSON。字段为 `total` 和 `average`」「用表格对比这两个方案」「详细解释这两者的区别」。插件会为这些明确的句首写法追加提醒。模型仍会读完整条消息，JSON 结果需要由调用方按需校验。

插件调整聊天回答的表达偏好。工具调用、代码、文件正文和程序读取的输出仍遵循各自的任务要求。插件只在内存里暂存当轮命中的格式类型，自身不保存消息正文、不发网络请求，也不追加模型调用。

## 开发

从 GitHub 克隆源码后运行 `npm test`。测试覆盖提示规则注册、格式触发、会话隔离和停用清理。仓库还提供 `tests/host-check.mjs`，可在 Electron 的 Node 模式下，用 `DSH_APP_ASAR` 指向已安装的 `app.asar` 来检查真实宿主的提示词服务。

[更新记录](CHANGELOG.md) · [MIT 许可证](LICENSE)
