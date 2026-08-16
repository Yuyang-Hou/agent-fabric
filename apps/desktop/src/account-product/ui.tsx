import { Button as BaseButton } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import { Tabs } from "@base-ui/react/tabs";
import { Tooltip } from "@base-ui/react/tooltip";
import { AlertCircle, Check, ChevronDown, Circle, LoaderCircle, type LucideIcon } from "lucide-react";
import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export function FabricButton({ tone = "secondary", loading = false, children, className = "", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly tone?: "primary" | "secondary" | "quiet" | "danger"; readonly loading?: boolean }) {
  return <BaseButton {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={`fabric-button fabric-button-${tone} ${className}`.trim()}>
    {loading && <LoaderCircle className="fabric-spinner" aria-hidden="true" />}
    {children}
  </BaseButton>;
}

export interface FabricSelectOption<Value extends string> {
  readonly value: Value;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export function FabricSelect<Value extends string>({ value, onValueChange, options, ariaLabel, placeholder, disabled = false, className = "", popupClassName = "", compact = false }: {
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
  readonly options: readonly FabricSelectOption<Value>[];
  readonly ariaLabel: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly popupClassName?: string;
  readonly compact?: boolean;
}) {
  return <Select.Root items={options} value={value} disabled={disabled} onValueChange={(next) => { if (next !== null) onValueChange(next); }}>
    <Select.Trigger className={`fabric-select ${compact ? "is-compact" : ""} ${className}`.trim()} aria-label={ariaLabel}>
      <Select.Value placeholder={placeholder} />
      <Select.Icon className="fabric-select-icon"><ChevronDown aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner className="fabric-popup-positioner" alignItemWithTrigger={false} sideOffset={6} collisionPadding={10}>
        <Select.Popup className={`fabric-select-popup ${popupClassName}`.trim()}>
          <Select.List className="fabric-select-list">
            {options.map((option) => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="fabric-select-item">
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className="fabric-select-indicator"><Check aria-hidden="true" /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}

export function FabricCheckbox({ checked, onCheckedChange, ariaLabel, children, disabled = false, className = "" }: {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly ariaLabel: string;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  return <label className={`fabric-checkbox-label ${className}`.trim()}>
    <Checkbox.Root checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={ariaLabel} className="fabric-checkbox">
      <Checkbox.Indicator className="fabric-checkbox-indicator"><Check aria-hidden="true" /></Checkbox.Indicator>
    </Checkbox.Root>
    {children && <span>{children}</span>}
  </label>;
}

export interface FabricMenuItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly tone?: "default" | "danger";
  readonly onSelect: () => void;
}

export function FabricMenu({ trigger, triggerClassName = "", triggerAriaLabel, header, items, align = "end", side = "bottom", popupClassName = "" }: {
  readonly trigger: ReactNode;
  readonly triggerClassName?: string;
  readonly triggerAriaLabel: string;
  readonly header?: ReactNode;
  readonly items: readonly FabricMenuItem[];
  readonly align?: "start" | "center" | "end";
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly popupClassName?: string;
}) {
  return <Menu.Root>
    <Menu.Trigger className={triggerClassName} aria-label={triggerAriaLabel}>{trigger}</Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner className="fabric-popup-positioner" align={align} side={side} sideOffset={6} collisionPadding={10}>
        <Menu.Popup className={`fabric-menu-popup ${popupClassName}`.trim()}>
          {header && <div className="fabric-menu-header">{header}</div>}
          {items.map((item) => <Menu.Item key={item.id} disabled={item.disabled} className={`fabric-menu-item ${item.tone === "danger" ? "is-danger" : ""}`} onClick={item.onSelect}>
            {item.icon}{item.label}
          </Menu.Item>)}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>;
}

export function FabricPopover({ trigger, children, triggerClassName = "", triggerAriaLabel, popupClassName = "", open, onOpenChange, align = "end", side = "bottom" }: {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly triggerClassName?: string;
  readonly triggerAriaLabel: string;
  readonly popupClassName?: string;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly align?: "start" | "center" | "end";
  readonly side?: "top" | "right" | "bottom" | "left";
}) {
  return <Popover.Root {...(open === undefined ? {} : { open })} {...(onOpenChange ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}>
    <Popover.Trigger className={triggerClassName} aria-label={triggerAriaLabel}>{trigger}</Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner className="fabric-popup-positioner" align={align} side={side} sideOffset={6} collisionPadding={10}>
        <Popover.Popup className={`fabric-popover-popup ${popupClassName}`.trim()}>{children}</Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}

export function FabricDialog({ open, onOpenChange, children, ariaLabelledBy, ariaDescribedBy, role = "dialog", popupClassName = "", backdropClassName = "" }: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
  readonly ariaLabelledBy: string;
  readonly ariaDescribedBy?: string;
  readonly role?: "dialog" | "alertdialog";
  readonly popupClassName?: string;
  readonly backdropClassName?: string;
}) {
  const finalFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
    <Dialog.Portal>
      <Dialog.Backdrop className={`fabric-dialog-backdrop ${backdropClassName}`.trim()} />
      <Dialog.Viewport className="fabric-dialog-viewport">
        <Dialog.Popup finalFocus={finalFocusRef} className={`fabric-dialog-popup ${popupClassName}`.trim()} role={role} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy}>{children}</Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function FabricTabs<Value extends string>({ value, onValueChange, items, children, ariaLabel }: {
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
  readonly items: readonly { readonly value: Value; readonly label: ReactNode }[];
  readonly children: (value: Value) => ReactNode;
  readonly ariaLabel: string;
}) {
  return <Tabs.Root className="fabric-tabs" value={value} onValueChange={(next) => { if (next !== null) onValueChange(next as Value); }}>
    <Tabs.List className="intent-tabs" aria-label={ariaLabel}>
      {items.map((item) => <Tabs.Tab key={item.value} value={item.value}>{item.label}</Tabs.Tab>)}
      <Tabs.Indicator className="fabric-tabs-indicator" />
    </Tabs.List>
    {items.map((item) => <Tabs.Panel key={item.value} value={item.value} className="detail-body">{children(item.value)}</Tabs.Panel>)}
  </Tabs.Root>;
}

export function FabricTooltip({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return <Tooltip.Root>
    <Tooltip.Trigger className="fabric-tooltip-trigger">{children}</Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Positioner className="fabric-popup-positioner" sideOffset={6}><Tooltip.Popup className="fabric-tooltip-popup">{label}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}

export function FabricField({ label, description, children, className = "" }: { readonly label: string; readonly description?: string; readonly children: ReactNode; readonly className?: string }) {
  return <Field.Root className={`fabric-field ${className}`.trim()}><Field.Label>{label}</Field.Label>{description && <Field.Description>{description}</Field.Description>}{children}</Field.Root>;
}

export function FabricStatus({ value }: { readonly value: string }) {
  const positive = value === "online" || value === "ready" || value === "completed" || value === "accepted";
  const negative = value === "offline" || value === "unavailable" || value === "failed" || value === "revoked";
  const Icon = positive ? Check : negative ? AlertCircle : Circle;
  return <span className={`fabric-status fabric-status-${value}`}><Icon aria-hidden="true" />{statusLabel(value)}</span>;
}

export function SurfaceState({ icon: Icon, title, description, action }: { readonly icon: LucideIcon; readonly title: string; readonly description: string; readonly action?: ReactNode }) {
  return <div className="surface-state"><span className="surface-state-icon"><Icon aria-hidden="true" /></span><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function LoadingRows({ count = 5 }: { readonly count?: number }) {
  return <div className="loading-rows" role="status" aria-label="正在加载"><span className="sr-only">正在加载</span>{Array.from({ length: count }, (_, index) => <div className="loading-row" key={index}><i /><span><b /><b /></span><em /></div>)}</div>;
}

export function SettingRow({ label, description, children, wide = false }: { readonly label: string; readonly description?: string; readonly children: ReactNode; readonly wide?: boolean }) {
  return <div className={`setting-row ${wide ? "setting-row-wide" : ""}`}><div><label>{label}</label>{description && <p>{description}</p>}</div><div className="setting-control">{children}</div></div>;
}

export function statusLabel(value: string): string {
  return ({
    online: "在线", unstable: "不稳定", offline: "离线", needs_runtime: "未绑定 Runtime", archived: "已归档",
    ready: "可用", checking: "检查中", auth_required: "需要认证", unavailable: "不可用",
    pending: "待接受", accepted: "已接受", revoked: "已撤销", expired: "已过期",
    completed: "已完成", failed: "失败", canceled: "已取消",
  } as Record<string, string>)[value] ?? value;
}
