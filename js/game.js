/* Defensive Positioning Assistant — Game Logic
 * Game state management: teams, players, hit recording, game flow.
 * Depends on: storage.js, utils.js
 */

let pendingHit = null;
let lastTap = 0, lastX = 0, lastY = 0;
let editingPlayerId = null;
let lineupLastTap = { playerId:null, time:0 };
let pendingPitch = null;
let pitchCaptureCallback = null;

function getCurrentTeam(){ return appData.teams.find(t=>t.id===appData.selectedTeamId) || null; }
function getActivePlayer(){
  const team = getCurrentTeam();
  if(!team || !team.players.length) return null;
  if(appData.selectedPlayerIndex >= team.players.length) appData.selectedPlayerIndex = 0;
  return team.players[appData.selectedPlayerIndex];
}

function addTeam(){
  const input = document.getElementById("teamNameInput");
  const name = input.value.trim();
  if(!name) return;
  const team = { id:id(), name, players:[] };
  appData.teams.unshift(team);
  appData.selectedTeamId = team.id;
  input.value = "";
  save();
  showScreen("teamScreen");
}
function openTeam(teamId){ appData.selectedTeamId = teamId; appData.selectedPlayerIndex = 0; save(); showScreen("teamScreen"); }
function deleteCurrentTeam(){
  const team = getCurrentTeam(); if(!team) return;
  if(!confirm("Delete this team?")) return;
  appData.teams = appData.teams.filter(t=>t.id!==team.id);
  appData.selectedTeamId = appData.teams[0]?.id || null;
  appData.selectedPlayerIndex = 0;
  save(); showScreen("homeScreen");
}
function addPlayer(){
  const team = getCurrentTeam(); if(!team) return;
  const number = document.getElementById("playerNumberInput").value.trim();
  const name = document.getElementById("playerNameInput").value.trim();
  if(!name) return;
  team.players.push({ id:id(), number, name, currentEvents:[], previousEvents:[], outcomes:[] });
  document.getElementById("playerNumberInput").value = "";
  document.getElementById("playerNameInput").value = "";
  save(); renderTeamScreen();
}
function deletePlayer(playerId){
  const team = getCurrentTeam(); if(!team) return;
  team.players = team.players.filter(p=>p.id!==playerId);
  appData.selectedPlayerIndex = Math.max(0, Math.min(appData.selectedPlayerIndex, team.players.length-1));
  save(); renderTeamScreen();
}
function startGame(){
  const team = getCurrentTeam();
  if(!team || !team.players.length) return alert("Add at least one player first.");
  appData.selectedPlayerIndex = 0;
  appData.mode = "current";
  save(); showScreen("gameScreen");
}
function prevPlayer(){
  const team = getCurrentTeam(); if(!team || !team.players.length) return;
  appData.selectedPlayerIndex = (appData.selectedPlayerIndex - 1 + team.players.length) % team.players.length;
  save(); renderGame();
}
function nextPlayer(){
  const team = getCurrentTeam(); if(!team || !team.players.length) return;
  appData.selectedPlayerIndex = (appData.selectedPlayerIndex + 1) % team.players.length;
  save(); renderGame();
}
function setMode(mode){ appData.mode = mode; save(); renderGame(); }

function setupDoubleTap(){
  const field = document.getElementById("field");
  field.addEventListener("touchstart", e=>e.preventDefault(), {passive:false});
  field.addEventListener("touchmove", e=>e.preventDefault(), {passive:false});
  field.addEventListener("touchend", function(e){
    e.preventDefault();
    const t = e.changedTouches[0]; if(!t) return;
    const now = Date.now();
    const distance = Math.hypot(t.clientX-lastX, t.clientY-lastY);
    if(now-lastTap < 420 && distance < 60){
      recordHitFromPoint(t.clientX, t.clientY);
      lastTap = 0;
      return;
    }
    lastTap = now; lastX = t.clientX; lastY = t.clientY;
  }, {passive:false});
  field.addEventListener("dblclick", function(e){ e.preventDefault(); recordHitFromPoint(e.clientX,e.clientY); });
  document.addEventListener("gesturestart", e=>e.preventDefault(), {passive:false});
  document.addEventListener("gesturechange", e=>e.preventDefault(), {passive:false});
}
function recordHitFromPoint(clientX, clientY){
  const player = getActivePlayer();
  if(!player) return alert("Add a player first.");
  const field = document.getElementById("field");
  const rect = field.getBoundingClientRect();
  pendingHit = {
    x: Math.max(0, Math.min(100, ((clientX-rect.left)/rect.width)*100)),
    y: Math.max(0, Math.min(100, ((clientY-rect.top)/rect.height)*100)),
    time: Date.now()
  };
  if(appData.mode === "previous"){
    saveHit("Previous hit", false);
  }else{
    document.getElementById("outcomeModal").classList.add("active");
  }
}
function saveHit(outcome, isOut){
  const player = getActivePlayer(); if(!player || !pendingHit) return;
  const event = { ...pendingHit, outcome, isOut: !!isOut, mode: appData.mode, type:"hit" };
  if(appData.mode === "previous") player.previousEvents.unshift(event);
  else player.currentEvents.unshift(event);
  player.outcomes.unshift({ ...event });
  player.outcomes = player.outcomes.slice(0, 50);
  pendingHit = null;
  document.getElementById("outcomeModal").classList.remove("active");
  save(); renderGame();
}
function cancelHit(){ pendingPitch = null; pendingHit = null; clearPitchSelection(); document.getElementById("outcomeModal").classList.remove("active"); }
function recordOutcome(type){
  const player = getActivePlayer(); if(!player) return alert("Add a player first.");
  player.outcomes.unshift({ outcome:type, type:"noBall", mode:"current", time:Date.now(), isOut:type==="Strikeout" });
  player.outcomes = player.outcomes.slice(0,50);
  save(); renderGame();
}
function undoLast(){
  const player = getActivePlayer(); if(!player || !player.outcomes.length) return;
  // Undo only ever affects the current game — previous-game data must never be
  // removed by Undo. Find the most recent current-mode outcome (outcomes are
  // newest-first), remove it, and pop its current hit marker if it had one.
  const idx = player.outcomes.findIndex(o => o.mode === "current");
  if(idx === -1) return;
  const last = player.outcomes.splice(idx, 1)[0];
  if(last.type === "hit") player.currentEvents.shift();
  save(); renderGame();
}
function endGame(){
  const team = getCurrentTeam();
  if(!team) return;
  openEndGameModal();
}

function openEndGameModal(){
  const modal = document.getElementById("endGameModal");
  const backdrop = document.getElementById("endGameBackdrop");
  if(!modal) return;
  // Constrain modal to field-wrap width so it visually matches the AI Coach popup.
  const fieldWrap = document.querySelector("#gameScreen .field-wrap");
  if(fieldWrap){
    const rect = fieldWrap.getBoundingClientRect();
    modal.style.left = (rect.left + 8) + "px";
    modal.style.width = (rect.width - 16) + "px";
    modal.style.right = "auto";
  }
  if(backdrop) backdrop.classList.add("active");
  modal.classList.add("active");
}

function closeEndGameModal(){
  const modal = document.getElementById("endGameModal");
  const backdrop = document.getElementById("endGameBackdrop");
  if(modal){
    modal.classList.remove("active");
    modal.style.left = "";
    modal.style.width = "";
    modal.style.right = "";
  }
  if(backdrop) backdrop.classList.remove("active");
}

function confirmEndGame(){
  const team = getCurrentTeam();
  if(!team){ closeEndGameModal(); return; }

  team.players.forEach(p=>{
    p.previousEvents = [...p.currentEvents, ...p.previousEvents];
    p.outcomes = (p.outcomes || []).map(o=>{
      if(o.mode === "current"){
        return {...o, mode:"previous"};
      }
      return o;
    });
    p.currentEvents = [];
  });

  appData.mode = "current";
  save();
  renderGame();
  closeEndGameModal();
}

function openPlayerEdit(playerId){
  const team = getCurrentTeam();
  if(!team) return;

  const player = team.players.find(p => p.id === playerId);
  if(!player) return;

  const newNumber = prompt("Edit jersey number:", player.number || "");
  if(newNumber === null) return;

  const newName = prompt("Edit player name:", player.name || "");
  if(newName === null) return;

  const cleanName = newName.trim();
  if(!cleanName){
    alert("Player name is required.");
    return;
  }

  let currentHand = String(player.bats || player.hand || "RH").toUpperCase();
  if(!["RH","LH","SH"].includes(currentHand)) currentHand = "RH";

  let newHand = prompt("Handedness: RH, LH, or SH", currentHand);
  if(newHand === null) newHand = currentHand;

  newHand = String(newHand || "RH").trim().toUpperCase();
  if(!["RH","LH","SH"].includes(newHand)){
    alert("Invalid handedness. Saved as RH.");
    newHand = "RH";
  }

  player.number = newNumber.trim();
  player.name = cleanName;
  player.bats = newHand;
  player.hand = newHand;

  save();
  renderTeamScreen();
  if(typeof renderGame === "function") renderGame();
}


function closePlayerEdit(){}
function savePlayerEdit(){}

function handleLineupTap(e, playerId){
  const target = e.target;
  if(target && target.closest("button")) return;

  const now = Date.now();
  const isDoubleTap = lineupLastTap.playerId === playerId && (now - lineupLastTap.time) < 450;

  lineupLastTap = { playerId, time:now };

  if(isDoubleTap){
    movePlayerToLineupSpot(playerId);
  }
}

function movePlayerToLineupSpot(playerId){
  const team = getCurrentTeam();
  if(!team || !team.players || team.players.length < 2) return;

  const currentIndex = team.players.findIndex(p => p.id === playerId);
  if(currentIndex < 0) return;

  const player = team.players[currentIndex];
  const max = team.players.length;

  const answer = prompt(
    `Move ${player.number ? "#" + player.number + " " : ""}${player.name} to what batting order spot?\\nEnter 1-${max}:`,
    String(currentIndex + 1)
  );

  if(answer === null) return;

  const requested = parseInt(answer, 10);
  if(!Number.isFinite(requested) || requested < 1 || requested > max){
    alert(`Enter a lineup spot from 1 to ${max}.`);
    return;
  }

  const newIndex = requested - 1;
  if(newIndex === currentIndex) return;

  const [moved] = team.players.splice(currentIndex, 1);
  team.players.splice(newIndex, 0, moved);

  if(appData.selectedPlayerIndex === currentIndex){
    appData.selectedPlayerIndex = newIndex;
  }else if(currentIndex < appData.selectedPlayerIndex && newIndex >= appData.selectedPlayerIndex){
    appData.selectedPlayerIndex -= 1;
  }else if(currentIndex > appData.selectedPlayerIndex && newIndex <= appData.selectedPlayerIndex){
    appData.selectedPlayerIndex += 1;
  }

  save();
  renderTeamScreen();

  setTimeout(()=>{
    const el = document.querySelector(`#playersList .player-item[data-player-id="${playerId}"]`);
    if(el){
      el.classList.add("move-flash");
      setTimeout(()=>el.classList.remove("move-flash"), 600);
    }
  }, 50);
}

/* Pitch tracking toggle + capture */
function togglePitchTrack(){
  appData.trackPitch = !appData.trackPitch;
  save();
  renderPitchToggle();
  renderOutcomeModalPitch();
}
function renderPitchToggle(){
  const btn = document.getElementById("pitchTrackBtn");
  if(!btn) return;
  btn.textContent = appData.trackPitch ? "Pitch: ON" : "Pitch: OFF";
  btn.classList.toggle("active", !!appData.trackPitch);
}
function renderOutcomeModalPitch(){
  const row = document.getElementById("pitchPickRow");
  if(!row) return;
  row.style.display = appData.trackPitch ? "grid" : "none";
}
function selectPitch(type){
  pendingPitch = type;
  // If a capture callback is pending (the strikeout/walk pitch modal is open),
  // confirm with the pitch still set — the callback reads pendingPitch, stores it
  // on the outcome, then clears it. Do NOT clear here or the pitch is lost.
  if(pitchCaptureCallback){
    pitchCaptureCallback();
    return;
  }
  // Otherwise just highlight the selection (outcome modal row)
  document.querySelectorAll('#pitchPickRow button[data-pitch]').forEach(function(b){
    b.classList.toggle('selected', b.getAttribute('data-pitch') === type);
  });
}
function clearPitchSelection(){
  pendingPitch = null;
  document.querySelectorAll('#pitchPickRow button[data-pitch]').forEach(function(b){
    b.classList.remove('selected');
  });
}

// Override saveHit to include pitch
var _origSaveHit = saveHit;
saveHit = function(outcome, isOut){
  const player = getActivePlayer();
  if(!player || !pendingHit) return;
  const event = { ...pendingHit, outcome, isOut: !!isOut, mode: appData.mode, type:"hit" };
  if(pendingPitch) event.pitch = pendingPitch;
  if(appData.mode === "previous") player.previousEvents.unshift(event);
  else player.currentEvents.unshift(event);
  player.outcomes.unshift({ ...event });
  player.outcomes = player.outcomes.slice(0, 50);
  pendingHit = null;
  clearPitchSelection();
  document.getElementById("outcomeModal").classList.remove("active");
  save();
  renderGame();
};

// Override recordOutcome to prompt for pitch when tracking is on
var _origRecordOutcome = recordOutcome;
recordOutcome = function(type){
  const player = getActivePlayer();
  if(!player) return alert("Add a player first.");
  if(appData.trackPitch && type === 'Strikeout'){
    // Show the pitch modal for strikeouts only: "what pitch beat this hitter" is a
    // real batter tendency. A walk isn't caused by a single pitch (it's four balls),
    // and walk/bunt pitch data drifts into pitcher analysis, which is out of scope.
    pendingPitch = null;
    pitchCaptureCallback = function(){
      player.outcomes.unshift({ outcome:type, type:"noBall", mode:"current", time:Date.now(), isOut:type==="Strikeout" });
      if(pendingPitch) player.outcomes[0].pitch = pendingPitch;
      player.outcomes = player.outcomes.slice(0,50);
      pendingPitch = null;
      pitchCaptureCallback = null;
      clearPitchSelection();
      document.getElementById("pitchModal").classList.remove("active");
      save();
      renderGame();
    };
    document.getElementById("pitchModal").classList.add("active");
  } else {
    // Walks, bunts, or pitch tracking off — record directly (no pitch prompt)
    player.outcomes.unshift({ outcome:type, type:"noBall", mode:"current", time:Date.now(), isOut:type==="Strikeout" });
    if(pendingPitch && type === 'Bunt'){
      player.outcomes[0].pitch = pendingPitch;
      pendingPitch = null;
    }
    player.outcomes = player.outcomes.slice(0,50);
    clearPitchSelection();
    save();
    renderGame();
  }
};
function skipPitch(){
  if(pitchCaptureCallback){
    pendingPitch = null;
    clearPitchSelection();
    pitchCaptureCallback();
  } else {
    document.getElementById("pitchModal").classList.remove("active");
  }
}
