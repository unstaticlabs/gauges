import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * The height of the keyboard on Android, or 0 when it is closed.
 *
 * The Android app draws edge to edge, so the window does not get smaller
 * when the keyboard opens. A scroll view adds this height as bottom padding,
 * so that the user can scroll the last field and the button above the
 * keyboard. On iOS, a scroll view uses `automaticallyAdjustKeyboardInsets`
 * instead, so this hook gives 0 there and on the web.
 */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
