Pod::Spec.new do |s|
  s.name           = 'CollyAr'
  s.version        = '1.0.0'
  s.summary        = 'Hangs a COLLY artwork on a real surface with ARKit'
  s.description    = 'Hangs a COLLY artwork on a real surface with ARKit and saves the photo'
  s.license        = 'UNLICENSED'
  s.author         = 'COLLY'
  s.homepage       = 'https://colly.one'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
