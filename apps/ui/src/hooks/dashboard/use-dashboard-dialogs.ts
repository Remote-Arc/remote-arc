import { useEffect, useRef, useState } from "react";
import { useI18n } from "../use-i18n.js";
import { type DashboardDialog } from "../../types/app-types.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Promise-based notice, confirm and prompt dialogs with a focus trap.
export function useDashboardDialogs({ tr }: { tr: Translate }) {
  const [dialog, setDialog] = useState<DashboardDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const dialogResolver = useRef<((value: boolean | string | null) => void) | null>(null);
  const dialogElement = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!dialog || !dialogElement.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const host = dialogElement.current;
    const controls = () =>
      Array.from(
        host.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ).filter((item) => item.getClientRects().length);
    (dialog.kind === "prompt"
      ? host.querySelector<HTMLInputElement>("input")
      : controls()[0]
    )?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settleDialog(dialog.kind === "notice" ? true : null);
      }
      if (event.key !== "Tab") return;
      const items = controls(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [dialog]);

  function settleDialog(value: boolean | string | null) {
    const resolve = dialogResolver.current;
    dialogResolver.current = null;
    setDialog(null);
    if (resolve) resolve(value);
  }

  function showNotice(title: string, message: string) {
    return new Promise<void>((resolve) => {
      dialogResolver.current = () => resolve();
      setDialogValue("");
      setDialog({
        kind: "notice",
        title,
        message,
        confirmLabel: tr("hooks.dashboard.useDashboardDialogs.gotIt"),
      });
    });
  }

  function askConfirm(
    title: string,
    message: string,
    confirmLabel = tr("hooks.dashboard.useDashboardDialogs.continue"),
    tone: "default" | "danger" = "default",
  ) {
    return new Promise<boolean>((resolve) => {
      dialogResolver.current = (value) => resolve(value === true);
      setDialogValue("");
      setDialog({
        kind: "confirm",
        title,
        message,
        confirmLabel,
        cancelLabel: tr("hooks.dashboard.useDashboardDialogs.cancel"),
        tone,
      });
    });
  }

  function askPrompt(
    title: string,
    message: string,
    initialValue = "",
    placeholder = "",
    confirmLabel = tr("hooks.dashboard.useDashboardDialogs.save"),
  ) {
    return new Promise<string | null>((resolve) => {
      dialogResolver.current = (value) => resolve(typeof value === "string" ? value : null);
      setDialogValue(initialValue);
      setDialog({
        kind: "prompt",
        title,
        message,
        confirmLabel,
        cancelLabel: tr("hooks.dashboard.useDashboardDialogs.cancel"),
        placeholder,
        initialValue,
      });
    });
  }

  return {
    dialog,
    setDialog,
    dialogValue,
    setDialogValue,
    dialogResolver,
    dialogElement,
    settleDialog,
    showNotice,
    askConfirm,
    askPrompt,
  };
}

export type DashboardDialogs = ReturnType<typeof useDashboardDialogs>;
