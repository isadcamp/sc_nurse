"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export function SidePanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={ref} className="nf-drawer" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right) onClose(); } }}>
    <div className="nf-drawer-heading"><h2>{title}</h2><button className="nf-icon-button" aria-label="ปิดแผงปัญหา" onClick={onClose}><XMarkIcon/></button></div>
    <div className="nf-drawer-body">{children}</div>
  </dialog>;
}
