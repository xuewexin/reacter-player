import React from 'react';

/**
 * SVG 图标组件库 — 统一 24x24 viewBox
 */

function IconWrap({ children, size = 24, color = 'currentColor', className = '', ...props }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" {...props}>{children}</svg>
  );
}

export const SearchIcon = (p) => (<IconWrap {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></IconWrap>);
export const CloseIcon = (p) => (<IconWrap {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></IconWrap>);
export const MenuIcon = (p) => (<IconWrap {...p}><line x1="4" x2="20" y1="5" y2="5"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="19" y2="19"/></IconWrap>);
export const SunIcon = (p) => (<IconWrap {...p}><circle cx="12" cy="12" r="5"/><line x1="12" x2="12" y1="1" y2="3"/><line x1="12" x2="12" y1="21" y2="23"/><line x1="4.22" x2="5.64" y1="4.22" y2="5.64"/><line x1="18.36" x2="19.78" y1="18.36" y2="19.78"/><line x1="1" x2="3" y1="12" y2="12"/><line x1="21" x2="23" y1="12" y2="12"/><line x1="4.22" x2="5.64" y1="19.78" y2="18.36"/><line x1="18.36" x2="19.78" y1="5.64" y2="4.22"/></IconWrap>);
export const MoonIcon = (p) => (<IconWrap {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></IconWrap>);
export const PlayIcon = (p) => (<IconWrap {...p}><polygon points="6 3 20 12 6 21 6 3" fill={p.color||'currentColor'}/></IconWrap>);
export const PauseIcon = (p) => (<IconWrap {...p}><rect x="5" y="4" width="4" height="16" rx="1" fill={p.color||'currentColor'}/><rect x="15" y="4" width="4" height="16" rx="1" fill={p.color||'currentColor'}/></IconWrap>);
export const PrevIcon = (p) => (<IconWrap {...p}><polygon points="19 4 10 12 19 20 19 4" fill={p.color||'currentColor'}/><rect x="4" y="4" width="4" height="16" rx="1" fill={p.color||'currentColor'}/></IconWrap>);
export const NextIcon = (p) => (<IconWrap {...p}><polygon points="5 4 14 12 5 20 5 4" fill={p.color||'currentColor'}/><rect x="15" y="4" width="4" height="16" rx="1" fill={p.color||'currentColor'}/></IconWrap>);
export const VolumeHighIcon = (p) => (<IconWrap {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></IconWrap>);
export const VolumeLowIcon = (p) => (<IconWrap {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></IconWrap>);
export const VolumeMuteIcon = (p) => (<IconWrap {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/></IconWrap>);
export const ListIcon = (p) => (<IconWrap {...p}><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></IconWrap>);
export const RepeatIcon = (p) => (<IconWrap {...p}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></IconWrap>);
export const ShuffleIcon = (p) => (<IconWrap {...p}><polyline points="16 3 21 3 21 8"/><line x1="4" x2="21" y1="20" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" x2="21" y1="15" y2="21"/><line x1="4" x2="9" y1="4" y2="9"/></IconWrap>);
export const HeartIcon = (p) => (<IconWrap {...p} fill={p.filled?(p.color||'currentColor'):'none'}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></IconWrap>);
export const MusicNoteIcon = (p) => (<IconWrap {...p}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></IconWrap>);
export const TrendingIcon = (p) => (<IconWrap {...p}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></IconWrap>);
export const StarIcon = (p) => (<IconWrap {...p} fill={p.filled?(p.color||'currentColor'):'none'}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></IconWrap>);
export const MusicIcon = (p) => (<IconWrap {...p}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></IconWrap>);
export const TrophyIcon = (p) => (<IconWrap {...p}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></IconWrap>);
export const MoreIcon = (p) => (<IconWrap {...p}><circle cx="12" cy="5" r="1" fill={p.color||'currentColor'}/><circle cx="12" cy="12" r="1" fill={p.color||'currentColor'}/><circle cx="12" cy="19" r="1" fill={p.color||'currentColor'}/></IconWrap>);
export const UserIcon = (p) => (<IconWrap {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></IconWrap>);
export const LogoutIcon = (p) => (<IconWrap {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></IconWrap>);

