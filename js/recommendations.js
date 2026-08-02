/* Defensive Positioning Assistant — Recommendations
 * Defensive positioning recommendation logic and AI coach brief trigger.
 * Depends on: storage.js, utils.js, game.js
 */

function resetMoves(){
  const base = {LF:"Normal<br>depth",CF:"Normal<br>depth",RF:"Normal<br>depth",SS:"Normal","2B":"Normal","3B":"Normal","1B":"Normal",P:"Normal<br>position"};
  Object.keys(base).forEach(k=>document.getElementById("move"+k).innerHTML = base[k]);
}

function weightedHitProfile(player){
  // Contact locations include hits AND batted-ball outs.
  // Groundouts/flyouts matter for defensive positioning, but receive less weight than clean hits.
  const allContact = [...(player.currentEvents||[]), ...(player.previousEvents||[])]
    .filter(e=>e.x!==undefined);

  const recentAbs = (player.outcomes||[])
    .filter(o=>o.mode==="current" && o.outcome!=="Walk" && o.outcome!=="Bunt")
    .slice(0,5);

  const coldResults = ["Strikeout","Groundout","Flyout"];
  const slump = recentAbs.slice(0,2).length === 2 && recentAbs.slice(0,2).every(o=>coldResults.includes(o.outcome));

  let profile = { hits:allContact, recentAbs, slump, left:0, middle:0, right:0, short:0, deep:0, hard:0, outs:0, total:0 };

  allContact.forEach((e,i)=>{
    let w = e.isOut ? .65 : 1;                  // outs count, but less than hits
    if(e.outcome === "Flyout") w += .1;         // fly balls help read air contact/depth
    if(e.outcome === "Groundout") w += .1;      // groundouts help read infield contact
    if(e.mode === "current") w += .75;          // live game matters more
    if(i < 3) w += .35;                         // most recent contact matters
    if(["Double","Triple","Home Run"].includes(e.outcome)) w += .55;
    if(e.y < 38) w += .2;                       // deep contact gets a little more weight

    profile.total += w;
    if(e.x < 40) profile.left += w;
    else if(e.x > 60) profile.right += w;
    else profile.middle += w;

    if(e.y < 38 || e.outcome === "Flyout") profile.deep += w;
    if(e.y > 62 || e.outcome === "Groundout") profile.short += w;
    if(e.isOut) profile.outs += w;
    if(["Double","Triple","Home Run"].includes(e.outcome)) profile.hard += w;
  });
  return profile;
}
function aiText(profile){
  const zones = [["left-side",profile.left],["middle",profile.middle],["right-side",profile.right]].sort((a,b)=>b[1]-a[1]);
  const top = zones[0][0];
  const confidence = pct(zones[0][1], profile.total);
  const depth = pct(profile.deep, profile.total);
  const hard = pct(profile.hard, profile.total);
  const outContact = pct(profile.outs, profile.total);

  if(confidence < 45){
    return { label: profile.slump ? "AI: balanced • hitter cold" : "AI: balanced hitter", top, confidence, depth, hard, outContact };
  }

  let note = `${confidence}% ${top}`;
  if(hard >= 42) note += " • power risk";
  else if(depth >= 45) note += " • deep contact";
  else if(pct(profile.short, profile.total) >= 45) note += " • ground-ball risk";
  if(profile.slump) note += " • hitter cold";
  return { label:`AI: ${note}`, top, confidence, depth, hard, outContact };
}
function setMove(pos,text){
  const el = document.getElementById("move"+pos);
  if(el) el.innerHTML = text;
}

function isDeepOutfieldContact(e){
  if(e.x === undefined || e.y === undefined) return false;
  const loc = zoneLabel(e);
  return ["LF","CF","RF"].includes(loc) && Number(e.y) <= 30;
}

function setHotColdPills(showCold, showHot){
  const coldPill = document.getElementById("tendencyPillCold");
  const hotPill = document.getElementById("tendencyPillHot");
  if(coldPill) coldPill.hidden = !showCold;
  if(hotPill) hotPill.hidden = !showHot;
}

function setBuntPill(showBunt){
  const buntPill = document.getElementById("tendencyPillBunt");
  if(buntPill) buntPill.hidden = !showBunt;
}

function renderSmartFielding(player){
  resetMoves();

  const currentContacts = player.currentEvents.filter(e=>e.x!==undefined);
  const previousContacts = player.previousEvents.filter(e=>e.x!==undefined);

  const recentAbs = (player.outcomes || [])
    .filter(o => o.mode === "current" && !["Walk","Bunt"].includes(o.outcome))
    .slice(0,2);

  const slump = recentAbs.length >= 2 &&
    recentAbs.every(o => ["Strikeout","Groundout","Flyout"].includes(o.outcome));

  const hotStreak = recentAbs.length >= 2 &&
    recentAbs.every(o => ["Single","Double","Triple","Home Run"].includes(o.outcome));

  // Bunt likelihood: check last 5 at-bats (all modes), if 2+ are bunts, the batter is bunt-heavy
  var last5Abs = (player.outcomes || []).slice(0, 5);
  var buntsInLast5 = last5Abs.filter(function(o) { return o.outcome === 'Bunt'; }).length;
  var buntLikely = buntsInLast5 >= 2;

  let contacts = [];

  // AI coaching rule:
  // Previous game history matters until 2 current-game contacts exist.
  // After 2 current contacts, current game dominates but previous history still lightly informs the AI.
  if(currentContacts.length >= 2){
    contacts = [
      ...currentContacts.map(e=>({...e, aiWeight:2.2})),
      ...previousContacts.map(e=>({...e, aiWeight:.55}))
    ];
  }else{
    contacts = [
      ...currentContacts.map(e=>({...e, aiWeight:1.8})),
      ...previousContacts.map(e=>({...e, aiWeight:1.25}))
    ];
  }

  if(!contacts.length){
    const txt = document.getElementById("tendencyText");
    txt.textContent = "Log a hit to see tendency";
    document.getElementById("tendencyPill")?.classList.add("empty");
    setHotColdPills(slump, hotStreak);
    setBuntPill(buntLikely);
    return;
  }

  let left=0, middle=0, right=0, deep=0, total=0;

  contacts.forEach((e,i)=>{
    let w = e.aiWeight || 1;

    // Batted-ball outs count as contact, but lower than hits.
    if(e.isOut) w *= 0.65;

    // Extra-base hits matter more.
    if(["Double","Triple","Home Run"].includes(e.outcome)) w += .5;

    total += w;

    if(e.x < 40) left += w;
    else if(e.x > 60) right += w;
    else middle += w;

    if(typeof isDeepOutfieldContact === "function"){
      if(isDeepOutfieldContact(e)) deep += w;
    }else{
      if(e.y < 30) deep += w;
    }
  });

  const zones = [
    ["Left Side",left],
    ["Middle",middle],
    ["Right Side",right]
  ].sort((a,b)=>b[1]-a[1]);

  const top = zones[0][0];
  const pct = Math.round((zones[0][1] / total) * 100);

  document.getElementById("tendencyText").textContent = `${pct}% ${top}`;
  document.getElementById("tendencyPill")?.classList.remove("empty");
  setHotColdPills(slump, hotStreak);
  setBuntPill(buntLikely);

  if(pct < 45) return;

  const big = pct >= 65 && !slump;
  const controlled = slump ? 1 : 0;

  // Movement directions are from the fielder's own perspective (facing home plate),
  // so a Right Side pull tells the fielder to shift to *their* left (toward the 1B line),
  // and a Left Side pull tells them to shift to *their* right (toward the 3B line).
  if(top === "Right Side"){
    document.getElementById("moveRF").innerHTML = `${big ? 3 : 2-controlled} left`;
    document.getElementById("move2B").innerHTML = `${slump ? 1 : 2} left`;
    document.getElementById("moveCF").innerHTML =
      `1 left${deep/total>.45 && !slump ? "<br>1 back" : ""}`;
    document.getElementById("move1B").innerHTML = "Hold bag";
  }else if(top === "Left Side"){
    document.getElementById("moveLF").innerHTML = `${big ? 3 : 2-controlled} right`;
    document.getElementById("moveSS").innerHTML = `${slump ? 1 : 2} right`;
    document.getElementById("moveCF").innerHTML =
      `1 right${deep/total>.45 && !slump ? "<br>1 back" : ""}`;
    document.getElementById("move3B").innerHTML = "Guard line";
  }else{
    document.getElementById("moveSS").innerHTML = "1 middle";
    document.getElementById("move2B").innerHTML = "1 middle";
    document.getElementById("moveCF").innerHTML =
      slump ? "Stay honest" : "Straight up";
  }

}

function buildAIExplainText(){
  const player = getActivePlayer && getActivePlayer();
  if(!player){
    return "AI weighs contact locations, recent at-bats, power risk, outs, and slump/hot streaks.";
  }
  const contacts = [...(player.previousEvents || []), ...(player.currentEvents || [])].filter(e=>e.x!==undefined);
  const liveContacts = (player.currentEvents || []).filter(e=>e.x!==undefined).length;
  const lastAbs = (player.outcomes || []).filter(o=>o.mode==="current" && o.outcome!=="Walk" && o.outcome!=="Bunt").slice(0,5);
  const deep = contacts.filter(e=>e.y < 38 || e.outcome==="Flyout").length;
  const extra = contacts.filter(e=>["Double","Triple","Home Run"].includes(e.outcome)).length;
  const outContact = contacts.filter(e=>e.isOut).length;
  const slump = lastAbs.slice(0,2).length === 2 && lastAbs.slice(0,2).every(o=>["Strikeout","Groundout","Flyout"].includes(o.outcome));
  const tendency = document.getElementById("tendencyText")?.textContent || "current read";

  // Bunt likelihood check: 2+ bunts in last 5 at-bats
  const allBunts = (player.outcomes || []).filter(o=>o.outcome==="Bunt");
  const buntCount = allBunts.length;
  const last5Abs = (player.outcomes || []).slice(0, 5);
  const buntsInLast5 = last5Abs.filter(o=>o.outcome==="Bunt").length;
  const buntLikely = buntsInLast5 >= 2;

  if(!contacts.length){
    let text = "No contact logged yet. Add hits, groundouts, or flyouts for the AI read.";
    if(buntLikely) text += ` Bunt history: ${buntCount} bunt${buntCount===1?"":"s"} recorded.`;
    return text;
  }
  let text = `Reading ${contacts.length} contact spot${contacts.length===1?"":"s"} (${liveContacts} live, ${outContact} outs). ${tendency}. Deep:${deep} XBH:${extra}${slump ? " • hitter is cold, so shifts stay controlled." : ""}${buntLikely ? ` • bunt history: ${buntCount} bunt${buntCount===1?"":"s"} recorded.` : "."}`;
  return text;
}
function toggleAIExplain(force){
  const box = document.getElementById("aiExplainBox");
  const txt = document.getElementById("aiExplainText");
  if(!box) return;

  const shouldShow = typeof force === "boolean" ? force : !box.classList.contains("active");

  const backdrop = document.getElementById("aiBackdrop");

  if(!shouldShow){
    box.classList.remove("active");
    box.style.left = "";
    box.style.width = "";
    box.style.right = "";
    if(backdrop) backdrop.classList.remove("active");
    return;
  }

  if(txt) txt.textContent = buildAIExplainText();

  // Reset AI response text so each open starts fresh
  const briefTxt = document.getElementById("aiCoachBriefText");
  if(briefTxt) briefTxt.textContent = "";

  // Constrain popup to field-wrap width with 8px inset so all border corners are visible
  const fieldWrap = document.querySelector("#gameScreen .field-wrap");
  if(fieldWrap){
    const rect = fieldWrap.getBoundingClientRect();
    box.style.left = (rect.left + 8) + "px";
    box.style.width = (rect.width - 16) + "px";
    box.style.right = "auto";
  }

  if(backdrop) backdrop.classList.add("active");
  box.classList.add("active");
  const _p = getActivePlayer && getActivePlayer();
  const _allContacts = _p ? [...(_p.previousEvents||[]),...(_p.currentEvents||[])].filter(e=>e.x!==undefined) : [];
  if(_allContacts.length) requestAICoachBrief();
}

function requestAICoachBrief(){
  const txt = document.getElementById("aiCoachBriefText");
  const box = document.getElementById("aiExplainBox");
  if(!txt) return;
  if(typeof fetchAICoachBrief !== "function" || typeof buildAIBriefContext !== "function") return;

  txt.textContent = "Asking AI coach…";

  const ctx = buildAIBriefContext();
  fetchAICoachBrief(ctx).then(function(brief){
    if(box && box.classList.contains("active")){
      txt.textContent = brief || "";
    }
  }).catch(function(){
    if(box && box.classList.contains("active"))
      txt.textContent = "AI coach unavailable. Check your connection.";
  });
}
