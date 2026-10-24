<#
  Generates spoken interview-question fixtures (16 kHz mono 16-bit WAV) with
  Windows SAPI voices for the live-pipeline benchmark. Output: .bench/audio.
  Usage: powershell -File scripts/make-speech-fixtures.ps1
#>
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$outDir = Join-Path $PSScriptRoot "..\.bench\audio"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# id | voice | SSML body (breaks simulate real mid-question pauses)
$fixtures = @(
  @("short-decorator",  "Microsoft David Desktop", "What is a Python decorator?"),
  @("list-tuple",       "Microsoft Zira Desktop",  "What is the difference between a list and a tuple?"),
  @("selenium-stale",   "Microsoft Ravi",          "How would you handle stale element reference exceptions in Selenium WebDriver?"),
  @("rest-pause",       "Microsoft David Desktop", "When you design a REST API for a payments service, <break time='900ms'/> how do you handle idempotency and retries?"),
  @("long-pause-tail",  "Microsoft Heera",         "Can you explain the difference between <break time='1300ms'/> processes and threads?"),
  @("project",          "Microsoft Zira Desktop",  "Tell me about the project you worked on."),
  @("followup-why",     "Microsoft Zira Desktop",  "Why did you choose that?"),
  @("gc-java",          "Microsoft Ravi",          "How does garbage collection work in Java?"),
  @("react-render",     "Microsoft David Desktop", "Explain how React reconciliation works, and when do components re-render?"),
  @("spring-di",        "Microsoft Heera",         "What is dependency injection in Spring Boot?"),
  @("sql-slow",         "Microsoft Zira Desktop",  "How do you optimize a slow SQL query that joins two large tables?"),
  @("kubernetes",       "Microsoft Ravi",          "What are Kubernetes pods and deployments, <break time='600ms'/> and how do they relate?"),
  @("two-q-a",          "Microsoft David Desktop", "What is a REST API?"),
  @("two-q-b",          "Microsoft David Desktop", "And how is it different from GraphQL?"),
  @("ambiguous",        "Microsoft Heera",         "So what about the other one?")
)

$manifest = @()
foreach ($f in $fixtures) {
  $id, $voice, $body = $f
  $manifest += [ordered]@{ id = $id; voice = $voice; text = ($body -replace "<[^>]+>", "" -replace "\s+", " ").Trim() }
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try { $synth.SelectVoice($voice) } catch { $synth.SelectVoice("Microsoft David Desktop") }
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $path = Join-Path $outDir "$id.wav"
  $synth.SetOutputToWaveFile($path, $fmt)
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>$body</speak>"
  $synth.SpeakSsml($ssml)
  $synth.SetOutputToNull()
  $synth.Dispose()
  "{0,-18} {1,8:N0} bytes" -f $id, (Get-Item $path).Length
}
$manifest | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $outDir "manifest.json")
