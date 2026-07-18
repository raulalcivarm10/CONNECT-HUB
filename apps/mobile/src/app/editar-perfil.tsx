import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Skeleton } from '@/design-system/components';
import { Avatar } from '@/design-system/avatar';
import { useTheme, palette } from '@/design-system/theme';
import { radius, spacing, fontSize, fontWeight } from '@/design-system/tokens';
import { useI18n } from '@/i18n';
import { useMiPerfil, actualizarPerfil, subirFotoPerfil } from '@/api/perfil';
import { useAuth } from '@/store/auth';
import { ApiError } from '@/api/client';

function Field({
  label, value, onChangeText, placeholder, multiline, autoCapitalize, editable = true, keyboardType, hint,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words';
  editable?: boolean; keyboardType?: 'default' | 'email-address' | 'number-pad'; hint?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AppText variant="caption" muted style={{ fontWeight: fontWeight.semibold }}>{label}</AppText>
        {!editable ? <Ionicons name="lock-closed" size={12} color={t.colors.textFaint} /> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textFaint}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        editable={editable}
        keyboardType={keyboardType}
        style={{
          minHeight: multiline ? 88 : 48,
          borderRadius: radius.md,
          backgroundColor: t.colors.surfaceAlt,
          paddingHorizontal: spacing.md,
          paddingTop: multiline ? 12 : 0,
          color: editable ? t.colors.text : t.colors.textMuted,
          fontSize: fontSize.md,
          opacity: editable ? 1 : 0.7,
        }}
      />
      {hint ? <AppText variant="caption" muted style={{ fontSize: 11 }}>{hint}</AppText> : null}
    </View>
  );
}

export default function EditarPerfil() {
  const t = useTheme();
  const { t: tr } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useMiPerfil();
  const authUser = useAuth((s) => s.user);
  const setAuthUser = useAuth((s) => s.setUser);

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [tipoId, setTipoId] = useState('C');
  const [numeroId, setNumeroId] = useState('');
  const [emailFactura, setEmailFactura] = useState('');
  const [profesion, setProfesion] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [bio, setBio] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [privado, setPrivado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  useEffect(() => {
    if (data) {
      setNombre(data.nombre ?? '');
      setApellido(data.apellido ?? '');
      setFotoUrl(data.fotoUrl ?? '');
      setTipoId(data.tipoId ?? 'C');
      setNumeroId(data.numeroId ?? '');
      setEmailFactura(data.emailFactura ?? '');
      setProfesion(data.profesion ?? '');
      setEmpresa(data.empresa ?? '');
      setBio(data.bio ?? '');
      setLinkedin(data.linkedinUrl ?? '');
      setPrivado(data.visibilidad === 'PRIVADO');
    }
  }, [data]);

  async function invalidarPerfil() {
    await qc.invalidateQueries({ queryKey: ['mi-perfil'] });
    if (data?.idCliente) await qc.invalidateQueries({ queryKey: ['perfil', data.idCliente] });
  }

  async function guardar() {
    setSaving(true);
    try {
      // la foto se sube aparte (NAS); aquí solo los datos
      const perfil = await actualizarPerfil({
        // nombre/apellido no se envían si están bloqueados (certificado emitido):
        // el backend rechazaría el cambio y no se podría guardar el resto.
        ...(data?.nombreBloqueado ? {} : { nombre, apellido }),
        profesion, empresa, bio,
        tipoId, numeroId: numeroId.trim() || null,
        emailFactura: emailFactura.trim() || null,
        linkedinUrl: linkedin.trim() || null,
        visibilidad: privado ? 'PRIVADO' : 'PUBLICO',
      });
      // sincroniza el store de auth (nombre/foto/cédula que se ven en otras pantallas)
      if (authUser) setAuthUser({ ...authUser, nombre: perfil.nombre, apellido: perfil.apellido, fotoUrl: perfil.fotoUrl, tipoId: perfil.tipoId, numeroId: perfil.numeroId });
      await invalidarPerfil();
      if (router.canGoBack()) router.back();
    } catch (err) {
      Alert.alert(tr('common.error'), err instanceof ApiError ? err.message : '');
    } finally {
      setSaving(false);
    }
  }

  async function cambiarFoto() {
    // en web no hay permiso de galería (usa <input type=file>)
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(tr('profile.photoPermTitle'), tr('profile.photoPermBody'));
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setSubiendoFoto(true);
    try {
      const actualizado = await subirFotoPerfil(res.assets[0].uri);
      setFotoUrl(actualizado.fotoUrl ?? '');
      // sincroniza el avatar en el store de auth (Profile tab, etc.)
      if (authUser) setAuthUser({ ...authUser, fotoUrl: actualizado.fotoUrl });
      await invalidarPerfil();
    } catch (err) {
      Alert.alert(tr('profile.photoError'), err instanceof ApiError ? err.message : '');
    } finally {
      setSubiendoFoto(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/perfil'))} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={t.colors.text} />
        </Pressable>
        <AppText variant="title">{tr('profile.editTitle')}</AppText>
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} radius={radius.md} />)}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.md }}>
          <View style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <Pressable onPress={cambiarFoto} disabled={subiendoFoto}>
              <Avatar nombre={nombre || data?.email} fotoUrl={fotoUrl || null} size={104} />
              <View
                style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 34, height: 34, borderRadius: radius.full,
                  backgroundColor: t.colors.brand, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 3, borderColor: t.colors.bg,
                }}
              >
                {subiendoFoto ? (
                  <ActivityIndicator size="small" color={palette.white} />
                ) : (
                  <Ionicons name="camera" size={18} color={palette.white} />
                )}
              </View>
            </Pressable>
            <Pressable onPress={cambiarFoto} disabled={subiendoFoto}>
              <AppText color={t.colors.brandText} variant="caption" style={{ fontWeight: fontWeight.semibold }}>
                {tr('profile.changePhoto')}
              </AppText>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}><Field label={tr('profile.firstName')} value={nombre} onChangeText={setNombre} autoCapitalize="words" editable={!data?.nombreBloqueado} /></View>
            <View style={{ flex: 1 }}><Field label={tr('profile.lastName')} value={apellido} onChangeText={setApellido} autoCapitalize="words" editable={!data?.nombreBloqueado} /></View>
          </View>
          {data?.nombreBloqueado ? (
            <AppText variant="caption" muted style={{ fontSize: 11 }}>{tr('profile.nameLocked')}</AppText>
          ) : (
            <AppText variant="caption" muted style={{ fontSize: 11 }}>{tr('profile.nameCertHint')}</AppText>
          )}
          {/* Identificación (cédula) — requerida para pagar */}
          <View style={{ gap: 6 }}>
            <AppText variant="caption" muted style={{ fontWeight: fontWeight.semibold }}>{tr('profile.idLabel')}</AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt }}>
                {(['C', 'P', 'R'] as const).map((tp) => {
                  const on = tipoId === tp;
                  return (
                    <Pressable
                      key={tp}
                      onPress={() => setTipoId(tp)}
                      style={{ paddingHorizontal: spacing.md, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.colors.brand : 'transparent' }}
                    >
                      <AppText variant="caption" color={on ? t.colors.onBrand : t.colors.textMuted} style={{ fontWeight: fontWeight.semibold }}>
                        {tr(tp === 'C' ? 'profile.idCedula' : tp === 'P' ? 'profile.idPassport' : 'profile.idRuc')}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={numeroId}
                onChangeText={setNumeroId}
                placeholder={tr('profile.idNumberPh')}
                placeholderTextColor={t.colors.textFaint}
                keyboardType="number-pad"
                maxLength={20}
                style={{ flex: 1, height: 48, borderRadius: radius.md, backgroundColor: t.colors.surfaceAlt, paddingHorizontal: spacing.md, color: t.colors.text, fontSize: fontSize.md }}
              />
            </View>
          </View>

          {/* Correo de facturación (datos de facturación; puede diferir del de la cuenta) */}
          <Field
            label={tr('profile.billingEmail')}
            value={emailFactura}
            onChangeText={setEmailFactura}
            placeholder={data?.email}
            autoCapitalize="none"
            keyboardType="email-address"
            hint={tr('profile.billingEmailHint')}
          />

          <Field label={tr('profile.profession')} value={profesion} onChangeText={setProfesion} placeholder={tr('profile.professionPh')} />
          <Field label={tr('profile.company')} value={empresa} onChangeText={setEmpresa} />
          <Field label={tr('profile.bio')} value={bio} onChangeText={setBio} multiline placeholder={tr('profile.bioPh')} />
          <Field label="LinkedIn" value={linkedin} onChangeText={setLinkedin} placeholder="https://linkedin.com/in/…" autoCapitalize="none" />

          {/* Privacidad */}
          <Pressable
            onPress={() => setPrivado((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.colors.border, padding: spacing.md, marginTop: spacing.sm }}
          >
            <Ionicons name={privado ? 'lock-closed' : 'earth'} size={22} color={t.colors.brand} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{privado ? tr('profile.private') : tr('profile.public')}</AppText>
              <AppText muted variant="caption">{privado ? tr('profile.privateDesc') : tr('profile.publicDesc')}</AppText>
            </View>
            <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: privado ? t.colors.brand : t.colors.surfaceAlt, padding: 3, justifyContent: 'center' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: privado ? 'flex-end' : 'flex-start' }} />
            </View>
          </Pressable>

          <Button title={tr('profile.save')} onPress={guardar} loading={saving} style={{ marginTop: spacing.md }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
