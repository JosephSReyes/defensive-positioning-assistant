/* Defensive Positioning Assistant — UI
 * DOM manipulation, screen management, and render functions.
 * Depends on: storage.js, utils.js, game.js, recommendations.js
 */

function showScreen(idName){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById(idName).classList.add("active");
  // Import status messages are transient — they live only while the coach is on
  // the team screen. Clear them on every navigation so a stale message never
  // shows when leaving and returning to the page.
  ["rosterImportStatus","importStatus"].forEach(elId=>{
    const el = document.getElementById(elId);
    if(el) el.textContent = "";
  });
  render();
}
function focusNewTeam(){ document.getElementById("teamNameInput").focus(); }

function render(){
  renderTeams();
  if(document.getElementById("teamScreen").classList.contains("active")) renderTeamScreen();
  if(document.getElementById("gameScreen").classList.contains("active")) renderGame();
}
function renderTeams(){
  const list = document.getElementById("teamsList");
  if(!appData.teams.length){ list.innerHTML = '<div class="empty">No teams yet. Add an opposing team to start.</div>'; return; }
  list.innerHTML = appData.teams.map(t=>`
    <div class="team-item">
      <div><div class="team-name">${escapeHtml(t.name)}</div><div class="small">${t.players.length} player${t.players.length===1?"":"s"} saved</div></div>
      <button class="mini-btn primary" onclick="openTeam('${t.id}')">Open</button>
    </div>`).join("");
}

function renderTeamScreen(){
  const team = getCurrentTeam(); if(!team) return;
  document.getElementById("teamTitle").textContent = team.name;
  // Play-log import matches against the roster, so it stays disabled until at
  // least one player exists.
  const playLogBtn = document.getElementById("playLogImportBtn");
  if(playLogBtn) playLogBtn.disabled = !team.players.length;
  const list = document.getElementById("playersList");
  if(!team.players.length){
    list.innerHTML = '<div class="empty">No players yet. Add the roster above.</div>';
    return;
  }

  list.innerHTML = `
    <div class="lineup-move-hint">Double-tap a player card to move them to a different batting order spot. Tap Edit to fix name or number.</div>
    ${team.players.map((p,i)=>`
      <div class="player-item"
           data-player-id="${p.id}"
           onclick="handleLineupTap(event,'${p.id}')">
        <div class="lineup-order-badge">${i+1}</div>
        <div class="player-info">
          <div class="player-name">${p.number ? "#"+escapeHtml(p.number)+" " : ""}${escapeHtml(p.name)}</div>
          <div class="small">${p.currentEvents.length} current • ${p.previousEvents.length} previous</div>
        </div>
        <button class="mini-btn" onclick="openPlayerEdit('${p.id}')">Edit</button>
        <button class="mini-btn danger" onclick="deletePlayer('${p.id}')">Remove</button>
      </div>`).join("")}
  `;
}
function renderGame(){
  const team = getCurrentTeam(), player = getActivePlayer();
  if(!team || !player) return;
  document.getElementById("gameTeamTitle").textContent = team.name;
  document.getElementById("activePlayerName").textContent = `${player.number ? "#"+player.number+" " : ""}${player.name}`;
  document.getElementById("activePlayerMeta").textContent = `${appData.selectedPlayerIndex+1} of ${team.players.length}`;
  document.getElementById("currentModeBtn").classList.toggle("active", appData.mode === "current");
  document.getElementById("currentModeBtn").classList.add("current");
  document.getElementById("previousModeBtn").classList.toggle("active", appData.mode === "previous");
  document.getElementById("previousModeBtn").classList.add("previous");
  const hotCold = document.getElementById("hotColdIcon");
  const icon = hitterStatus(player);
  if(hotCold.textContent !== icon){
    hotCold.textContent = icon;
  }
  renderEvents(player);
  renderLast5(player);
  renderSmartFielding(player);
  renderPitchToggle();
  renderOutcomeModalPitch();
}
function hitterStatus(player){
  // Use CURRENT GAME at-bats only.
  // Ignore previous-game data, walks, and bunts so the icon reflects today's live trend.
  const liveAbs = (player.outcomes || [])
    .filter(o =>
      o.mode === "current" &&
      !["Walk","Bunt"].includes(o.outcome)
    )
    .slice(0, 2);

  if(liveAbs.length < 2) return "";

  const hotResults = ["Double","Triple","Home Run"];
  const coldResults = ["Strikeout","Groundout","Flyout"];

  if(liveAbs.every(o => hotResults.includes(o.outcome))) return "🔥";
  if(liveAbs.every(o => coldResults.includes(o.outcome))) return "🧊";

  return "";
}
function renderEvents(player){
  const field = document.getElementById("field");
  field.querySelectorAll(".hit,.hit-x").forEach(el=>el.remove());

  // Visual display:
  // Current Game = current red dots/outs only.
  // Previous Games = previous blue dots/outs only.
  // AI coaching still uses previous history inside renderSmartFielding.
  const visibleEvents = appData.mode === "current"
    ? player.currentEvents
    : player.previousEvents;

  visibleEvents.forEach(e=>{
    const el = document.createElement("div");

    if(e.isOut){
      el.className = "hit-x";
      el.style.opacity = appData.mode === "previous" ? ".55" : "1";
    }else{
      el.className = `hit ${appData.mode === "previous" ? "previous" : "current"}`;
    }

    el.style.left = e.x + "%";
    el.style.top = e.y + "%";
    field.appendChild(el);
  });
}
function renderLast5(player){
  const box = document.getElementById("last5");
  box.innerHTML = "";

  // Last 5 follows the Current/Previous game-mode toggle: the current game's
  // at-bats in Current mode, the most recent previous-game at-bats in Previous
  // mode (mirrors renderEvents, which already swaps the field markers by mode).
  const last = (player.outcomes || []).filter(o => o.mode === appData.mode).slice(0,5);

  for(let i=0;i<5;i++){
    const e = last[i];
    const div = document.createElement("div");
    div.className = "ab";
    if(!e){
      div.classList.add("empty");
      div.innerHTML = '<div class="ab-outcome">&ndash;</div>';
    }else{
     const outcome = escapeHtml(shortOutcome(e.outcome));
       const zone = e.type === "hit" ? escapeHtml(zoneLabel(e)) : "";
       let marker = "";
       if(e.isOut) marker = '<div class="xo">X</div>';
       else if(e.type === "hit") marker = '<span class="rdot"></span>';
    div.innerHTML = `
          <div class="ab-outcome">${outcome}</div>
          <div class="ab-details">${zone ? `<span class="ab-zone">${zone}</span>` : ""}${e.pitch ? `<span class="ab-pitch">${escapeHtml(e.pitch)}</span>` : ""}</div>
          ${marker}
        `;
    }
    box.appendChild(div);
  }

  // Stats track the active mode too. Walk/Bunt are excluded from the at-bat
  // count in both modes (see DECISIONS.md #9); the inactive label is blanked so
  // the row never shows both Current and Previous at once.
  const abs = player.outcomes.filter(o=>o.mode===appData.mode && o.outcome!=="Walk" && o.outcome!=="Bunt");
  const hits = abs.filter(o=>o.type==="hit" && !o.isOut).length;
  const outs = player.outcomes.filter(o=>o.mode===appData.mode && o.isOut).length;

  if(appData.mode === "previous"){
    document.getElementById("previousStats").textContent = `Previous: ${hits} for ${abs.length}`;
    document.getElementById("currentStats").textContent = "";
  }else{
    document.getElementById("currentStats").textContent = `Current: ${hits} for ${abs.length}`;
    document.getElementById("previousStats").textContent = "";
  }
  document.getElementById("outStats").textContent = `Outs: ${outs}`;
}

function rotateVerse(){
  const verses = ["Colossians 3:23","Proverbs 22:29","Proverbs 24:16","2 Corinthians 12:9","1 Corinthians 9:25","Hebrews 12:11","Ecclesiastes 4:9","1 Corinthians 12:12","Joshua 1:9","Philippians 4:13","Hebrews 12:1","2 Timothy 1:7"];
  let index = parseInt(localStorage.getItem("dpaVerseIndex")); if(isNaN(index)) index = 0;
  document.getElementById("verseDisplay").textContent = verses[index];
  localStorage.setItem("dpaVerseIndex", (index+1)%verses.length);
}
