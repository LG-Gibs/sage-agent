import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ArbiterSignals, CapabilityManifest } from '@sage/shared-types';
import { buildCapabilityManifest, readSignalsSafe } from '@sage/arbiter-core';
import { createNativeCapabilityProbe } from './src/capability/nativeProbe';
import { createNativeSignalProvider } from './src/signals/nativeSignalProvider';

interface BootState {
  status: 'booting' | 'ready' | 'limited';
  manifest?: CapabilityManifest;
  signals?: ArbiterSignals;
  degradedSignals: string[];
}

/**
 * Phase 0 boot screen. On mount it runs the cold-start sequence — read all five
 * ArbiterRouter signals, then assemble the Capability Manifest — and reports
 * verified capability data. This is the visible proof of the Phase 0 success
 * criteria. The voice loop, Arbiter Core and tools arrive in later phases.
 */
export default function App() {
  const [boot, setBoot] = useState<BootState>({
    status: 'booting',
    degradedSignals: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const signalResult = await readSignalsSafe(createNativeSignalProvider(), {
        taskText: '',
      });
      const manifest = await buildCapabilityManifest(
        createNativeCapabilityProbe(),
        { signalsReady: !signalResult.degraded },
      );
      if (cancelled) return;
      setBoot({
        status: manifest.ready ? 'ready' : 'limited',
        manifest,
        signals: signalResult.signals,
        degradedSignals: signalResult.failed,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.brand}>Sage</Text>
        <Text style={styles.tagline}>The device is the agent.</Text>

        {boot.status === 'booting' ? (
          <View style={styles.center}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.muted}>Verifying capability manifest…</Text>
          </View>
        ) : (
          <>
            <StatusPill status={boot.status} />

            <Section title="Capability Manifest">
              {boot.manifest && (
                <>
                  <Row k="Platform" v={boot.manifest.platform} />
                  <Row k="OS version" v={boot.manifest.osVersion} />
                  <Row k="RAM" v={formatGb(boot.manifest.totalRamBytes)} />
                  <Row k="GPU backend" v={boot.manifest.gpu} />
                  <Row k="ML accelerator" v={boot.manifest.mlAccelerator} />
                  <Row k="NPU present" v={yn(boot.manifest.npuPresent)} />
                  <Row
                    k="9B eligible (≥8GB)"
                    v={yn(boot.manifest.supports9B)}
                  />
                  <Row
                    k="Verified models"
                    v={String(
                      boot.manifest.installedModels.filter((m) => m.verified)
                        .length,
                    )}
                  />
                </>
              )}
            </Section>

            <Section title="ArbiterRouter Signals">
              {boot.signals && (
                <>
                  <Row k="Network" v={boot.signals.network} />
                  <Row k="Power" v={boot.signals.power} />
                  <Row k="Complexity" v={boot.signals.complexity} />
                  <Row k="Privacy" v={boot.signals.privacy} />
                  <Row k="Preference" v={boot.signals.preference} />
                </>
              )}
            </Section>

            {boot.degradedSignals.length > 0 && (
              <Text style={styles.warn}>
                Degraded signals (using fallback): {boot.degradedSignals.join(', ')}
              </Text>
            )}

            <Text style={styles.footer}>
              Core experience runs offline. Cloud extends capability; it is never
              required.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatusPill({ status }: { status: 'ready' | 'limited' }) {
  const ready = status === 'ready';
  return (
    <View style={[styles.pill, { borderColor: ready ? ACCENT : AMBER }]}>
      <View
        style={[styles.dot, { backgroundColor: ready ? ACCENT : AMBER }]}
      />
      <Text style={[styles.pillText, { color: ready ? ACCENT : AMBER }]}>
        {ready ? 'Ready · offline-capable' : 'Limited · model or signal missing'}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v}</Text>
    </View>
  );
}

const yn = (b: boolean) => (b ? 'yes' : 'no');
const formatGb = (bytes: number) =>
  bytes > 0 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : 'unknown';

const ACCENT = '#2FBF77';
const AMBER = '#FFB612';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0D12' },
  body: { padding: 24, paddingTop: 64 },
  brand: { color: '#fff', fontSize: 40, fontWeight: '700' },
  tagline: { color: '#969BA4', fontSize: 15, marginTop: 4, marginBottom: 20 },
  center: { alignItems: 'center', marginTop: 60, gap: 12 },
  muted: { color: '#6B7079', fontSize: 13 },
  warn: { color: AMBER, fontSize: 13, marginTop: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: '600' },
  section: { marginTop: 20 },
  sectionTitle: {
    color: '#6B7079',
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#11151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowKey: { color: '#969BA4', fontSize: 14 },
  rowVal: { color: '#EAECEF', fontSize: 14, fontWeight: '600' },
  footer: { color: '#474C54', fontSize: 12, marginTop: 24, lineHeight: 18 },
});
