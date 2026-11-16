/* __GC_PATCH_DEVMODE__ — DEVMODE: a sign-in opens the device's own view.   (patch DEVMODE)
   Owner 11/16: "Don't ask for field or desk when sign in — just do it by computer or iPhone/Android etc; iPad opens Field."
   A Desk / Field switch lasts for that open only (patch FIELDDESK keeps it in memory). Signing out and in again in the
   same page (no reload) used to keep that switch: the next sign-in now opens the device's own view — the Desk on a
   computer, GrayCo Field on a phone or a tablet. (The first DEVMODE's "Ask me Field or Desk" setting is gone.)
   API: window._gcDevMode = { state() } */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_DEVMODE__) return; W.__GC_PATCH_DEVMODE__ = true;
var DV = W._gcDevice; if (!DV) return;   /* the early script is off on this device */
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function warn(e){ try { console.warn('[GC DEVMODE]', e && e.message || e); } catch (x) {} }
function vas(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
function gateUp(){ var g = D.getElementById('gc-auth-email'); return !!(g && g.getClientRects().length); }
var wasOut = false, resets = 0;
function tick(){
  try {
    if (!DV.signedEmail()) { wasOut = true; return; }
    if (!wasOut || gateUp() || !W._crm || vas()) return;
    wasOut = false;
    var v = DV.fieldDevice() ? 'field' : 'desk', inF = D.documentElement.classList.contains('_fieldmode');
    if (typeof W._gcChooseView === 'function' && (v === 'field') !== inF) W._gcChooseView(v);
    if (W._gcView && W._gcView.set) W._gcView.set('');
    resets++;
  } catch (e) { warn(e); }
}
RI.call(W, function(){ if (!D.hidden) tick(); }, 1000);
W._gcDevMode = { state: function(){ return { device: DV.state(), resets: resets }; } };
try { console.log('[GC] 🖥📱 DEVMODE: ' + DV.kind() + ' (' + DV.why() + ') → ' + (DV.fieldDevice() ? 'GrayCo Field' : 'the Desk') + ' — _gcDevice.state()'); } catch (e) {}
})();
