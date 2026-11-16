import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'check'
  | 'plus'
  | 'close'
  | 'search'
  | 'chevronRight'
  | 'trash'
  | 'archive'
  | 'settings'
  | 'group'
  | 'list'
  | 'share'
  | 'copy'
  | 'scan'
  | 'link'
  | 'tag'
  | 'person'
  | 'edit'
  | 'leave'
  | 'refresh'
  | 'repeat'
  | 'arrowRight'
  | 'more';

export interface IconProps {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}

/** A small line icon. Screen readers skip it: put the label on the control. */
export function Icon({ name, color, size = 24, strokeWidth = 2 }: IconProps) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...stroke} />}
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={6.5} {...stroke} />
          <Path d="M20 20l-4.2-4.2" {...stroke} />
        </>
      )}
      {name === 'chevronRight' && <Path d="M9 6l6 6-6 6" {...stroke} />}
      {name === 'trash' && (
        <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" {...stroke} />
      )}
      {name === 'archive' && (
        <>
          <Rect x={3} y={4} width={18} height={4} rx={1} {...stroke} />
          <Path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" {...stroke} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" {...stroke} />
          <Circle cx={15} cy={6} r={2} {...stroke} />
          <Circle cx={9} cy={12} r={2} {...stroke} />
          <Circle cx={17} cy={18} r={2} {...stroke} />
        </>
      )}
      {name === 'group' && (
        <>
          <Path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" {...stroke} />
          <Path d="M3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5" {...stroke} />
        </>
      )}
      {name === 'list' && <Path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" {...stroke} />}
      {name === 'share' && <Path d="M12 3v12M8 7l4-4 4 4M6 11H5v9h14v-9h-1" {...stroke} />}
      {name === 'copy' && (
        <>
          <Rect x={8} y={8} width={12} height={12} rx={2} {...stroke} />
          <Path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" {...stroke} />
        </>
      )}
      {name === 'scan' && (
        <Path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16" {...stroke} />
      )}
      {name === 'link' && (
        <Path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" {...stroke} />
      )}
      {name === 'tag' && (
        <>
          <Path d="M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9z" {...stroke} />
          <Circle cx={8} cy={8} r={1.5} {...stroke} />
        </>
      )}
      {name === 'person' && (
        <>
          <Circle cx={12} cy={8} r={4} {...stroke} />
          <Path d="M4 21a8 8 0 0116 0" {...stroke} />
        </>
      )}
      {name === 'edit' && <Path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" {...stroke} />}
      {name === 'leave' && <Path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M9 8l-4 4 4 4M5 12h11" {...stroke} />}
      {name === 'refresh' && <Path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" {...stroke} />}
      {name === 'arrowRight' && <Path d="M4 12h15M13 6l6 6-6 6" {...stroke} />}
      {name === 'more' && <Path d="M5 12h.01M12 12h.01M19 12h.01" {...stroke} strokeWidth={strokeWidth + 1.5} />}
      {name === 'repeat' && <Path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4" {...stroke} />}
    </Svg>
  );
}
