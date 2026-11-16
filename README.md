# Permission modes · 权限模式

Two composer controls that move **one permission dimension each** — file
permission (sandbox) and approval mode — so one never changes the other.

## The two controls

| Control | Where | Options | Knob |
|---|---|---|---|
| 文件权限 / File permission | `conversation.input.permission` (the shipped seat, taken over by this bundle) | 仅可查看 / 工作区内修改 / 完全权限 | sandbox |
| 审批 / Approval | `conversation.input.left`, right after the permission and plan controls | 手动批准 / 无需确认 | approval behaviour |

Both render one card panel: icon, title, one explanatory line and a check mark.
Keyboard: <kbd>Enter</kbd>/<kbd>Space</kbd> opens, <kbd>↑</kbd>/<kbd>↓</kbd> move,
<kbd>Esc</kbd> closes and returns focus. Picks are disabled while the Session is
running.

- **手动批准** (`ask`): an action that needs authorization asks you; the Web UI
  shows its approval card.
- **无需确认** (`*-auto`): the action is allowed without asking. This is *agree*,
  not *reject* — see below.

## Preset table

Six presets, one per sandbox × approval-mode pair:

| Sandbox | 手动批准 | 无需确认 |
|---|---|---|
| `read-only` | `read-only` | `read-only-auto` |
| `workspace-write` | `workspace-write` | `workspace-write-auto` |
| `danger-full-access` | `danger-full-access` | `danger-full-access-auto` |

A pick resolves the target preset from the *other* dimension's current value, so
switching 工作区内修改 → 完全权限 keeps the approval mode and vice versa. The
three `ask` ids keep the stock names, so existing stored defaults and recorded
selections still resolve.

## How 无需确认 agrees without asking

The approval policy union is `ask | never`, and `never` rejects **before** any
answerer runs, so a "no prompt" mode cannot be expressed as a policy value.
Instead every `*-auto` preset carries `approval: ask`, and the Host half
prepends an `approval/request` answerer: while the Session's current preset is
one of the three `*-auto` ids it returns `allowed-once` (the request is recorded
in the approval audit as allowed), and for every other preset it calls `next()`
so the deployment's own answerers — the Web UI card — handle it.

Consequences:

- 无需确认 really does let the operation run; it never silently rejects.
- The model's runtime context still reports the `ask` policy, and no
  approval-policy switch notice is emitted, because switching modes moves no
  knob. The mode is visible in the Session's `permission/preset` record.
- Auto-approval is scoped to the Session whose preset is `*-auto`; other
  Sessions, subagents included, keep asking.

## Why the shipped chip is replaced

The shipped permission control lists whole presets; with six presets it would
show six combined entries instead of one file-permission choice. This bundle
registers its own sandbox picker at slot priority `-1` (the lowest priority
renders) and shows the same three file-permission labels. The approval picker is
purely additive in `conversation.input.left`.

## Configuration

The bundle patch writes the six presets onto
`@deepseek-ai/dsh-permission-presets` with `defaultPreset: workspace-write`. The
profile patch layer applies after every bundle layer, so a `permission` row in
`~/.dsh/profiles/<profile>/cordis.patch.yml` overrides it; restate the whole
table when you do.

Changing `cordis.patch.yml` or `index.js` reloads on the next loader
recomposition (restart DSH, or disable and re-enable the bundle in the plugin
manager). The browser half alone hot-reloads on its own.

## Requirements and limits

- Requires the shipped permission preset client package, the `commands` host
  plugin and a Web Client. Without the catalog a chip shows a retry row.
- The `/permission` slash picker and the General-settings default row show all
  six presets (`Workspace Write Auto`, …) and stay functional; only the composer
  is dimension-aware.
- Another plugin that shadows `conversation.input.permission` at `-1` conflicts
  with this one.
- A Session whose knob combination matches no preset (for example an old
  `workspace-write` + `never` state) shows 自定义 on both chips until one pick
  lands it on a complete preset.
- Disabling the bundle restores the shipped chip and the stock preset table on
  the next recomposition.

## Failure behaviour

- An entry-local error boundary reports the failure and rethrows, so the slot
  ledger abdicates the entry and the shipped control returns instead of leaving
  the composer without a permission control.
- The Host half exposes a loopback-only `POST /permission-modes/log` route and
  appends the crash (message and stack, at most one line per distinct report per
  ten seconds) to `~/.dsh/permission-modes.log`. Nothing is written while both
  pickers render normally; delete the file any time.

## 安装 / Installation

这是一个 DeepSeek Harness（DSH）Web 插件 bundle，两种装法都行。

### 方式一：下载 Release 安装包（推荐）

1. 打开 [Releases](https://github.com/peter9130/dsh-permission-modes/releases/latest)，下载 `dsh-permission-modes-1.0.0.tgz`。
2. 在 DSH 里把 tgz 的绝对路径交给插件管理器安装：

   ```text
   用 plugin_manager 的 install_bundle，安装 /绝对路径/dsh-permission-modes-1.0.0.tgz
   ```

   或者把 tgz 放进任意目录，在 DSH 里说「安装 /path/to/dsh-permission-modes-1.0.0.tgz」，由 Agent 调用 `plugin_manager` 完成。

3. 按提示重启 DSH（或到「设置 → 插件」里对 `dsh-permission-modes` 禁用再启用）。
   浏览器端（`client.js`）由 client-hmr 热加载，约 10 秒生效；宿主端（`index.js` /
   `cordis.patch.yml`）需要重启或重新启用。

### 方式二：从源码目录安装

```bash
git clone https://github.com/peter9130/dsh-permission-modes.git
```

然后在 DSH 里用 `plugin_manager install_bundle` 指向克隆下来的目录（或把目录放进
`~/.dsh/profiles/<profile>/vendor/` 后安装），开发时也可以直接 `link:` 到该目录。

### 方式三：从 GitHub 源码安装

```text
用 plugin_manager 安装 github:peter9130/dsh-permission-modes
```

GitHub 源码安装走 pnpm 的 git 拉取，国内网络可能很慢；优先用方式一的 tarball。

## 卸载 / Uninstall

在「设置 → 插件」里禁用并删除该 bundle，或从 profile 的 `package.json`
（`dependencies` 与 `dsh.profile.bundles`）里去掉 `dsh-permission-modes` 后重新安装依赖。
