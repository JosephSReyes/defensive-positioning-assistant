/* Defensive Positioning Assistant — Storage
 * Defines the global appData object and localStorage helpers.
 * Must be the first script loaded — everything else depends on appData.
 */

const STORAGE_KEY = "field_iq_final_full_product_v1";
let appData = { teams: [], selectedTeamId: null, selectedPlayerIndex: 0, mode: "current", trackPitch: false };

function load(){
  try{
    const saved = localStorage.getItem(STORAGE_KEY);
    if(!saved) return;
    const parsed = JSON.parse(saved);
    // Reject non-objects to prevent prototype pollution and malformed data
    if(!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    delete parsed.__proto__;
    delete parsed.constructor;
    delete parsed.prototype;
    if(!Array.isArray(parsed.teams)) parsed.teams = [];
    if(parsed.selectedTeamId !== null && typeof parsed.selectedTeamId !== 'string') parsed.selectedTeamId = null;
    if(typeof parsed.selectedPlayerIndex !== 'number') parsed.selectedPlayerIndex = 0;
    if(typeof parsed.mode !== 'string') parsed.mode = 'current';
    if(typeof parsed.trackPitch !== 'boolean') parsed.trackPitch = false;
    appData = parsed;
  }catch(e){}
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); }
