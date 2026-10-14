"use client";

import { useEffect, useRef } from "react";

/**
 * Modal built on the native <dialog>, which provides the focus trap, the
 * inert background and Escape handling. Escape calls `onCancel`. On open,
 * focus goes to the element marked data-autofocus.
 */
export function Dialog({
  open,
  onCancel,
  labelledBy,
  describedBy,
  children,
}: {
  open: boolean;
  onCancel: () => void;
  labelledBy: string;
  describedBy?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="panel"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {open ? <div className="p-6">{children}</div> : null}
    </dialog>
  );
}
