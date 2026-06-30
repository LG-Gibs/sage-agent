import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CapabilityManifest } from '@sage/shared-types';
import type { FeatureFlags } from '@sage/core';
import type { CycleLatency, VoicePipeline, VoiceState } from '@sage/voice-core';
import { createVoicePipeline } from '../voice/createVoicePipeline';
import { COLORS, ui } from './theme';

interface Props {
  manifest: CapabilityManifest;
  flags: FeatureFlags;
  onBack: () => void;
}

const STATE_LABEL: Record<VoiceState, string> = {
  idle: 'Idle',
  wake_listening: 'Listening for "Hey Sage"',
  capturing: 'Listening…',
  transcribing: 'Transcribing…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Error',
};

export function VoiceScreen({ manifest, flags, onBack }: Props) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [latency, setLatency] = useState<CycleLatency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pipelineRef = useRef<VoicePipeline | null>(null);

  useEffect(() => {
    if (!flags.voice) return;
    const pipeline = createVoicePipeline(manifest, {
      onState: (s) => setState(s),
      onPartialTranscript: (t) => setTranscript(t),
      onFinalTranscript: (t) => setTranscript(t),
      onResponseToken: (tok) => setResponse((prev) => prev + tok),
      onLatency: (l) => setLatency(l),
      onError: (e) => setError(e.error.message),
    });
    pipelineRef.current = pipeline;
    if (pipeline && flags.wakeWord) void pipeline.arm();
    return () => {
      void pipeline?.disarm();
      pipelineRef.current = null;
    };
  }, [manifest, flags]);

  if (!flags.voice) {
    return (
      <ScrollView contentContainerStyle={ui.body}>
        <Text style={ui.brand}>Voice</Text>
        <Text style={styles.disabled}>{flags.reasons.voice ?? 'Voice is unavailable on this device.'}</Text>
        <Pressable style={styles.secondary} onPress={onBack}>
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const speaking = state === 'speaking' || state === 'thinking' || state === 'capturing' || state === 'transcribing';
  const startTurn = () => {
    setTranscript('');
    setResponse('');
    setError(null);
    void pipelineRef.current?.pushToTalk();
  };

  return (
    <ScrollView contentContainerStyle={ui.body}>
      <Text style={ui.brand}>Voice</Text>
      <Text style={ui.tagline}>
        Wake word → Whisper.cpp → Gemma 4 → Piper, entirely on-device.
      </Text>

      <View style={[ui.pill, { borderColor: COLORS.accent, marginTop: 8 }]}>
        <View style={[ui.dot, { backgroundColor: COLORS.accent }]} />
        <Text style={{ color: COLORS.accent, fontWeight: '600', fontSize: 13 }}>
          {STATE_LABEL[state]}
        </Text>
      </View>

      <Text style={ui.sectionTitle}>You said</Text>
      <View style={ui.card}>
        <Text style={styles.transcript}>{transcript || '—'}</Text>
      </View>

      <Text style={ui.sectionTitle}>Sage</Text>
      <View style={ui.card}>
        <Text style={styles.response}>{response || '—'}</Text>
      </View>

      {latency && (
        <>
          <Text style={ui.sectionTitle}>Latency</Text>
          <View style={ui.card}>
            <Row k="STT (compute)" v={ms(latency.sttMs)} />
            <Row k="Think (first token)" v={ms(latency.thinkMs)} />
            <Row k="TTS start" v={ms(latency.ttsStartMs)} />
            <Row
              k="Voice I/O within 500ms"
              v={latency.withinTarget ? 'yes' : 'no'}
            />
          </View>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.talk, speaking && { backgroundColor: COLORS.red }]}
        onPress={speaking ? () => pipelineRef.current?.cancel() : startTurn}
      >
        <Text style={styles.talkText}>{speaking ? 'Stop' : 'Push to talk'}</Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={onBack}>
        <Text style={styles.secondaryText}>Back</Text>
      </Pressable>
    </ScrollView>
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

const ms = (n?: number) => (n === undefined ? '—' : `${Math.round(n)} ms`);

const styles = StyleSheet.create({
  transcript: { color: COLORS.text, fontSize: 15, paddingVertical: 14 },
  response: { color: COLORS.text, fontSize: 15, paddingVertical: 14, lineHeight: 21 },
  error: { color: COLORS.red, fontSize: 13, marginTop: 14 },
  disabled: { color: COLORS.amber, fontSize: 14, marginTop: 16, lineHeight: 20 },
  talk: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 24,
  },
  talkText: { color: '#04140C', fontWeight: '700', fontSize: 16 },
  secondary: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  secondaryText: { color: COLORS.muted, fontWeight: '600', fontSize: 14 },
});
