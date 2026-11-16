// Synthetic test voices only (Track 02 privacy rule): Groq Orpheus TTS, never a real recording.
// Docs: https://console.groq.com/docs/text-to-speech/orpheus (read 2026-11-16).
const VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const MAX_CHARS = 200;

const [script, out, voice = "troy"] = process.argv.slice(2);
if (!script || !out) {
  console.error(`usage: tts <script.txt> <out.wav> [voice: ${VOICES.join("|")}]`);
  process.exit(2);
}
if (!VOICES.includes(voice)) {
  console.error(`unknown voice ${voice}; one of ${VOICES.join(", ")}`);
  process.exit(2);
}
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("GROQ_API_KEY is not set");
  process.exit(2);
}
const input = (await Bun.file(script).text()).trim();
if (input.length > MAX_CHARS) {
  console.error(`${script}: ${input.length} characters, Orpheus takes at most ${MAX_CHARS}`);
  process.exit(2);
}

const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "canopylabs/orpheus-v1-english",
    input,
    voice,
    response_format: "wav",
  }),
});
if (!res.ok) {
  console.error(`Groq TTS ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const bytes = new Uint8Array(await res.arrayBuffer());
await Bun.write(out, bytes);
// $22 per 1M characters (groq.com/pricing, 2026-11-16).
const usd = ((input.length * 22) / 1e6).toFixed(5);
console.log(`${out}: ${bytes.length} bytes, ${input.length} chars, ~$${usd}`);
