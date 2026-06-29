import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ArbiterSignals, CapabilityManifest } from '@sage/shared-types';
import {
  buildCapabilityManifest,
  deriveFeatureFlags,
  readSignalsSafe,
  type FeatureFlags,
} from '@sage/arbiter-core';
import { createNativeCapabilityProbe } from './src/capability/nativeProbe';
import { createNativeSignalProvider } from './src/signals/nativeSignalProvider';
import { ensureMicPermission, getMicPermission } from './src/permissions';
import { HomeScreen } from './src/ui/HomeScreen';
import { VoiceScreen } from './src/ui/VoiceScreen';
import { COLORS } from './src/ui/theme';

type Screen = 'home' | 'voice';

interface Boot {
  manifest: CapabilityManifest;
  signals: ArbiterSignals;
  flags: FeatureFlags;
}

/**
 * App shell. Runs the Phase 0 cold-start sequence (signals → capability
 * manifest), derives capability-aware feature flags, then renders a Home screen
 * (gated feature tiles + diagnostics) and the Phase 2 Voice screen.
 */
export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [screen, setScreen] = useState<Screen>('home');

  const runBoot = useCallback(async () => {
    const mic = await getMicPermission();
    const sig = await readSignalsSafe(createNativeSignalProvider(), { taskText: '' });
    const manifest = await buildCapabilityManifest(createNativeCapabilityProbe(), {
      signalsReady: !sig.degraded,
    });
    setBoot({
      manifest,
      signals: sig.signals,
      flags: deriveFeatureFlags(manifest, { microphone: mic }),
    });
  }, []);

  useEffect(() => {
    void runBoot();
  }, [runBoot]);

  const requestMic = useCallback(async () => {
    await ensureMicPermission();
    await runBoot();
  }, [runBoot]);

  if (!boot) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={COLORS.accent} />
        <Text style={styles.muted}>Verifying capability manifest…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        {screen === 'home' ? (
          <HomeScreen
            manifest={boot.manifest}
            signals={boot.signals}
            flags={boot.flags}
            onOpenVoice={() => setScreen('voice')}
            onRequestMic={requestMic}
          />
        ) : (
          <VoiceScreen
            manifest={boot.manifest}
            flags={boot.flags}
            onBack={() => setScreen('home')}
          />
        )}
      </View>
      <View style={styles.nav}>
        <NavButton label="Home" active={screen === 'home'} onPress={() => setScreen('home')} />
        <NavButton label="Voice" active={screen === 'voice'} onPress={() => setScreen('voice')} />
      </View>
    </View>
  );
}

function NavButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.navBtn} onPress={onPress}>
      <Text style={[styles.navLabel, active ? { color: COLORS.accent } : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.page },
  content: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: COLORS.page,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  muted: { color: COLORS.dim, fontSize: 13 },
  nav: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
    backgroundColor: 'rgba(10,12,16,0.9)',
    paddingBottom: 24,
    paddingTop: 10,
  },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  navLabel: { color: COLORS.faint, fontSize: 13, fontWeight: '600' },
});
