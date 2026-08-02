/* Defensive Positioning Assistant — Roster Import
 * Text-paste and image/file roster import helpers.
 * Depends on: storage.js, utils.js, game.js, ui.js
 */

function openImportRoster(){ document.getElementById("rosterTextInput").value=""; document.getElementById("importModal").classList.add("active"); }
function closeImportRoster(){ document.getElementById("importModal").classList.remove("active"); }

function cleanRosterText(text){
  return String(text || "")
    .replace(/[|•·]/g, " ")
    .replace(/\t/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line
      .replace(/\b(roster|lineup|batting|order|player|players|team|coach|manager|jersey|number|pos|position)\b/gi, "")
      .replace(/\b(P|C|1B|2B|3B|SS|LF|CF|RF|OF|DH|EH|UTIL|SUB)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
    )
    .filter(line => {
      if(!line) return false;
      if(/^[^a-zA-Z]*$/.test(line)) return false;
      if(line.length < 2) return false;
      return true;
    })
    .join("\n");
}

function parseRosterText(text){
  const seen = new Set();

  return String(text || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      line = line
        .replace(/,/g," ")
        .replace(/[^\w\s#.'-]/g," ")
        .replace(/\s+/g," ")
        .trim();

      const numberMatch = line.match(/^#?\s*(\d{1,3})\b/);
      const number = numberMatch ? numberMatch[1] : "";

      let name = numberMatch ? line.replace(/^#?\s*\d{1,3}\s*/, "") : line;

      name = name
        .replace(/\b(P|C|1B|2B|3B|SS|LF|CF|RF|OF|DH|EH|UTIL|SUB)\b/gi,"")
        .replace(/\b(roster|lineup|player|players|team|coach|jersey|number|pos|position)\b/gi,"")
        .replace(/\s+/g," ")
        .trim();

      const parts = name.split(" ").filter(Boolean);
      if(parts.length > 2){
        name = parts.slice(0,2).join(" ");
      }

      return { number, name };
    })
    .filter(p => p.name && /[a-zA-Z]/.test(p.name))
    .filter(p => {
      const key = `${p.number}|${p.name.toLowerCase()}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function applyRosterImport(players){
  const team = getCurrentTeam(); if(!team) return;
  let added = 0;
  players.forEach(pl=>{
    const exists = team.players.some(p => (pl.number && p.number === pl.number) || p.name.toLowerCase() === pl.name.toLowerCase());
    if(!exists){
      team.players.push({ id:id(), number:pl.number, name:pl.name, currentEvents:[], previousEvents:[], outcomes:[] });
      added++;
    }
  });
  document.getElementById("rosterImportStatus").textContent = `Imported ${added} player${added===1?"":"s"}.`;
  closeImportRoster();
  save(); renderTeamScreen();
}
function importRosterText(){ applyRosterImport(parseRosterText(document.getElementById("rosterTextInput").value)); }
function readRosterFile(e){
  const file = e.target.files && e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => applyRosterImport(parseRosterText(reader.result));
  reader.readAsText(file);
  e.target.value = "";
}
// Scales the image to max 1600px on its longest side, boosts contrast,
// and returns a base64 JPEG string. Improves OCR accuracy for both
// handwritten cards and app screenshots before sending to OpenAI.
async function preprocessRosterImage(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      let w = img.width, h = img.height;
      if(Math.max(w, h) > MAX){
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.filter = "grayscale(1) contrast(1.4) brightness(1.05)";
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

async function imageRosterNotice(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;

  const status = document.getElementById("rosterImportStatus");
  const input = document.getElementById("rosterTextInput");

  const MAX_SIZE = 15 * 1024 * 1024; // raw file limit before preprocessing reduces it
  if(file.size > MAX_SIZE){
    status.textContent = "Image too large. Please use an image under 15 MB.";
    e.target.value = "";
    return;
  }

  status.textContent = "AI Import processing roster image...";

  let base64, mimeType;
  try{
    // Preprocess: scale + contrast boost for better handwriting recognition
    base64 = await preprocessRosterImage(file);
    mimeType = "image/jpeg";
  }catch{
    // Fallback: send original file without preprocessing
    try{
      base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      mimeType = file.type;
    }catch{
      status.textContent = "Could not read image file. Try again.";
      e.target.value = "";
      return;
    }
  }

  let result;
  try{
    const response = await fetch("/api/openai-roster-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, mimeType }),
    });
    result = await response.json();
    if(!response.ok) throw new Error(result.error || "Server error");
  }catch(err){
    console.error("Roster import error:", err);
    status.textContent = "AI Import failed: " + (err.message || "Unknown error") + ". Try pasting roster text instead.";
    e.target.value = "";
    return;
  }

  const players = result.players || [];

  if(!players.length){
    status.textContent = "AI Import could not find players. Try a clearer image or paste roster text.";
    e.target.value = "";
    return;
  }

  input.value = players.map(p => `${p.number ? p.number + " " : ""}${p.name}`).join("\n");
  status.textContent = `AI Import found ${players.length} player${players.length===1 ? "" : "s"}. Review, then tap Import Paste.`;
  document.getElementById("importModal").classList.add("active");

  e.target.value = "";
}
