Pod::Spec.new do |s|
  s.name           = 'SageOs'
  s.version        = '0.1.0'
  s.summary        = 'SAGE native OS bridge: Contacts, Calendar, Reminders, sandboxed Files.'
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
