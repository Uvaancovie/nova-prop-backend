function nameFromPrompt(prompt = "") {
  const s = prompt.trim();
  if (!s) return "New conversation";
  const short = s.split(/\s+/).slice(0,6).join(" ");
  return short.replace(/[^\w\s-]/g,"").slice(0,48);
}

module.exports = { nameFromPrompt };
