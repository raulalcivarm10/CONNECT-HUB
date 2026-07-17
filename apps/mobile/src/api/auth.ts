/** Endpoints tipados del auth de asistente (/public/auth/*). */
import type { AsistenteProfile, AuthResponse } from '@connecthub/shared-types';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface AppleBody {
  identityToken: string;
  email?: string;
  nombre?: string;
  apellido?: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  nombre?: string;
  apellido?: string;
}
export interface LoginBody {
  email: string;
  password: string;
}
export interface OnboardingBody {
  nombre?: string;
  apellido?: string;
  numeroCelular?: string;
  genero?: string;
}

export const registerReq = (b: RegisterBody) =>
  apiPost<AuthResponse>('/public/auth/register', b);

export const loginReq = (b: LoginBody) =>
  apiPost<AuthResponse>('/public/auth/login', b);

export const googleReq = (idToken: string) =>
  apiPost<AuthResponse>('/public/auth/google', { idToken });

/** Sign in with Apple (nativo ConnectHub): canjea el identityToken por una sesión. */
export const appleReq = (b: AppleBody) =>
  apiPost<AuthResponse>('/public/auth/apple', b);

/** Elimina la cuenta del asistente (anonimiza + retiene finanzas). Requiere sesión. */
export const deleteAccountReq = () =>
  apiDelete<{ deleted: boolean }>('/public/auth/me');

export const verifyReq = (token: string) =>
  apiPost<{ verified: boolean }>('/public/auth/verify', { token });

export const refreshReq = (refreshToken: string) =>
  apiPost<AuthResponse>('/public/auth/refresh', { refreshToken });

/** Canjea el token del servicio de pagos por una sesión ConnectHub. */
export const pagosExchangeReq = (pagosToken: string) =>
  apiPost<AuthResponse>('/public/auth/pagos-exchange', { pagosToken });

export const meReq = () =>
  apiGet<AsistenteProfile>('/public/auth/me', undefined, true);

export const onboardingReq = (b: OnboardingBody) =>
  apiPatch<AsistenteProfile>('/public/auth/onboarding', b);

export const forgotReq = (email: string) =>
  apiPost<{ sent: boolean; devResetToken?: string }>('/public/auth/forgot', { email });

export const resetReq = (token: string, password: string) =>
  apiPost<{ reset: boolean }>('/public/auth/reset', { token, password });
