'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { ArrowLeft } from 'lucide-react';

import { BackendEndpointForm } from './components/BackendEndpointForm';
import type { BackendConnection } from '@/services/backendEndpoint';
import { getStoredBackendConnection } from '@/services/backendEndpoint';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import { getBaseUrl, isTauriAppPlatform } from '@/services/environment';
import { supabase } from '@/utils/supabase';
import WindowButtons from '@/components/WindowButtons';

export default function AuthPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { envConfig, appService } = useEnv();
  const { isDarkMode, safeAreaInsets, isRoundedWindow } = useThemeStore();
  const { isTrafficLightVisible } = useTrafficLightStore();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const [isMounted, setIsMounted] = useState(false);
  const [clientRevision, setClientRevision] = useState(0);
  const [initialEndpoint, setInitialEndpoint] = useState('');
  const headerRef = useRef<HTMLDivElement>(null);

  useTheme({ systemUIVisible: false });

  useEffect(() => {
    setInitialEndpoint(getStoredBackendConnection()?.endpoint || getBaseUrl());
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const client = supabase;
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token || !session.user) return;
      login(session.access_token, session.user);
      const redirectTo = new URLSearchParams(window.location.search).get('redirect');
      router.push(redirectTo ?? '/library');
    });
    return () => subscription?.subscription.unsubscribe();
  }, [clientRevision, login, router]);

  const handleConnected = (_connection: BackendConnection) => {
    setClientRevision((value) => value + 1);
  };

  const handleGoBack = () => {
    const nextSettings = { ...settings, keepLogin: false };
    setSettings(nextSettings);
    void saveSettings(envConfig, nextSettings);
    const redirectTo = new URLSearchParams(window.location.search).get('redirect');
    if (redirectTo) router.push(redirectTo);
    else router.back();
  };

  if (!isMounted) return null;

  const redirectTo = isTauriAppPlatform()
    ? 'readest://auth-callback'
    : `${window.location.origin}/auth/callback`;

  const authForm = (
    <div className='w-full max-w-[420px] px-6 pb-8'>
      <BackendEndpointForm initialEndpoint={initialEndpoint} onConnected={handleConnected} />
      <Auth
        key={clientRevision}
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        theme={isDarkMode ? 'dark' : 'light'}
        magicLink={false}
        providers={[]}
        redirectTo={redirectTo}
        localization={{
          variables: {
            sign_in: {
              email_label: _('Email address'),
              password_label: _('Your Password'),
              button_label: _('Sign in'),
              loading_button_label: _('Signing in...'),
              link_text: _('Already have an account? Sign in'),
            },
            sign_up: {
              email_label: _('Email address'),
              password_label: _('Create a Password'),
              button_label: _('Sign up'),
              loading_button_label: _('Signing up...'),
              link_text: _("Don't have an account? Sign up"),
              confirmation_text: _('Check your email for the confirmation link'),
            },
            forgotten_password: {
              email_label: _('Email address'),
              button_label: _('Send reset password instructions'),
              loading_button_label: _('Sending reset instructions ...'),
              link_text: _('Forgot your password?'),
              confirmation_text: _('Check your email for the password reset link'),
            },
          },
        }}
      />
    </div>
  );

  return (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 flex select-none flex-col items-center overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        ref={headerRef}
        className={clsx(
          'flex h-12 w-full shrink-0 items-center justify-between px-4',
          appService?.hasTrafficLight && 'pt-8',
        )}
        style={{ marginTop: `${safeAreaInsets?.top || 0}px` }}
      >
        <button
          aria-label={_('Go Back')}
          onClick={handleGoBack}
          className='btn btn-ghost h-9 min-h-9 w-9 p-0'
        >
          <ArrowLeft />
        </button>
        {appService?.hasWindowBar && (
          <WindowButtons
            headerRef={headerRef}
            showMinimize={!isTrafficLightVisible}
            showMaximize={!isTrafficLightVisible}
            showClose={!isTrafficLightVisible}
            onClose={handleGoBack}
          />
        )}
      </div>
      <main className='flex w-full flex-1 justify-center overflow-y-auto pt-6'>{authForm}</main>
    </div>
  );
}
