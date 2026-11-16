/**
 * Permission modes — browser half.
 *
 * Two independent controls over the host permission catalog, which bundles one
 * sandbox mode with one approval policy per preset. This bundle's patch installs
 * the six combinations, so each control can change one dimension and keep the
 * other:
 *
 *  - `conversation.input.permission` (priority -1, replacing the shipped chip
 *    whose whole-preset list cannot express two knobs): 文件权限 — 仅可查看 /
 *    工作区内修改 / 完全权限.
 *  - `conversation.input.left`: 审批 — 手动批准 / 无需确认.
 *
 * A pick resolves the target preset from the current pair, so switching the
 * sandbox never touches the approval policy and the reverse. Both controls read
 * the same `permissions` projection and write through
 * `session.command('/permission <preset>')`.
 *
 * The picker writes its own controls and styles (prefixed `apm-`) instead of
 * importing Harness Client packages, and reads only `--dsw-alias-*` theme tokens
 * so light/dark theming follows the host.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-permission-modes',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom'), h = React.createElement

    const NS = 'permission-modes'
    const MENU_WIDTH = 292

    /* ------------------------------------------------------------------ *
     * Preset table (mirrors cordis.patch.yml)
     * ------------------------------------------------------------------ */

    const SANDBOX_IDS = ['read-only', 'workspace-write', 'danger-full-access']
    const APPROVAL_IDS = ['ask', 'auto']

    /** Preset id for one sandbox + approval pair. */
    const PRESET_OF = {
      'read-only|ask': 'read-only',
      'workspace-write|ask': 'workspace-write',
      'danger-full-access|ask': 'danger-full-access',
      'read-only|auto': 'read-only-auto',
      'workspace-write|auto': 'workspace-write-auto',
      'danger-full-access|auto': 'danger-full-access-auto',
    }

    /** Reverse map: preset id -> the two knobs it carries. */
    const KNOBS_OF = {
      'read-only': { sandbox: 'read-only', approval: 'ask' },
      'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
      'danger-full-access': { sandbox: 'danger-full-access', approval: 'ask' },
      'read-only-auto': { sandbox: 'read-only', approval: 'auto' },
      'workspace-write-auto': { sandbox: 'workspace-write', approval: 'auto' },
      'danger-full-access-auto': { sandbox: 'danger-full-access', approval: 'auto' },
    }

    /* ------------------------------------------------------------------ *
     * Dictionaries
     * ------------------------------------------------------------------ */

    const zh = {
      'trigger.sandbox.aria': '文件权限：{name}',
      'trigger.approval.aria': '审批模式：{name}',
      'trigger.approval.label': '审批 · {name}',
      'menu.sandbox.aria': '选择文件权限',
      'menu.approval.aria': '选择审批模式',
      'sandbox.readOnly.name': '仅可查看',
      'sandbox.readOnly.description': '只能读取，写入会被拒绝',
      'sandbox.workspaceWrite.name': '工作区内修改',
      'sandbox.workspaceWrite.description': '工作区内自动修改，越界操作需要授权',
      'sandbox.fullAccess.name': '完全权限',
      'sandbox.fullAccess.description': '工作区外的文件与命令也可直接执行',
      'approval.ask.name': '手动批准',
      'approval.ask.description': '需要授权的操作会先询问你',
      'approval.auto.name': '无需确认',
      'approval.auto.description': '需要授权时直接同意，不再询问',
      'custom.name': '自定义',
      'custom.description': '当前组合不在预设内，选择后会切到完整预设',
      'confirm.full.title': '启用完全权限？',
      'confirm.full.body': '选择后工作区外的文件修改与命令执行也会直接进行。',
      'confirm.auto.title': '开启自动同意？',
      'confirm.auto.body': '之后所有需要授权的操作都会直接放行，不再询问你。',
      'confirm.cancel': '取消',
      'confirm.enable': '启用',
      'error.load': '无法读取权限模式：{message}',
      'error.retry': '重试',
      'error.switch': '切换失败：{message}',
      'error.stale': '预设表还是旧版本：请重启 DSH，或在插件管理里禁用再启用本插件。',
      'empty': '宿主没有提供可选择的权限模式。',
      'loading': '正在读取权限模式…',
    }

    const en = {
      'trigger.sandbox.aria': 'File permission: {name}',
      'trigger.approval.aria': 'Approval mode: {name}',
      'trigger.approval.label': 'Approval · {name}',
      'menu.sandbox.aria': 'Choose a file permission',
      'menu.approval.aria': 'Choose an approval mode',
      'sandbox.readOnly.name': 'Read only',
      'sandbox.readOnly.description': 'Reads work; writes are refused',
      'sandbox.workspaceWrite.name': 'Workspace write',
      'sandbox.workspaceWrite.description': 'Writes inside the workspace run; wider access needs approval',
      'sandbox.fullAccess.name': 'Full access',
      'sandbox.fullAccess.description': 'Files and commands outside the workspace run directly',
      'approval.ask.name': 'Ask me',
      'approval.ask.description': 'Actions that need authorization ask you first',
      'approval.auto.name': 'No prompts',
      'approval.auto.description': 'Auto-approve anything that needs authorization, without asking',
      'custom.name': 'Custom',
      'custom.description': 'This combination is not a preset; a pick switches to a complete preset',
      'confirm.full.title': 'Enable full access?',
      'confirm.full.body': 'File changes and commands outside the workspace will run directly.',
      'confirm.auto.title': 'Auto-approve everything?',
      'confirm.auto.body': 'Every action that needs authorization will be allowed without asking you again.',
      'confirm.cancel': 'Cancel',
      'confirm.enable': 'Enable',
      'error.load': 'Could not read permission modes: {message}',
      'error.retry': 'Retry',
      'error.switch': 'Switch failed: {message}',
      'error.stale': 'The preset table is still the old one: restart DSH, or disable and re-enable this plugin.',
      'empty': 'This host provides no selectable permission mode.',
      'loading': 'Reading permission modes…',
    }

    function fallbackTranslate(key, vars) {
      let text = zh[key] !== undefined ? zh[key] : key
      if (vars !== null && typeof vars === 'object') {
        text = text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])))
      }
      return text
    }

    function messageOf(error) {
      if (error === null || error === undefined) return 'unknown error'
      if (typeof error === 'string') return error
      if (typeof error.message === 'string' && error.message.length > 0) return error.message
      return String(error)
    }

    /* ------------------------------------------------------------------ *
     * Glyphs
     * ------------------------------------------------------------------ */

    const svgBase = {
      viewBox: '0 0 20 20',
      width: 18,
      height: 18,
      'aria-hidden': true,
      focusable: 'false',
    }

    function EyeIcon() {
      return h('svg', svgBase,
        h('path', {
          d: 'M2.6 10c1.9-3.2 4.4-4.8 7.4-4.8s5.5 1.6 7.4 4.8c-1.9 3.2-4.4 4.8-7.4 4.8S4.5 13.2 2.6 10z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinejoin: 'round',
        }),
        h('circle', { cx: 10, cy: 10, r: 2.3, fill: 'none', stroke: 'currentColor', strokeWidth: '1.4' }))
    }

    function CircleCheckIcon() {
      return h('svg', svgBase,
        h('circle', {
          cx: 10,
          cy: 10,
          r: 7.2,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.4',
        }),
        h('path', {
          d: 'm6.7 10.2 2.2 2.2 4.4-4.6',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    function ShieldAlertIcon() {
      return h('svg', svgBase,
        h('path', {
          d: 'M10 2.7 16 5v4.5c0 3.6-2.4 6.5-6 7.8-3.6-1.3-6-4.2-6-7.8V5z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M10 6.8v3.4',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 10, cy: 12.9, r: 0.95, fill: 'currentColor' }))
    }

    function HandIcon() {
      return h('svg', svgBase,
        h('path', {
          d: 'M8.1 9.6V4.7a1.25 1.25 0 0 1 2.5 0v4.4m0-4.4V3.5a1.25 1.25 0 0 1 2.5 0v5.6m0-4.6a1.2 1.2 0 0 1 2.4 0v5.9m0-3.7a1.15 1.15 0 0 1 2.3 0v5.1c0 3-2.1 5.7-5.5 5.7-2.5 0-4.2-1-5.7-3l-1.2-1.7a1.35 1.35 0 0 1 2.1-1.6l1.6 1.9',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    function BoltIcon() {
      return h('svg', svgBase,
        h('path', {
          d: 'M11.2 2.6 4.9 11h4.1l-1.2 6.4 6.3-8.6h-4.1z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    function CheckIcon() {
      return h('svg', { viewBox: '0 0 20 20', width: 18, height: 18, 'aria-hidden': true, focusable: 'false' },
        h('path', {
          d: 'm4.6 10.6 3.5 3.5 7.3-8',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.9',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    function ChevronDownIcon() {
      return h('svg', { viewBox: '0 0 20 20', width: 14, height: 14, 'aria-hidden': true, focusable: 'false' },
        h('path', {
          d: 'm5.5 8 4.5 4.5L14.5 8',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.6',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    function Spinner() {
      return h('svg', { viewBox: '0 0 20 20', width: 16, height: 16, className: 'apm-spin', 'aria-hidden': true, focusable: 'false' },
        h('circle', { cx: 10, cy: 10, r: 6.6, fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', opacity: '0.25' }),
        h('path', {
          d: 'M10 3.4A6.6 6.6 0 0 1 16.6 10',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.8',
          strokeLinecap: 'round',
        }))
    }

    const SANDBOX_META = {
      'read-only': { nameKey: 'sandbox.readOnly.name', descriptionKey: 'sandbox.readOnly.description', icon: EyeIcon },
      'workspace-write': { nameKey: 'sandbox.workspaceWrite.name', descriptionKey: 'sandbox.workspaceWrite.description', icon: CircleCheckIcon },
      'danger-full-access': { nameKey: 'sandbox.fullAccess.name', descriptionKey: 'sandbox.fullAccess.description', icon: ShieldAlertIcon },
    }

    const APPROVAL_META = {
      ask: { nameKey: 'approval.ask.name', descriptionKey: 'approval.ask.description', icon: HandIcon },
      auto: { nameKey: 'approval.auto.name', descriptionKey: 'approval.auto.description', icon: BoltIcon },
    }

    function metaOf(dimension, value) {
      return dimension === 'approval' ? APPROVAL_META[value] : SANDBOX_META[value]
    }

    /** Confirmation copy for a risky pick, or null when it needs none. */
    function confirmOf(dimension, value, t) {
      if (dimension === 'sandbox' && value === 'danger-full-access') {
        return { title: t('confirm.full.title'), body: t('confirm.full.body') }
      }
      if (dimension === 'approval' && value === 'auto') {
        return { title: t('confirm.auto.title'), body: t('confirm.auto.body') }
      }
      return null
    }

    /* ------------------------------------------------------------------ *
     * Process-level catalog: one reader shared by every mounted seat.
     * ------------------------------------------------------------------ */

    let catalogState = { status: 'idle', value: null, error: null }
    const catalogListeners = new Set()
    let catalogPending = null

    function subscribeCatalog(listener) {
      catalogListeners.add(listener)
      return () => { catalogListeners.delete(listener) }
    }

    function readCatalogState() {
      return catalogState
    }

    function publishCatalog(next) {
      catalogState = next
      for (const listener of Array.from(catalogListeners)) {
        try {
          listener()
        } catch (error) {
          // A subscriber that throws must not stop the other seats.
        }
      }
    }

    /**
     * Read the complete permission catalog. Concurrent calls share one read;
     * failures stay in the store so a panel can offer a retry.
     */
    function loadCatalog(remote) {
      if (catalogPending !== null) return catalogPending
      const api = remote === undefined || remote === null ? undefined : remote.permissionPresets
      if (api === undefined || api === null || typeof api.catalog !== 'function') {
        publishCatalog({ status: 'error', value: null, error: 'this host exposes no permission catalog' })
        return Promise.resolve()
      }
      publishCatalog({ status: 'loading', value: catalogState.value, error: null })
      let operation
      operation = api.catalog()
        .then((result) => {
          if (result === null || result === undefined || result.ok !== true) {
            const detail = result !== null && result !== undefined && result.error !== undefined
              ? `${result.error.code}: ${result.error.message}`
              : 'catalog read failed'
            throw new Error(detail)
          }
          publishCatalog({ status: 'ready', value: result.value, error: null })
        })
        .catch((error) => {
          publishCatalog({ status: 'error', value: null, error: messageOf(error) })
        })
        .finally(() => {
          if (catalogPending === operation) catalogPending = null
        })
      catalogPending = operation
      return operation
    }

    /** Switch one session to a preset through the host command, like the stock chip. */
    function switchPreset(sessions, sessionId, value) {
      const binding = sessions !== undefined && sessions !== null && typeof sessions.binding === 'function'
        ? sessions.binding(sessionId)
        : undefined
      const live = binding === undefined ? undefined : binding.session
      if (live === undefined || live === null || typeof live.command !== 'function') {
        return Promise.reject(new Error('this session is not materialized yet'))
      }
      return live.command('/permission ' + value).then((result) => {
        if (result === null || result === undefined || result.ok !== true) {
          const detail = result !== null && result !== undefined && result.error !== undefined
            ? `${result.error.code}: ${result.error.message}`
            : 'command failed'
          throw new Error(detail)
        }
        if (result.value === null || result.value === undefined || result.value.matched !== true) {
          throw new Error('the host offers no /permission command')
        }
        return true
      })
    }

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    const CSS = `
.apm-root {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}
.apm-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 220px;
  height: 28px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  cursor: pointer;
}
@media (hover: hover) {
  .apm-trigger:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  }
}
.apm-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
}
.apm-trigger:disabled {
  color: var(--dsw-alias-label-dimmed, var(--dsw-alias-state-idle-primary));
  cursor: default;
}
.apm-triggerIcon {
  display: inline-flex;
  flex: 0 0 auto;
}
.apm-triggerIcon svg {
  width: 14px;
  height: 14px;
}
.apm-triggerLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.apm-chevron {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-secondary));
  transition: transform 120ms ease;
}
.apm-chevronOpen {
  transform: rotate(180deg);
}
.apm-menu {
  position: fixed;
  z-index: 1200;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-lg, 14px);
  background: transparent;
  isolation: isolate;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  box-shadow: var(--dsw-elevation-prominent, 0 12px 32px rgba(0, 0, 0, 0.18));
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
}
.apm-menu button {
  font-family: inherit;
}
.apm-material {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--dsw-menu-surface-fill, var(--dsw-alias-bg-overlay));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  pointer-events: none;
}
.apm-backing {
  display: none;
}
html[data-platform="darwin"] .apm-backing {
  display: block;
  position: absolute;
  inset: 0;
  z-index: -2;
  border-radius: inherit;
  background: var(--dsw-alias-bg-base);
  pointer-events: none;
}
.apm-material, .apm-backing {
  animation: apm-in 120ms ease-out;
}
@keyframes apm-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .apm-material, .apm-backing { animation: none; }
}
.apm-content {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.apm-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
@media (hover: hover) {
  .apm-row:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  }
}
.apm-row:focus-visible {
  outline: none;
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
}
.apm-row:disabled {
  cursor: default;
  opacity: 0.7;
}
.apm-rowIcon {
  display: inline-flex;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  color: var(--dsw-alias-label-secondary);
}
.apm-rowIcon svg {
  width: 18px;
  height: 18px;
}
.apm-rowSelected .apm-rowIcon {
  color: var(--dsw-alias-label-primary);
}
.apm-rowCopy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.apm-rowTitle {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
}
.apm-rowDesc {
  font-size: 11.5px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
.apm-rowCheck {
  display: inline-flex;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  color: var(--dsw-alias-brand-primary);
}
.apm-rowCheck svg {
  width: 18px;
  height: 18px;
}
.apm-spin {
  animation: apm-spin 0.9s linear infinite;
}
@keyframes apm-spin {
  to { transform: rotate(360deg); }
}
.apm-error {
  margin: 4px 8px 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-state-error-primary);
}
.apm-notice {
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.apm-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
}
.apm-confirmTitle {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
}
.apm-confirmBody {
  font-size: 12px;
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
}
.apm-confirmActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}
.apm-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.apm-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
}
.apm-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.apm-btnGhost {
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
@media (hover: hover) {
  .apm-btnGhost:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  }
}
.apm-btnWarn {
  border-color: var(--dsw-alias-state-warn-primary);
  color: var(--dsw-alias-state-warn-primary);
}
@media (hover: hover) {
  .apm-btnWarn:hover:not(:disabled) {
    background: var(--dsw-alias-bg-layer-2);
  }
}
`

    /* ------------------------------------------------------------------ *
     * Diagnostics: a crashed slot entry abdicates silently in the page, so the
     * bundle's Host half owns a file sink for the exact failure.
     * ------------------------------------------------------------------ */

    function reportToHost(kind, details) {
      try {
        if (typeof fetch !== 'function') return
        const payload = { kind, time: Date.now() }
        if (details instanceof Error) {
          payload.message = String(details.message)
          payload.stack = String(details.stack)
        } else if (details !== null && typeof details === 'object') {
          Object.assign(payload, details)
        } else {
          payload.message = String(details)
        }
        fetch('/permission-modes/log', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin',
        }).catch(() => {})
      } catch (ignored) {
        // Reporting must never fail the slot again.
      }
    }

    class ModeEntryBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false, error: null }
      }

      static getDerivedStateFromError(error) {
        return { failed: true, error }
      }

      componentDidCatch(error) {
        reportToHost('render', error)
      }

      render() {
        // Report once, then rethrow: the slot ledger abdicates a crashing entry,
        // which hands the seat back to the shipped control.
        if (this.state.failed) throw this.state.error
        return this.props.children
      }
    }

    function PermissionModeSeat(props) {
      return h(ModeEntryBoundary, null, h(PermissionModeSelect, props))
    }

    /* ------------------------------------------------------------------ *
     * Component
     * ------------------------------------------------------------------ */

    function PermissionModeSelect(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate
      const dimension = props.dimension === 'approval' ? 'approval' : 'sandbox'
      const load = typeof props.loadCatalog === 'function' ? props.loadCatalog : () => Promise.resolve()
      const select = typeof props.selectPreset === 'function'
        ? props.selectPreset
        : () => Promise.reject(new Error('permission switching is unavailable'))
      // The left list supplies no owner `locked`; the session's running state
      // disables both seats, matching the shipped chip.
      const running = props.useSessionStatus((snapshot) => {
        const status = snapshot.get(props.sessionId)
        return status !== undefined && status.running === true
      })
      const locked = props.locked === true || running === true
      const state = React.useSyncExternalStore(subscribeCatalog, readCatalogState)
      const selection = props.useProjection('permissions')

      const [open, setOpen] = React.useState(false)
      const [confirming, setConfirming] = React.useState(null)
      const [pending, setPending] = React.useState(null)
      const [failure, setFailure] = React.useState(null)
      const [anchor, setAnchor] = React.useState(null)

      const rootRef = React.useRef(null)
      const triggerRef = React.useRef(null)
      const menuRef = React.useRef(null)
      const loadRef = React.useRef(load)
      loadRef.current = load

      const close = React.useCallback((refocus) => {
        setOpen(false)
        setConfirming(null)
        if (refocus) {
          const node = triggerRef.current
          if (node !== null && typeof node.focus === 'function') node.focus({ preventScroll: true })
        }
      }, [])

      // One catalog read per mount; the store dedupes concurrent readers and
      // every later open retries a failed read.
      React.useEffect(() => {
        loadRef.current()
      }, [])

      React.useEffect(() => {
        if (locked) {
          setOpen(false)
          setConfirming(null)
        }
      }, [locked])

      React.useEffect(() => {
        if (!open) return undefined
        const place = () => {
          const node = triggerRef.current
          if (node === null) return
          const rect = node.getBoundingClientRect()
          const width = Math.min(MENU_WIDTH, Math.max(220, window.innerWidth - 16))
          const room = Math.max(180, rect.top - 12)
          setAnchor({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px',
            bottom: Math.max(8, window.innerHeight - rect.top + 6) + 'px',
            width: width + 'px',
            maxHeight: Math.min(room, 420) + 'px',
          })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (target instanceof Node) {
            if (menuRef.current !== null && menuRef.current.contains(target)) return
            if (rootRef.current !== null && rootRef.current.contains(target)) return
          }
          setOpen(false)
          setConfirming(null)
        }
        document.addEventListener('mousedown', onPointerDown, true)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
        }
      }, [open])

      React.useEffect(() => {
        if (!open) return undefined
        const node = menuRef.current
        if (node === null) return undefined
        const selected = node.querySelector('[data-apm-selected="true"]')
        const first = node.querySelector('[data-apm-row="true"]')
        const action = node.querySelector('[data-apm-action="true"]')
        const target = selected !== null ? selected : first !== null ? first : action
        if (target !== null && typeof target.focus === 'function') target.focus({ preventScroll: true })
        return undefined
      }, [open, confirming])

      React.useEffect(() => {
        if (!open || pending === null) return
        if (selection !== undefined && selection !== null && selection.currentValue === pending) {
          setPending(null)
          setConfirming(null)
          setOpen(false)
        }
      }, [open, pending, selection])

      if (selection === undefined || selection === null) return null

      const currentValue = typeof selection.currentValue === 'string' ? selection.currentValue : ''
      const knobs = KNOBS_OF[currentValue]
      const currentSandbox = knobs === undefined ? null : knobs.sandbox
      const currentApproval = knobs === undefined ? null : knobs.approval
      const facet = dimension === 'approval' ? currentApproval : currentSandbox
      const ids = dimension === 'approval' ? APPROVAL_IDS : SANDBOX_IDS
      const facetMeta = facet === null ? undefined : metaOf(dimension, facet)
      const currentName = facetMeta === undefined ? t('custom.name') : t(facetMeta.nameKey)
      const currentDescription = facetMeta === undefined ? t('custom.description') : t(facetMeta.descriptionKey)
      const TriggerIcon = facetMeta === undefined ? ShieldAlertIcon : facetMeta.icon
      const options = state.value !== null && Array.isArray(state.value.options) ? state.value.options : []
      const ready = state.status === 'ready' && options.length > 0
      const busy = pending !== null

      const submit = (preset) => {
        if (busy || locked) return
        setPending(preset)
        setFailure(null)
        Promise.resolve(select(preset))
          .then(() => {
            setPending(null)
            setConfirming(null)
            setOpen(false)
          })
          .catch((error) => {
            setPending(null)
            setFailure(t('error.switch', { message: messageOf(error) }))
          })
      }

      const presetFor = (value) => {
        const sandbox = dimension === 'sandbox' ? value : currentSandbox === null ? 'workspace-write' : currentSandbox
        const approval = dimension === 'approval' ? value : currentApproval === null ? 'ask' : currentApproval
        return PRESET_OF[`${sandbox}|${approval}`]
      }

      const available = (preset) => options.length === 0 || options.some((option) => option.value === preset)

      const choose = (value) => {
        if (busy || locked) return
        setFailure(null)
        if (value === facet) {
          close(true)
          return
        }
        const preset = presetFor(value)
        if (!available(preset)) {
          setFailure(t('error.stale'))
          return
        }
        const guard = confirmOf(dimension, value, t)
        if (guard !== null) {
          setConfirming({ value, preset, title: guard.title, body: guard.body })
          return
        }
        submit(preset)
      }

      const openPanel = () => {
        if (locked) return
        const node = triggerRef.current
        if (node !== null) {
          const rect = node.getBoundingClientRect()
          const width = Math.min(MENU_WIDTH, Math.max(220, window.innerWidth - 16))
          const room = Math.max(180, rect.top - 12)
          setAnchor({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px',
            bottom: Math.max(8, window.innerHeight - rect.top + 6) + 'px',
            width: width + 'px',
            maxHeight: Math.min(room, 420) + 'px',
          })
        }
        setConfirming(null)
        setFailure(null)
        setOpen(true)
        if (state.status !== 'ready') load()
      }

      const onMenuKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (confirming !== null) setConfirming(null)
          else close(true)
          return
        }
        if (event.key === 'Tab') {
          close(false)
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const node = menuRef.current
        if (node === null) return
        const rows = Array.from(node.querySelectorAll('[data-apm-row="true"]'))
        if (rows.length === 0) return
        event.preventDefault()
        const index = rows.indexOf(document.activeElement)
        const next = event.key === 'ArrowDown'
          ? (index + 1) % rows.length
          : index <= 0 ? rows.length - 1 : index - 1
        rows[next].focus()
      }

      const rowNodes = ids.map((value) => {
        const meta = metaOf(dimension, value)
        const selected = value === facet
        const spinning = pending !== null && confirmOf(dimension, value, t) === null && presetFor(value) === pending
        return h('button', {
          key: value,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': selected,
          'data-apm-row': 'true',
          'data-apm-selected': selected ? 'true' : undefined,
          className: 'apm-row' + (selected ? ' apm-rowSelected' : ''),
          disabled: locked || busy,
          onClick: () => { choose(value) },
        },
          h('span', { className: 'apm-rowIcon', 'aria-hidden': true }, h(meta.icon)),
          h('span', { className: 'apm-rowCopy' },
            h('span', { className: 'apm-rowTitle' }, t(meta.nameKey)),
            h('span', { className: 'apm-rowDesc' }, t(meta.descriptionKey))),
          h('span', { className: 'apm-rowCheck', 'aria-hidden': true },
            spinning ? h(Spinner) : selected ? h(CheckIcon) : null))
      })

      let body
      if (confirming !== null) {
        body = h('div', { className: 'apm-confirm' },
          h('div', { className: 'apm-confirmTitle' }, confirming.title),
          h('div', { className: 'apm-confirmBody' }, confirming.body),
          failure === null ? null : h('div', { className: 'apm-error', role: 'alert' }, failure),
          h('div', { className: 'apm-confirmActions' },
            h('button', {
              type: 'button',
              'data-apm-action': 'true',
              className: 'apm-btn apm-btnGhost',
              onClick: () => { setConfirming(null) },
            }, t('confirm.cancel')),
            h('button', {
              type: 'button',
              className: 'apm-btn apm-btnWarn',
              disabled: busy,
              onClick: () => { submit(confirming.preset) },
            }, t('confirm.enable'))))
      } else if (ready) {
        body = h(React.Fragment, null,
          rowNodes,
          failure === null ? null : h('div', { className: 'apm-error', role: 'alert' }, failure))
      } else if (state.status === 'error') {
        body = h(React.Fragment, null,
          h('div', { className: 'apm-error', role: 'alert' }, t('error.load', { message: state.error })),
          h('div', { className: 'apm-confirmActions' },
            h('button', {
              type: 'button',
              className: 'apm-btn apm-btnGhost',
              onClick: () => { load() },
            }, t('error.retry'))))
      } else {
        body = h('div', { className: 'apm-notice' }, options.length === 0 && state.status === 'ready' ? t('empty') : t('loading'))
      }

      const menu = open && anchor !== null
        ? createPortal(h('div', {
          ref: menuRef,
          className: 'apm-menu',
          style: anchor,
          role: confirming === null ? 'menu' : 'dialog',
          'aria-label': confirming === null
            ? (dimension === 'approval' ? t('menu.approval.aria') : t('menu.sandbox.aria'))
            : confirming.title,
          'aria-busy': busy ? 'true' : undefined,
          onKeyDown: onMenuKeyDown,
        },
          h('div', { className: 'apm-backing', 'aria-hidden': true }),
          h('div', { className: 'apm-material', 'aria-hidden': true }),
          h('div', { className: 'apm-content' }, body)), document.body)
        : null

      const ariaName = t(dimension === 'approval' ? 'trigger.approval.aria' : 'trigger.sandbox.aria', { name: currentName })

      return h('div', { ref: rootRef, className: 'apm-root' },
        h('style', null, CSS),
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'apm-trigger',
          'aria-label': ariaName,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          title: currentDescription,
          disabled: locked,
          onClick: () => {
            if (open) close(false)
            else openPanel()
          },
          onKeyDown: (event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              if (!open) openPanel()
            }
          },
        },
          h('span', { className: 'apm-triggerIcon', 'aria-hidden': true }, h(TriggerIcon)),
          h('span', { className: 'apm-triggerLabel' },
            dimension === 'approval' ? t('trigger.approval.label', { name: currentName }) : currentName),
          h('span', { className: 'apm-chevron' + (open ? ' apm-chevronOpen' : ''), 'aria-hidden': true }, h(ChevronDownIcon))),
        menu)
    }

    /* ------------------------------------------------------------------ *
     * Client plugin
     * ------------------------------------------------------------------ */

    const inject = ['slots', 'sessions', 'locale', 'remote', 'remote.permissionPresets']

    /**
     * Register the dictionaries, follow catalog invalidations, and mount the two
     * one-dimension pickers.
     * @param {object} ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'permission-modes: dictionaries')

      const remote = ctx.get('remote')

      ctx.effect(() => {
        if (remote === undefined || remote === null || typeof remote.$on !== 'function') return undefined
        const off = remote.$on('permission-presets/catalog-changed', () => {
          loadCatalog(remote)
        })
        return typeof off === 'function' ? off : undefined
      }, 'permission-modes: catalog invalidation')

      ctx.inject(['slots', 'sessions'], (scope) => {
        const face = (dimension) => (sessionId) => {
          try {
            return {
              dimension,
              loadCatalog: () => loadCatalog(remote),
              selectPreset: (value) => switchPreset(scope.sessions, sessionId, value),
            }
          } catch (error) {
            reportToHost('inject', error)
            return {
              dimension,
              loadCatalog: () => Promise.resolve(),
              selectPreset: () => Promise.reject(new Error('permission modes are unavailable')),
            }
          }
        }

        // The shipped chip can only list whole presets, so the file-permission
        // seat is taken over by the sandbox-only picker at priority -1.
        scope.slots.inject('conversation.input.permission', () => scope.slots.register({
          name: 'conversation.input.permission',
          id: 'permission-modes-sandbox',
          priority: -1,
          locale: NS,
          inject: face('sandbox'),
        }, PermissionModeSeat))

        // Additive seat for the approval knob, beside the permission control.
        scope.slots.inject('conversation.input.left', () => scope.slots.register({
          name: 'conversation.input.left',
          id: 'permission-modes-approval',
          order: 10,
          locale: NS,
          inject: face('approval'),
        }, PermissionModeSeat))
      })
    }

    return { inject, apply }
  },
})
