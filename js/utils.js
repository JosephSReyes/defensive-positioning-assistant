/* Defensive Positioning Assistant — Utilities
 * Pure helper functions with no external dependencies.
 * Loaded after storage.js.
 */

function id(){ return Math.random().toString(36).slice(2,10); }
function escapeHtml(v){ return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function shortOutcome(o){ return {"Home Run":"HR","Strikeout":"K","Groundout":"GO","Flyout":"FO","Previous hit":"Hit"}[o] || o; }
function pct(value,total){ return total ? Math.round((value/total)*100) : 0; }

function zoneLabel(e){
  if(e.x === undefined || e.y === undefined) return "";

  const x = Number(e.x);
  const y = Number(e.y);

  /*
    Accurate batted-ball location rule:
    - Anything outside/past the dirt diamond = LF / CF / RF.
    - Anything inside the dirt diamond = infield only.
    - Groundouts, flyouts, and hits all use this same location logic.
    - Pitcher gets balls near the mound or in front of the mound.
    - Balls past the mound through the middle go SS or 2B.
    - Balls near the 1B/3B lines or corners go 1B/3B.
  */

  const dirtDiamond = [
    {x:50,y:39},  // top of dirt / near second
    {x:76,y:62},  // first-base side
    {x:50,y:84},  // home plate side
    {x:21,y:62}   // third-base side
  ];

  function pointInPolygon(px, py, poly){
    let inside = false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i].x, yi=poly[i].y;
      const xj=poly[j].x, yj=poly[j].y;
      const intersect = ((yi>py)!=(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi);
      if(intersect) inside = !inside;
    }
    return inside;
  }

  const isInDirt = pointInPolygon(x, y, dirtDiamond);

  // Outside dirt = outfield.
  if(!isInDirt){
    if(x < 38) return "LF";
    if(x > 62) return "RF";
    return "CF";
  }

  // Pitcher area: mound + front of mound lane.
  const nearMound = Math.hypot(x - 50, y - 65) <= 9;
  const inFrontOfMound = y > 65 && y <= 79 && x >= 39 && x <= 61;
  if(nearMound || inFrontOfMound) return "P";

  // Corner/line infield zones get priority.
  // This fixes balls hit near 1B/3B being swallowed by SS/2B.
  if(x <= 33 && y >= 49) return "3B";
  if(x >= 67 && y >= 49) return "1B";

  // Higher dirt edges near the lines.
  if(x <= 28 && y >= 43) return "3B";
  if(x >= 72 && y >= 43) return "1B";

  // Past mound through the middle = SS or 2B, not pitcher.
  if(y < 65 && x > 28 && x < 72){
    return x < 50 ? "SS" : "2B";
  }

  // Remaining lower dirt: assign to closest realistic infield position.
  const infieldSpots = [
    {name:"3B", x:21, y:62},
    {name:"SS", x:34, y:52},
    {name:"2B", x:66, y:52},
    {name:"1B", x:76, y:62},
    {name:"P",  x:50, y:65}
  ];

  let closest = infieldSpots[0];
  let best = Infinity;

  infieldSpots.forEach(pos=>{
    const d = Math.hypot(x - pos.x, y - pos.y);
    if(d < best){
      best = d;
      closest = pos;
    }
  });

  return closest.name;
}
