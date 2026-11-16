import { StyleSheet, Text, View } from 'react-native';

import { fonts, useTheme } from '../theme';
import { avatarColors, initials } from './avatarLook';
import { Icon } from './Icon';

export interface AvatarPerson {
  id: string;
  /** `null` or empty when the person has no name yet. */
  name?: string | null;
  /** A fixed color. Without it, the stack picks the colors of the group. */
  color?: string;
}

export interface AvatarStackProps {
  /** The people in the order to show, the first on the left. */
  people: readonly AvatarPerson[];
  /** The label that screen readers read for the whole stack. */
  accessibilityLabel: string;
  /** The diameter of one circle, in points. */
  size?: number;
  /** The most circles to show. The rest becomes one "+N" circle. */
  max?: number;
  /** The color of the ring around each circle: the color behind the stack. */
  ringColor?: string;
  testID?: string;
}

/**
 * Small overlapping circles with initials, one for each person. The color
 * comes from the user ID, so it is the same on each device.
 */
export function AvatarStack({
  people,
  accessibilityLabel,
  size = 24,
  max = 3,
  ringColor,
  testID,
}: AvatarStackProps) {
  const { colors } = useTheme();
  const ring = ringColor ?? colors.background;
  const shown = people.length > max ? people.slice(0, max) : people;
  const rest = people.length - shown.length;
  const overlap = Math.round(size * 0.3);
  const circle = { width: size + 3, height: size + 3, borderRadius: (size + 3) / 2, borderColor: ring };
  const fontSize = Math.round(size * 0.42);
  // The colors come from the whole group, so two members never share one.
  const groupColors = avatarColors(people.map((p) => p.id));

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {shown.map((person, index) => {
        const text = initials(person.name);
        return (
          <View
            key={person.id}
            style={[
              styles.circle,
              circle,
              { backgroundColor: person.color ?? groupColors.get(person.id), marginLeft: index === 0 ? 0 : -overlap, zIndex: max - index },
            ]}
          >
            {text ? (
              <Text style={[styles.initials, { fontSize, lineHeight: fontSize + 2 }]} numberOfLines={1}>
                {text}
              </Text>
            ) : (
              <Icon name="person" color="#FFFFFF" size={Math.round(size * 0.6)} strokeWidth={2.2} />
            )}
          </View>
        );
      })}
      {rest > 0 ? (
        <View style={[styles.circle, circle, { backgroundColor: colors.field, marginLeft: -overlap }]}>
          <Text style={[styles.initials, { fontSize, lineHeight: fontSize + 2, color: colors.textMuted }]}>
            +{rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: '#FFFFFF',
    fontFamily: fonts.bold,
    letterSpacing: -0.2,
  },
});
