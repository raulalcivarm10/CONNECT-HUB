import { Modal, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './tokens';

/** Visor de imagen a pantalla completa (tap para cerrar). */
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', alignItems: 'center', justifyContent: 'center' }}
      >
        {uri ? (
          <Image source={{ uri }} contentFit="contain" transition={150} style={{ width: '100%', height: '82%' }} />
        ) : null}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={{
            position: 'absolute',
            top: insets.top + spacing.md,
            right: spacing.lg,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
