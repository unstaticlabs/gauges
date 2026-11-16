import { useMemo } from 'react';
import { View } from 'react-native';
import { create } from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';

export interface QrCodeProps {
  value: string;
  /** The width and height in points, with the quiet zone. */
  size: number;
  accessibilityLabel: string;
  testID?: string;
}

/** The empty border around the code, in modules. The standard asks for 4. */
const QUIET = 4;

/**
 * Draws a QR code as one SVG path. It is dark on white in both modes,
 * because many scanners cannot read a light code on a dark background.
 */
export function QrCode({ value, size, accessibilityLabel, testID }: QrCodeProps) {
  const { path, count } = useMemo(() => {
    const { modules } = create(value, { errorCorrectionLevel: 'M' });
    let d = '';
    for (let y = 0; y < modules.size; y += 1) {
      // One rectangle for each run of dark modules, so that no thin seams show.
      let x = 0;
      while (x < modules.size) {
        if (!modules.get(x, y)) {
          x += 1;
          continue;
        }
        const start = x;
        while (x < modules.size && modules.get(x, y)) x += 1;
        d += `M${start + QUIET} ${y + QUIET}h${x - start}v1h${start - x}z`;
      }
    }
    return { path: d, count: modules.size + QUIET * 2 };
  }, [value]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} testID={testID}>
      <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
        <Rect x={0} y={0} width={count} height={count} fill="#FFFFFF" />
        <Path d={path} fill="#0E1116" />
      </Svg>
    </View>
  );
}
