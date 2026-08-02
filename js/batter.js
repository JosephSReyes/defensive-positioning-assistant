/* Defensive Positioning Assistant — Batter Display
 * Compact batter display and default batter handedness patch.
 * Must load AFTER ui.js so renderGame is defined before patching.
 * Depends on: storage.js, game.js, ui.js
 */

(function(){
  function hasAppData(){
    return typeof appData !== "undefined" && appData != null;
  }

  function defaultBatterHandsOnly(){
    if(!hasAppData() || !Array.isArray(appData.teams)) return;

    appData.teams.forEach(team=>{
      if(!Array.isArray(team.players)) return;
      team.players.forEach(player=>{
        let hand = String(player.bats || player.hand || "RH").toUpperCase();
        if(!["RH","LH","SH"].includes(hand)) hand = "RH";
        player.bats = hand;
        player.hand = hand;
      });
    });

    if(typeof window.save === "function") window.save();
  }

  function activeTeam(){
    try{
      if(typeof getCurrentTeam === "function") return getCurrentTeam();
    }catch(e){}
    if(hasAppData() && Array.isArray(appData.teams)){
      return appData.teams[appData.currentTeamIndex || appData.selectedTeamIndex || 0] || null;
    }
    return null;
  }

  function activeIndex(team){
    if(!hasAppData()) return 0;
    const idx = appData.selectedPlayerIndex ?? appData.currentPlayerIndex ?? appData.batterIndex ?? 0;
    if(!team || !Array.isArray(team.players)) return 0;
    return Math.max(0, Math.min(team.players.length - 1, Number(idx) || 0));
  }

  function playerLabel(player, idx, total){
    if(!player){
      return {main:"No batter selected", hand:"", rosterSpot:""};
    }
    const name = player.name || player.playerName || "Unnamed Batter";
    const num = player.number || player.num || "";
    let hand = String(player.bats || player.hand || "RH").toUpperCase();
    if(!["RH","LH","SH"].includes(hand)) hand = "RH";
    const rosterSpot = total ? `Spot ${idx + 1}/${total}` : `Spot ${idx + 1}`;
    return {
      main: `${num ? "#" + num + " " : ""}${name}`,
      hand,
      rosterSpot
    };
  }

  function renderCompactBatter(){
    defaultBatterHandsOnly();

    const game = document.getElementById("gameScreen");
    if(!game) return;

    const team = activeTeam();
    const players = team && Array.isArray(team.players) ? team.players : [];
    const idx = activeIndex(team);
    const player = players[idx] || null;
    const label = playerLabel(player, idx, players.length);

    let compact = document.getElementById("dpaCompactBatter");
    if(!compact){
      compact = document.createElement("div");
      compact.id = "dpaCompactBatter";

      const field = game.querySelector(".field-wrap") || game.querySelector(".field") || document.getElementById("field");
      if(field && field.parentNode){
        field.parentNode.insertBefore(compact, field.nextSibling);
      }else{
        game.appendChild(compact);
      }
    }

    const handChip = label.hand
      ? `<span class="dpa-batter-chip dpa-hand dpa-hand-${label.hand.toLowerCase()}">${label.hand}</span>`
      : "";
    const spotChip = label.rosterSpot
      ? `<span class="dpa-batter-chip dpa-spot">${label.rosterSpot}</span>`
      : "";

    compact.innerHTML = `
      <button type="button" class="dpa-batter-nav prev" aria-label="Previous batter" onclick="prevPlayer()">
        <span class="dpa-batter-nav-arrow">&#8249;</span>
        <span class="dpa-batter-nav-label">Previous</span>
      </button>
      <div class="dpa-batter-info">
        <div class="dpa-batter-name">${label.main}</div>
        <div class="dpa-batter-chips">${handChip}${spotChip}</div>
      </div>
      <button type="button" class="dpa-batter-nav next" aria-label="Next batter" onclick="nextPlayer()">
        <span class="dpa-batter-nav-arrow">&#8250;</span>
        <span class="dpa-batter-nav-label">Next</span>
      </button>
    `;

    // Hide the old oversized batter blob only on Play Ball.
    const candidates = game.querySelectorAll(".batter-card,.current-batter-card,.batterBlob,.batter-blob,.hitter-card,.player-card");
    candidates.forEach(el=>{
      if(el.id === "dpaCompactBatter") return;
      const txt = (el.textContent || "").toLowerCase();
      if(txt.includes("batter") || txt.includes("hitter") || (player && txt.includes(String(player.name || "").toLowerCase()))){
        el.style.display = "none";
      }
    });
  }

  window.DefensivePositioningCompactBatter = {render: renderCompactBatter};

  window.addEventListener("load", function(){
    defaultBatterHandsOnly();
    setTimeout(renderCompactBatter, 100);
    setTimeout(renderCompactBatter, 700);
    setTimeout(renderCompactBatter, 1500);
  });

  const oldRenderGame = window.renderGame;
  if(typeof oldRenderGame === "function" && !oldRenderGame.__compactBatterHandWrapped){
    window.renderGame = function(){
      const r = oldRenderGame.apply(this, arguments);
      setTimeout(renderCompactBatter, 80);
      return r;
    };
    window.renderGame.__compactBatterHandWrapped = true;
  }

  const oldRenderTeam = window.renderTeamScreen;
  if(typeof oldRenderTeam === "function" && !oldRenderTeam.__defaultHandOnlyWrapped){
    window.renderTeamScreen = function(){
      const r = oldRenderTeam.apply(this, arguments);
      defaultBatterHandsOnly();
      return r;
    };
    window.renderTeamScreen.__defaultHandOnlyWrapped = true;
  }

  const oldAddPlayer = window.addPlayer;
  if(typeof oldAddPlayer === "function" && !oldAddPlayer.__defaultHandOnlyWrapped){
    window.addPlayer = function(){
      const r = oldAddPlayer.apply(this, arguments);
      defaultBatterHandsOnly();
      return r;
    };
    window.addPlayer.__defaultHandOnlyWrapped = true;
  }

  document.addEventListener("click", function(){
    setTimeout(renderCompactBatter, 80);
  }, true);

  // Touch-swipe navigation on the field: swipe left → next batter, swipe right → previous batter.
  // Matches the standard carousel convention so the on-field swipe direction tracks the lineup direction.
  // Pointer-based (not mouse) so it never interferes with desktop drag-to-select.
  function setupSwipeNavigation(){
    const field = document.querySelector("#gameScreen .field-wrap");
    if(!field || field.dataset.swipeBound === "1") return;
    field.dataset.swipeBound = "1";

    const SWIPE_MIN_X = 50;       // px horizontal movement to count as a swipe
    const SWIPE_MAX_Y = 50;       // px vertical drift allowed
    const SWIPE_MAX_MS = 600;     // upper bound on swipe duration

    let startX = 0, startY = 0, startT = 0, tracking = false;

    field.addEventListener("touchstart", function(e){
      if(e.touches.length !== 1) { tracking = false; return; }
      const t = e.touches[0];
      // Don't capture swipes that begin on an interactive control.
      if(e.target && e.target.closest("button,a,input,textarea,select")) { tracking = false; return; }
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    }, { passive: true });

    field.addEventListener("touchend", function(e){
      if(!tracking) return;
      tracking = false;
      if(e.changedTouches.length !== 1) return;
      if(Date.now() - startT > SWIPE_MAX_MS) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if(Math.abs(dy) > SWIPE_MAX_Y) return;
      if(Math.abs(dx) < SWIPE_MIN_X) return;
      if(dx > 0){
        if(typeof prevPlayer === "function") prevPlayer();
      }else{
        if(typeof nextPlayer === "function") nextPlayer();
      }
    }, { passive: true });
  }

  window.addEventListener("load", setupSwipeNavigation);
})();
