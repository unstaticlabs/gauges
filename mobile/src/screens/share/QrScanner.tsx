import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { Button } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface QrScannerProps {
  /** Called one time with the text of the first QR code that the camera sees. */
  onScan: (data: string) => void;
  onCancel: () => void;
}

/** The camera view that reads a QR code. It asks for the camera permission first. */
export function QrScanner({ onScan, onCancel }: QrScannerProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same code many times. Keep only the first.
  const done = useRef(false);

  if (!permission) return <View style={styles.box} />;

  if (!permission.granted) {
    return (
      <View style={[styles.box, { gap: spacing.md }]}>
        <Text style={[typography.callout, { color: colors.textMuted }]}>{t.join.cameraDenied}</Text>
        {permission.canAskAgain ? (
          <Button label={t.join.cameraAllow} icon="scan" onPress={requestPermission} testID="camera-allow" />
        ) : (
          <Button label={t.join.openSettings} onPress={() => Linking.openSettings()} variant="secondary" />
        )}
        <Button label={t.common.cancel} variant="plain" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.camera, { borderRadius: radius.lg }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            done.current = true;
            onScan(data);
          }}
        />
        <View style={[styles.frame, { borderRadius: radius.lg }]} pointerEvents="none" />
      </View>
      <Text style={[typography.callout, styles.center, { color: colors.textMuted }]}>{t.join.scanHelp}</Text>
      <Button label={t.common.cancel} variant="secondary" onPress={onCancel} testID="scan-cancel" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 120,
    justifyContent: 'center',
  },
  camera: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  frame: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    opacity: 0.85,
  },
  center: {
    textAlign: 'center',
  },
});
