import AVFoundation
import ExpoModulesCore

/**
 * iOS Piper TTS module.
 *
 * Pipeline: text → phonemes (espeak-ng) → phoneme ids → VITS ONNX inference
 * (ONNX Runtime) → 22.05 kHz mono PCM → AVAudioEngine playback. Fully offline.
 *
 * DEVICE-BOUND: requires the onnxruntime-objc pod, a bundled Piper voice
 * (`<voiceId>.onnx` + `.onnx.json`), and the espeak-ng phoneme data. Cannot be
 * compiled/run in CI. The phonemizer is the one heavy integration point and is
 * marked below.
 */
public class SageTtsModule: Module {
  private let engine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  private var synthesizer: PiperSynthesizer?
  private var cancelled = false

  public func definition() -> ModuleDefinition {
    Name("SageTts")
    Events("onSpeakStart", "onSpeakDone")

    OnCreate {
      self.engine.attach(self.playerNode)
    }

    AsyncFunction("speak") { (text: String, voiceId: String, promise: Promise) in
      self.cancelled = false
      do {
        let synth = try self.ensureSynthesizer(voiceId: voiceId)
        let pcm = try synth.synthesize(text: text)
        if self.cancelled {
          promise.resolve(nil)
          return
        }
        try self.play(
          pcm: pcm,
          sampleRate: synth.sampleRate,
          onStart: { self.sendEvent("onSpeakStart", [:]) },
          onDone: {
            self.sendEvent("onSpeakDone", [:])
            promise.resolve(nil)
          }
        )
      } catch {
        promise.reject("E_TTS", error.localizedDescription)
      }
    }

    Function("stop") {
      self.cancelled = true
      self.playerNode.stop()
      self.engine.stop()
    }
  }

  private func ensureSynthesizer(voiceId: String) throws -> PiperSynthesizer {
    if let s = synthesizer, s.voiceId == voiceId { return s }
    let s = try PiperSynthesizer(voiceId: voiceId)
    synthesizer = s
    return s
  }

  private func play(
    pcm: [Float],
    sampleRate: Double,
    onStart: @escaping () -> Void,
    onDone: @escaping () -> Void
  ) throws {
    guard
      let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: sampleRate,
        channels: 1,
        interleaved: false
      ),
      let buffer = AVAudioPCMBuffer(
        pcmFormat: format,
        frameCapacity: AVAudioFrameCount(max(pcm.count, 1))
      )
    else { throw NSError(domain: "SageTts", code: 1) }

    buffer.frameLength = AVAudioFrameCount(pcm.count)
    if let channel = buffer.floatChannelData?[0] {
      pcm.withUnsafeBufferPointer { src in
        channel.update(from: src.baseAddress!, count: pcm.count)
      }
    }

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    try session.setActive(true)

    engine.connect(playerNode, to: engine.mainMixerNode, format: format)
    if !engine.isRunning { try engine.start() }

    playerNode.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { _ in
      DispatchQueue.main.async { onDone() }
    }
    playerNode.play()
    onStart()
  }
}

/**
 * Piper VITS synthesizer (ONNX Runtime). The ONNX session and voice metadata
 * load once and are reused. `synthesize` returns mono Float32 PCM.
 */
final class PiperSynthesizer {
  let voiceId: String
  let sampleRate: Double

  init(voiceId: String) throws {
    self.voiceId = voiceId
    // Load `<voiceId>.onnx` + `<voiceId>.onnx.json` from the app bundle, create
    // an ORTSession, and read the sample rate from the voice config.
    // (ORTEnv / ORTSession setup with onnxruntime-objc goes here.)
    self.sampleRate = 22_050
  }

  func synthesize(text: String) throws -> [Float] {
    // 1. Phonemize with espeak-ng (TODO: integrate piper-phonemize / espeak-ng).
    // 2. Map phonemes → ids per the voice config.
    // 3. Build ORT inputs: input ids, input_lengths, scales [noise, length, noise_w].
    // 4. Run the VITS ORTSession; read the waveform output tensor → [Float].
    // Returns mono PCM at `sampleRate`. Placeholder returns silence until the
    // phonemizer + ORT inference are linked on-device.
    return []
  }
}
