Pod::Spec.new do |s|
  s.name           = 'SageTts'
  s.version        = '0.1.0'
  s.summary        = 'On-device Piper (VITS ONNX) text-to-speech for SAGE.'
  s.description    = 'Offline neural TTS: phonemize -> VITS ONNX inference (ONNX Runtime) -> PCM -> AVAudioEngine playback.'
  s.author         = 'Iterativ'
  s.homepage       = 'https://iterativ.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'onnxruntime-objc'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '*.{h,m,mm,swift}'
end
