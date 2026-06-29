package com.iterativ.sage.tts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread

/**
 * Android Piper TTS module.
 *
 * Pipeline: text → phonemes (espeak-ng) → phoneme ids → VITS ONNX inference
 * (ONNX Runtime) → 22.05 kHz mono PCM → AudioTrack playback. Fully offline.
 *
 * DEVICE-BOUND: requires onnxruntime-android, a bundled Piper voice
 * (`<voiceId>.onnx` + `.onnx.json`) and espeak-ng phoneme data. Cannot be
 * compiled/run in CI. The phonemizer is the heavy integration point (marked).
 */
class SageTtsModule : Module() {
  @Volatile private var cancelled = false
  private var track: AudioTrack? = null
  private var synthesizer: PiperSynthesizer? = null

  override fun definition() = ModuleDefinition {
    Name("SageTts")
    Events("onSpeakStart", "onSpeakDone")

    AsyncFunction("speak") { text: String, voiceId: String, promise: Promise ->
      cancelled = false
      thread {
        try {
          val synth = ensureSynthesizer(voiceId)
          val pcm = synth.synthesize(text) // FloatArray mono @ sampleRate
          if (cancelled) {
            promise.resolve(null)
            return@thread
          }
          play(pcm, synth.sampleRate)
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("E_TTS", e.message ?: "tts failure", e)
        }
      }
    }

    Function("stop") {
      cancelled = true
      track?.pause()
      track?.flush()
      track?.release()
      track = null
    }
  }

  private fun ensureSynthesizer(voiceId: String): PiperSynthesizer {
    val current = synthesizer
    if (current != null && current.voiceId == voiceId) return current
    val created = PiperSynthesizer(appContext.reactContext, voiceId)
    synthesizer = created
    return created
  }

  private fun play(pcm: FloatArray, sampleRate: Int) {
    val minBuf = AudioTrack.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_FLOAT,
    )
    val at = AudioTrack(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build(),
      AudioFormat.Builder()
        .setSampleRate(sampleRate)
        .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build(),
      maxOf(minBuf, pcm.size * 4),
      AudioTrack.MODE_STATIC,
      AudioManager.AUDIO_SESSION_ID_GENERATE,
    )
    track = at
    at.write(pcm, 0, pcm.size, AudioTrack.WRITE_BLOCKING)
    at.play()
    sendEvent("onSpeakStart", emptyMap<String, Any>())
    // MODE_STATIC plays the written buffer; poll head position for completion.
    while (!cancelled && at.playbackHeadPosition < pcm.size) {
      Thread.sleep(20)
    }
    sendEvent("onSpeakDone", emptyMap<String, Any>())
  }
}

/**
 * Piper VITS synthesizer (ONNX Runtime). Loads `<voiceId>.onnx` + config once.
 */
class PiperSynthesizer(context: android.content.Context?, val voiceId: String) {
  val sampleRate: Int = 22_050

  init {
    // Create OrtEnvironment + OrtSession from the bundled `<voiceId>.onnx`, and
    // read the sample rate from `<voiceId>.onnx.json`.
  }

  fun synthesize(text: String): FloatArray {
    // 1. Phonemize with espeak-ng (TODO: integrate piper-phonemize / espeak-ng).
    // 2. Map phonemes → ids per the voice config.
    // 3. Build ORT inputs: ids, lengths, scales [noise, length, noise_w].
    // 4. Run the VITS OrtSession; read the waveform output → FloatArray.
    // Placeholder returns silence until the phonemizer + ORT inference are linked.
    return FloatArray(0)
  }
}
