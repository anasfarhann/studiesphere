export type IconName =
  | "home" | "book" | "calendar" | "cards" | "trophy" | "settings" | "search" | "plus"
  | "folder" | "chevronLeft" | "chevronRight" | "bell" | "pen" | "highlighter" | "eraser" | "lasso" | "text"
  | "hand" | "photo" | "mic" | "paperclip" | "undo" | "redo" | "history" | "trash" | "play" | "pause" | "close" | "dots" | "share" | "dropper"
  | "mail" | "lock" | "eye" | "eyeOff" | "arrowRight";

const P: Record<IconName, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  book: (<><path d="M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1V19c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z" /><path d="M12 6.5V20" /></>),
  calendar: (<><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  cards: (<><rect x="3.5" y="7" width="13" height="13" rx="2.5" /><path d="M8 4h10a2.5 2.5 0 0 1 2.5 2.5V16" /></>),
  trophy: (<><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  bell: (<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>),
  pen: <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />,
  highlighter: <path d="M5 19h6M7 15l8-8 3 3-8 8H7zM13 9l3 3" />,
  eraser: <path d="M8 20h12M5 16l9-9 5 5-6 6H8z" />,
  lasso: <path d="M12 5c5 0 8 2 8 5s-4 5-8 5-8-2-8-5 3-5 8-5zM7 14c-1 3 0 5 3 6" />,
  text: <path d="M5 6h14M12 6v13M9 19h6" />,
  hand: <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7s-5-2-7-5l-1-2a1.5 1.5 0 0 1 2.6-1.4L8 13" />,
  photo: <path d="M3.5 7h3l1.5-2h8l1.5 2h3v12h-17zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  mic: <path d="M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3" />,
  paperclip: <path d="M20 11.5 12.5 19a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7L10.5 16.5a1.7 1.7 0 0 1-2.4-2.4L15 7.3" />,
  undo: (<><path d="M9 7 4 12l5 5" /><path d="M4 12h11a5 5 0 0 1 0 10h-2" /></>),
  redo: (<><path d="m15 7 5 5-5 5" /><path d="M20 12H9a5 5 0 0 0 0 10h2" /></>),
  history: (<><path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4l3 2" /></>),
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10 11v6M14 11v6" />,
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  share: <path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H18" />,
  dropper: <path d="M12 3.5c3.5 4.2 6 7.2 6 10.3a6 6 0 0 1-12 0c0-3.1 2.5-6.1 6-10.3zM9.5 14a2.6 2.6 0 0 0 2.2 2.4" />,
  mail: (<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></>),
  lock: (<><rect x="5" y="10" width="14" height="10" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: (<><path d="M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.5 7.3C3.9 9 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" /></>),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  dots: (<><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>),
};

/** Stroke icon from the design's set. Decorative: always aria-hidden. */
export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  const filled = name === "play";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={name === "plus" ? 2.2 : name === "arrowRight" ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {P[name]}
    </svg>
  );
}
