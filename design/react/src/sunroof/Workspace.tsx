import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import "./sunroof.css";

export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10 12 3l9 7v10H3V10m6 10v-7h6v7",
    orders: "M5 4h14v17H5V4m3 4h8M8 12h8M8 16h5",
    team: "M16 21v-3a4 4 0 0 0-8 0v3M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m7 3a4 4 0 0 1 3 4v3M18 3a4 4 0 0 1 0 8",
    factory: "M3 21V9l6 4V9l6 4V3h5v18H3m3-4h1m4 0h1m4 0h1",
    review: "M12 8v5m0 3v1M4 3h16v18H4V3",
    search: "m16 16 5 5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M6 18 18 6",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.orders} />
    </svg>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const d = ref.current!;
    d.showModal();
    return () => {
      d.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sr-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="sr-dialog-head">
        <h2>{title}</h2>
        <button className="sr-icon" aria-label="Close dialog" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
