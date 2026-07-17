import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './components';
import { useTheme, palette } from './theme';
import { radius, spacing, shadow, fontWeight } from './tokens';

export interface ConfirmOpts {
  title: string;
  message?: string;
  confirmText: string;
  /** Si se omite, se muestra un solo botón (alerta informativa). */
  cancelText?: string;
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

const ConfirmContext = createContext<(opts: ConfirmOpts) => Promise<boolean>>(async () => false);

/** Diálogo de confirmación/alerta con estilo propio (reemplaza window.confirm/Alert). */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      // Si ya había un diálogo abierto, cerramos su promesa como cancelada
      // para no dejar un await colgado (promesa huérfana).
      resolver.current?.(false);
      resolver.current = resolve;
      setOpts(o);
    });
  }, []);

  const finish = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  const danger = !!opts?.destructive;
  const hasCancel = !!opts?.cancelText;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal visible={!!opts} transparent animationType="fade" statusBarTranslucent onRequestClose={() => finish(false)}>
        <Pressable
          onPress={() => finish(false)}
          style={{ flex: 1, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: t.colors.bgElevated,
              borderRadius: radius['2xl'],
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.xl,
              paddingBottom: spacing.lg,
              gap: spacing.md,
              alignItems: 'center',
              ...shadow.floating,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.full,
                backgroundColor: danger ? 'rgba(239,68,68,0.14)' : t.colors.brandSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={opts?.icon ?? (danger ? 'alert' : 'help')}
                size={32}
                color={danger ? t.colors.danger : t.colors.brand}
              />
            </View>

            <AppText variant="subtitle" style={{ textAlign: 'center' }}>{opts?.title}</AppText>
            {opts?.message ? (
              <AppText muted style={{ textAlign: 'center', lineHeight: 21 }}>{opts.message}</AppText>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, width: '100%' }}>
              {hasCancel ? (
                <Pressable
                  onPress={() => finish(false)}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 50,
                    borderRadius: radius.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.colors.surfaceAlt,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <AppText style={{ fontWeight: fontWeight.semibold }}>{opts?.cancelText}</AppText>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => finish(true)}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 50,
                  borderRadius: radius.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: danger ? t.colors.danger : t.colors.brand,
                  opacity: pressed ? 0.9 : 1,
                  ...shadow.card,
                })}
              >
                <AppText color={palette.white} style={{ fontWeight: fontWeight.bold }}>{opts?.confirmText}</AppText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}
