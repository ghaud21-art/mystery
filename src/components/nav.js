import {
  FriendAddIcon, GroupIcon, HomeIcon, ProfileIcon,
  RecordIcon, ScheduleIcon, SearchIcon,
} from "./icons.jsx";

export const NAV_ITEMS = [
  { to: "/dashboard", label: "홈", Icon: HomeIcon },
  { to: "/agenda", label: "일정", Icon: ScheduleIcon },
  { to: "/schedule", label: "모임", Icon: GroupIcon },
  { to: "/records", label: "기록", Icon: RecordIcon },
  { to: "/scenarios", label: "찾기", Icon: SearchIcon },
  { to: "/friends", label: "친구", Icon: FriendAddIcon },
  { to: "/profile", label: "프로필", Icon: ProfileIcon },
];
