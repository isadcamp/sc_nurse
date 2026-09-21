"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function ModalFrame({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className={`nf-modal ${className}`} onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}
