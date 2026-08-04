const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const HomeIcon = (props) => (
  <svg {...base} {...props}><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /></svg>
);

export const ScheduleIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </svg>
);

export const RecordIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 20V5a1 1 0 0 1 1-1h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm0 0a2 2 0 0 1 2-2h14" />
  </svg>
);

export const CommunityIcon = (props) => (
  <svg {...base} {...props}><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /></svg>
);

export const GroupIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20c.8-3.4 3.2-5 6.5-5s5.7 1.6 6.5 5" />
    <circle cx="17" cy="8.5" r="2.6" />
    <path d="M15.5 12c2.2.4 3.6 1.7 4.2 3.6" />
  </svg>
);

export const SearchIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.6-4.6" />
  </svg>
);

export const FriendAddIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21c1-4 3.5-6 7-6s6 2 7 6" />
    <path d="M18 8h4M20 6v4" />
  </svg>
);

export const ProfileIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </svg>
);

export const SunIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = (props) => (
  <svg {...base} {...props}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>
);
