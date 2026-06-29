Pod::Spec.new do |s|
  s.name           = 'SageCapability'
  s.version        = '0.1.0'
  s.summary        = 'SAGE on-device capability + thermal probe (Expo module).'
  s.description    = 'Reports RAM, OS version, Metal GPU backend, Core ML / ANE presence, thermal state, and verifies installed GGUF models.'
  s.author         = 'Iterativ'
  s.homepage       = 'https://iterativ.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '*.{h,m,mm,swift}'
end
