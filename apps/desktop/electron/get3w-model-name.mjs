/** Display labels only: the original model ID remains the transport key. */
export function get3wModelName(id) {
  const name = id.split("/").at(-1);
  if (name === "get3w-auto") return "Auto";
  const words = name.replace(/[_-]+/g, " ").trim().split(/\s+/);
  const labels = { gpt: "GPT", gemini: "Gemini", claude: "Claude", lite: "Lite", preview: "Preview", flash: "Flash", pro: "Pro", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", fable: "Fable" };
  return words.map(word => labels[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
