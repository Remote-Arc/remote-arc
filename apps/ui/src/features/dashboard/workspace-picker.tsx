import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import "./workspace-picker.css";
import {ProductIcon as Icon} from '../../components/product-icon.js';

type Workspace = "connect" | "agent";
type Props = {
  arcAvailable?:boolean;
  workspace: Workspace;
  mobile?: boolean;
  tr: (english: string, chinese: string) => string;
  onNavigate: (tab: "overview" | "agent-chat") => void;
};

type Position = {
  top: number; left: number; width: number;
  ink: string; muted: string; surface: string; subtle: string; line: string; accent: string;
};

function ProductIcon({workspace}:{workspace:Workspace}){
  return workspace==="agent"?<img src="/remote-arc.svg" alt="" width={21} height={21}/>:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .5l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7-.5l-2 2a5 5 0 0 0 7 7l1-1"/></svg>;
}

export function WorkspacePicker({ workspace, mobile = false, tr, onNavigate, arcAvailable = false }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const tokens = getComputedStyle(trigger);
    const width = Math.min(320, Math.max(300, rect.width), window.innerWidth - 24);
    const left = Math.max(12, Math.min(mobile ? rect.right - width : rect.left, window.innerWidth - width - 12));
    const menuHeight = menuRef.current?.getBoundingClientRect().height || 160;
    const below = rect.bottom + 8;
    const top = below + menuHeight > window.innerHeight - 12 && rect.top > menuHeight + 20
      ? rect.top - menuHeight - 8 : below;
    setPosition({
      top, left, width,
      ink: tokens.getPropertyValue("--dash-text").trim() || "#182337",
      muted: tokens.getPropertyValue("--dash-muted").trim() || "#67738a",
      surface: tokens.getPropertyValue("--dash-surface").trim() || "#ffffff",
      subtle: tokens.getPropertyValue("--dash-subtle").trim() || "#f6f7ff",
      line: tokens.getPropertyValue("--dash-line").trim() || "#e4e8f0",
      accent: tokens.getPropertyValue("--dash-accent").trim() || "#4c55ea",
    });
  }, [mobile]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open && position) {
      menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    }
  }, [open, Boolean(position)]);

  const select = (tab: "overview" | "agent-chat") => {
    setOpen(false);
    onNavigate(tab);
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)') || []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (!items.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  const menuStyle = position ? {
    top: position.top, left: position.left, width: position.width,
    "--picker-text": position.ink, "--picker-muted": position.muted,
    "--picker-surface": position.surface, "--picker-subtle": position.subtle,
    "--picker-line": position.line, "--picker-accent": position.accent,
  } as CSSProperties : undefined;

  return <>
    <div className={"dashboardWorkspacePicker" + (mobile ? " mobilePicker" : "")}>
      <button ref={triggerRef} type="button" className="workspacePickerTrigger" aria-label={tr("Switch workspace", "切换工作空间")}
        aria-haspopup="menu" aria-controls={open ? menuId : undefined} aria-expanded={open}
        onClick={() => setOpen(value => !value)}>
        <span className={"workspacePickerEmblem " + workspace} aria-hidden="true"><ProductIcon workspace={workspace}/></span>
        <span className="workspacePickerCopy">
          <small>{tr("WORKSPACE", "工作空间")}</small><strong>{workspace === "connect" ? "Connect" : "Arc"}</strong>
        </span>
        <span className="workspacePickerChevron" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m5 6 3 3 3-3"/></svg></span>
      </button>
    </div>
    {open && position && createPortal(
      <div id={menuId} className="workspacePickerMenuPortal" ref={menuRef} style={menuStyle}
        role="menu" aria-label={tr("Choose workspace", "选择工作空间")} onKeyDown={handleMenuKeyDown}>
        <div className="workspacePickerMenuCaption">{tr("SWITCH WORKSPACE", "切换工作空间")}</div>
        <button type="button" role="menuitemradio" aria-checked={workspace === "connect"}
          className={workspace === "connect" ? "selected" : ""} onClick={() => select("overview")}>
          <span className="workspaceOptionIcon" aria-hidden="true"><ProductIcon workspace="connect"/></span>
          <span className="workspaceOptionDescription"><strong>Connect</strong><small>{tr("Bring tools to the AI you use", "为你常用的 AI 连接工具")}</small></span>
          <span className="workspaceOptionCheck"><Icon name={workspace === "connect" ? 'check' : 'arrowUpRight'} size={15}/></span>
        </button>
        <button type="button" role="menuitemradio" aria-checked={workspace === "agent"} disabled={!arcAvailable}
          className={workspace === "agent" ? "selected" : ""} onClick={() => select("agent-chat")}>
          <span className="workspaceOptionIcon agent" aria-hidden="true"><ProductIcon workspace="agent"/></span>
          <span className="workspaceOptionDescription"><strong>Arc</strong><small>{tr("Your personal AI workspace", "你的个人 AI 工作空间")}</small></span>
          {arcAvailable ? <span className="workspaceOptionCheck"><Icon name={workspace === "agent" ? 'check' : 'arrowUpRight'} size={15}/></span> : <span className="workspaceComingSoon">{tr("Coming soon", "即将上线")}</span>}
        </button>
        <div className="workspacePickerMenuFoot">{tr("One account. Shared apps and devices.","同一个账号，共享已连接的应用与设备。")}</div>
      </div>,
      document.body,
    )}
  </>;
}
