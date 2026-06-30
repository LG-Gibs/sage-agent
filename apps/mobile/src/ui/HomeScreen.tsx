import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SageSignals, CapabilityManifest } from '@sage/shared-types';
import type { FeatureFlags } from '@sage/core';
import { COLORS, ui } from './theme';

interface Props {
  manifest: CapabilityManifest;
  signals: SageSignals;
  flags: FeatureFlags;
  onOpenVoice: () => void;
  onRequestMic: () => void;
}

export function HomeScreen({ manifest, signals, flags, onOpenVoice, onRequestMic }: Props) {
  const ready = manifest.ready;
  return (
    <ScrollView contentContainerStyle={ui.body}>
      <Text style={ui.brand}>Sage</Text>
      <Text style={ui.tagline}>The device is the agent.</Text>

      <View style={[ui.pill, { borderColor: ready ? COLORS.accent : COLORS.amber }]}>
        <View style={[ui.dot, { backgroundColor: ready ? COLORS.accent : COLORS.amber }]} />
        <Text style={{ color: ready ? COLORS.accent : COLORS.amber, fontWeight: '600', fontSize: 13 }}>
          {ready ? 'Ready · offline-capable' : 'Limited · model or signal missing'}
        </Text>
      </View>

      <Text style={ui.sectionTitle}>Capabilities</Text>
      <FeatureTile
        title="Voice"
        subtitle={flags.voice ? 'Wake word, speech, and replies — on-device' : flags.reasons.voice ?? 'Unavailable'}
        enabled={flags.voice}
        onPress={onOpenVoice}
        action={!flags.voice && flags.reasons.voice?.match(/permission/i) ? { label: 'Grant mic', onPress: onRequestMic } : undefined}
      />
      <FeatureTile
        title="Local inference"
        subtitle={flags.localInference ? 'Gemma 4 running via llama.cpp' : flags.reasons.localInference ?? 'Unavailable'}
        enabled={flags.localInference}
      />
      <FeatureTile
        title="Gemma 4 9B"
        subtitle={flags.model9B ? 'High-capability local model available' : flags.reasons.model9B ?? 'Unavailable'}
        enabled={flags.model9B}
      />
      <FeatureTile title="Code sandbox" subtitle="QuickJS / E2B — arrives in Phase 4" enabled={false} />
      <FeatureTile title="Local memory" subtitle="sqlite-vec RAG — arrives in Phase 5" enabled={false} />

      <Text style={ui.sectionTitle}>Capability Manifest</Text>
      <View style={ui.card}>
        <Row k="Platform" v={manifest.platform} />
        <Row k="OS version" v={manifest.osVersion} />
        <Row k="RAM" v={formatGb(manifest.totalRamBytes)} />
        <Row k="GPU backend" v={manifest.gpu} />
        <Row k="ML accelerator" v={manifest.mlAccelerator} />
        <Row k="NPU present" v={yn(manifest.npuPresent)} />
        <Row k="Verified models" v={String(manifest.installedModels.filter((m) => m.verified).length)} />
      </View>

      <Text style={ui.sectionTitle}>SageRouter Signals</Text>
      <View style={ui.card}>
        <Row k="Network" v={signals.network} />
        <Row k="Power" v={signals.power} />
        <Row k="Complexity" v={signals.complexity} />
        <Row k="Privacy" v={signals.privacy} />
        <Row k="Preference" v={signals.preference} />
      </View>
    </ScrollView>
  );
}

function FeatureTile({
  title,
  subtitle,
  enabled,
  onPress,
  action,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  onPress?: () => void;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Pressable
      style={[styles.tile, !enabled && styles.tileDisabled]}
      onPress={enabled ? onPress : undefined}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.tileTitle, !enabled && { color: COLORS.muted }]}>{title}</Text>
        <Text style={styles.tileSub}>{subtitle}</Text>
      </View>
      {action ? (
        <Pressable style={styles.tileAction} onPress={action.onPress}>
          <Text style={styles.tileActionText}>{action.label}</Text>
        </Pressable>
      ) : (
        <View style={[ui.dot, { backgroundColor: enabled ? COLORS.accent : COLORS.faint }]} />
      )}
    </Pressable>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={ui.row}>
      <Text style={ui.rowKey}>{k}</Text>
      <Text style={ui.rowVal}>{v}</Text>
    </View>
  );
}

const yn = (b: boolean) => (b ? 'yes' : 'no');
const formatGb = (bytes: number) => (bytes > 0 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : 'unknown');

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 15,
    marginTop: 10,
  },
  tileDisabled: { opacity: 0.55 },
  tileTitle: { color: COLORS.head, fontSize: 15, fontWeight: '600' },
  tileSub: { color: COLORS.dim, fontSize: 12.5, marginTop: 3 },
  tileAction: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tileActionText: { color: '#04140C', fontWeight: '700', fontSize: 12.5 },
});
