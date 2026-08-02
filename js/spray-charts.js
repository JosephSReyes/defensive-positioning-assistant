/* Defensive Positioning Assistant — Spray Charts
 * Export (canvas PNG) and team spray chart screen rendering.
 * Depends on: storage.js, utils.js, game.js, ui.js
 */

/* DPA EXPORT SPRAY CHARTS - SIMPLE CANVAS REPORT */
(function(){
  function safeText(v){ return (v == null ? "" : String(v)); }
  function fileSafe(v){ return safeText(v).replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"") || "DefensivePositioning"; }
  function team(){ return (typeof getCurrentTeam === "function") ? getCurrentTeam() : null; }
  function playerName(p,i){
    const n = safeText(p && p.name).trim() || `Player ${i+1}`;
    const num = safeText(p && p.number).trim();
    return `${i+1}. ${num ? "#"+num+" " : ""}${n}`;
  }
  window.openExportSprayCharts = function(){
    const t = team();
    if(!t || !t.players || !t.players.length){ alert("Add players before exporting."); return; }
    const modal = document.getElementById("exportSprayModal");
    const sel = document.getElementById("exportPlayerSelect");
    const wrap = document.getElementById("exportPlayerSelectWrap");
    if(sel){
      sel.innerHTML = t.players.map((p,i)=>`<option value="${i}">${escapeHtml(playerName(p,i))}</option>`).join("");
    }
    if(wrap) wrap.classList.remove("active");
    modal && modal.classList.add("active");
  };
  window.closeExportSprayCharts = function(){
    const modal = document.getElementById("exportSprayModal");
    modal && modal.classList.remove("active");
  };
  window.showExportPlayerSelect = function(){
    const wrap = document.getElementById("exportPlayerSelectWrap");
    wrap && wrap.classList.add("active");
  };

  function drawField(ctx,x,y,w,h,title,events){
    ctx.save();
    ctx.translate(x,y);
    // card bg
    roundRect(ctx,0,0,w,h,22,"#071521","rgba(255,255,255,.10)");
    ctx.fillStyle="#ffffff";
    ctx.font="bold 26px system-ui, -apple-system, Segoe UI, Arial";
    ctx.fillText(title,24,38);
    ctx.font="14px system-ui, -apple-system, Segoe UI, Arial";
    ctx.fillStyle="#9fb3c8";
    ctx.fillText(`${events.length} marked ball${events.length===1?"":"s"}`,24,60);

    const fx=20, fy=78, fw=w-40, fh=h-98;
    ctx.beginPath();
    ctx.rect(fx,fy,fw,fh);
    ctx.clip();
    // grass
    const g=ctx.createLinearGradient(0,fy,0,fy+fh);
    g.addColorStop(0,"#0f5d36"); g.addColorStop(.45,"#176f40"); g.addColorStop(1,"#0d3d28");
    ctx.fillStyle=g; ctx.fillRect(fx,fy,fw,fh);
    // mowing arcs
    ctx.strokeStyle="rgba(255,255,255,.055)"; ctx.lineWidth=3;
    for(let r=80;r<fw*1.1;r+=55){ ctx.beginPath(); ctx.arc(fx+fw/2,fy+fh*.88,r,Math.PI*1.05,Math.PI*1.95); ctx.stroke(); }
    // outfield fence arc
    ctx.strokeStyle="rgba(255,255,255,.18)"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(fx+fw/2,fy+fh*.87,fw*.53,Math.PI*1.08,Math.PI*1.92); ctx.stroke();
    // foul lines
    ctx.strokeStyle="rgba(255,255,255,.70)"; ctx.lineWidth=3;
    line(ctx, fx+fw*.50, fy+fh*.88, fx+fw*.12, fy+fh*.08);
    line(ctx, fx+fw*.50, fy+fh*.88, fx+fw*.88, fy+fh*.08);
    // dirt infield
    ctx.fillStyle="#b66a35";
    ctx.beginPath();
    ctx.moveTo(fx+fw*.50,fy+fh*.35);
    ctx.lineTo(fx+fw*.77,fy+fh*.62);
    ctx.quadraticCurveTo(fx+fw*.63,fy+fh*.79,fx+fw*.50,fy+fh*.88);
    ctx.quadraticCurveTo(fx+fw*.37,fy+fh*.79,fx+fw*.23,fy+fh*.62);
    ctx.closePath(); ctx.fill();
    // inner grass diamond
    ctx.fillStyle="#155f37";
    ctx.beginPath();
    ctx.moveTo(fx+fw*.50,fy+fh*.43); ctx.lineTo(fx+fw*.68,fy+fh*.62); ctx.lineTo(fx+fw*.50,fy+fh*.78); ctx.lineTo(fx+fw*.32,fy+fh*.62); ctx.closePath(); ctx.fill();
    // baselines
    ctx.strokeStyle="rgba(255,255,255,.86)"; ctx.lineWidth=3;
    const home=[fx+fw*.50,fy+fh*.86], first=[fx+fw*.72,fy+fh*.63], second=[fx+fw*.50,fy+fh*.42], third=[fx+fw*.28,fy+fh*.63];
    line(ctx,...home,...first); line(ctx,...first,...second); line(ctx,...second,...third); line(ctx,...third,...home);
    // mound/plate
    ctx.fillStyle="#a85e30"; ctx.beginPath(); ctx.arc(fx+fw*.50,fy+fh*.65,fw*.045,0,Math.PI*2); ctx.fill();
    drawBase(ctx, first[0], first[1], 10); drawBase(ctx, second[0], second[1], 10); drawBase(ctx, third[0], third[1], 10); drawBase(ctx, home[0], home[1]+2, 12);
    // labels
    const labels={LF:[.22,.22],CF:[.50,.13],RF:[.78,.22],SS:[.37,.52],"2B":[.63,.52],"3B":[.22,.66],"1B":[.78,.66],P:[.50,.65]};
    Object.entries(labels).forEach(([k,v])=>{ drawLabel(ctx,k,fx+fw*v[0],fy+fh*v[1]); });
    // hit dots
    events.forEach(e=>{
      if(typeof e.x!=="number" || typeof e.y!=="number") return;
      const px=fx+fw*(e.x/100), py=fy+fh*(e.y/100);
      if(e.isOut){
        ctx.strokeStyle=e.mode==="previous"?"rgba(120,190,255,.90)":"rgba(255,255,255,.92)"; ctx.lineWidth=4;
        line(ctx,px-8,py-8,px+8,py+8); line(ctx,px+8,py-8,px-8,py+8);
      }else{
        ctx.fillStyle=e.mode==="previous"?"#2f8cff":"#e3343f";
        ctx.strokeStyle="rgba(255,255,255,.88)"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(px,py,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
      }
    });
    ctx.restore();
  }
  function drawLabel(ctx,t,x,y){
    ctx.save(); ctx.fillStyle="rgba(2,9,15,.82)"; ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x,y,17,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle="#fff"; ctx.font="bold 12px system-ui, -apple-system, Segoe UI, Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t,x,y); ctx.restore();
  }
  function drawBase(ctx,x,y,s){ ctx.save(); ctx.translate(x,y); ctx.rotate(Math.PI/4); ctx.fillStyle="#fff"; ctx.fillRect(-s/2,-s/2,s,s); ctx.restore(); }
  function line(ctx,x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
  function roundRect(ctx,x,y,w,h,r,fill,stroke){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();} }

  window.exportSprayCharts = function(mode){
    const t=team(); if(!t || !t.players || !t.players.length) return alert("No players to export.");
    let players=t.players.map((p,i)=>({p,i}));
    if(mode==="player"){
      const idx=Number(document.getElementById("exportPlayerSelect")?.value || 0);
      players=[{p:t.players[idx],i:idx}];
    }
    const cardW=900, cardH=680, gap=26, headerH=110;
    const canvas=document.createElement("canvas");
    canvas.width=1000; canvas.height=headerH + players.length*(cardH+gap) + 34;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#04111d"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#f7c948"; ctx.font="bold 38px system-ui, -apple-system, Segoe UI, Arial"; ctx.fillText("DPA Spray Charts",50,52);
    ctx.fillStyle="#a9bdd0"; ctx.font="20px system-ui, -apple-system, Segoe UI, Arial"; ctx.fillText(`${t.name} • ${mode==="team"?"Entire Team":"Individual Player"} • ${new Date().toLocaleDateString()}`,50,84);
    players.forEach(({p,i},n)=>{
      const ev=[...(p.currentEvents||[]),...(p.previousEvents||[])].filter(e=>typeof e.x==="number" && typeof e.y==="number");
      drawField(ctx,50,headerH+n*(cardH+gap),cardW,cardH,playerName(p,i),ev);
    });
    const link=document.createElement("a");
    link.download=`${fileSafe(t.name)}_${mode==="team"?"team":"player"}_spray_chart.png`;
    link.href=canvas.toDataURL("image/png");
    document.body.appendChild(link); link.click(); link.remove();
    closeExportSprayCharts();
  };
})();


// Defensive Positioning Assistant: Team Spray Chart opener/renderer (previous-game data only, screenshot friendly)
(function(){
  function getTeamSafe(){
    try{
      if(typeof getCurrentTeam === "function") return getCurrentTeam();
    }catch(e){}
    try{
      return (window.appData && Array.isArray(appData.teams)) ? appData.teams.find(t=>t.id===appData.selectedTeamId) : null;
    }catch(e){ return null; }
  }
  function esc(v){
    try{ if(typeof escapeHtml === "function") return escapeHtml(v); }catch(e){}
    return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  window.openTeamSprayChart = function(){
    const team = getTeamSafe();
    if(!team){ alert("Open a team first."); return; }
    window.renderTeamSprayChart();
    if(typeof showScreen === "function") showScreen("teamSprayScreen");
    else {
      document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
      document.getElementById("teamSprayScreen")?.classList.add("active");
    }
  };
  window.renderTeamSprayChart = function(){
    const team = getTeamSafe();
    const field = document.getElementById("teamSprayField");
    const title = document.getElementById("teamSprayTitle");
    const summary = document.getElementById("teamSpraySummary");
    if(!team || !field) return;
    if(title) title.textContent = `${team.name} Spray Chart`;
    field.querySelectorAll(".team-hit,.team-hit-x,.team-hit-label").forEach(el=>el.remove());

    let count = 0;
    (team.players || []).forEach((player, playerIndex)=>{
      (player.previousEvents || []).forEach(ev=>{
        if(typeof ev.x !== "number" || typeof ev.y !== "number") return;
        const marker = document.createElement("div");
        marker.className = ev.isOut ? "team-hit-x" : "team-hit";
        marker.style.left = ev.x + "%";
        marker.style.top = ev.y + "%";
        marker.title = `${player.number ? "#"+player.number+" " : ""}${player.name || "Player"}`;
        if(ev.isOut){ marker.textContent = "X"; }
        field.appendChild(marker);
        count++;
      });
    });
    if(summary){
      summary.innerHTML = count
        ? `${count} previous batted-ball location${count===1?"":"s"} shown in blue for ${esc(team.name)}.`
        : `No previous spray chart data yet. Add prior-game hits in Previous Games mode, then come back here.`;
    }
  };
})();
