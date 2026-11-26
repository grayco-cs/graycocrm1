# SYNCSAFE (owner 11/26: "brinkley one, i know i have edited it it should never revert back" / "if i type it its forever so a roll back
# shouldnt ever edit new information, and it should only be syncing the new information"): measured — at 02:57 UTC the customer-portal
# link save (patch Q doSave, run for every job by PORTALAUTO) took the job from this computer's DISK copy, which was older than the
# screen's, stamped it "changed now" and sent it: Brinkley- CDI went back to "Head Start" (client, contract, scope) and Apartment fire
# lost its contract / dates. Both whole-job writers (the portal's doSave and SYNC-A's _gcxPatchJob, used by the contract read) now start
# from the NEWEST copy this computer has (screen, disk or its own last save — by the job's own updatedAt), never an older one; the
# portal link save changes only the portal fields on it.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'SYNCSAFE' not in s
def sub(a, b):
    global s
    assert s.count(a) == (3 if "recent[pid] && s(recent" in a else 1), (a[:70], s.count(a)); s = s.replace(a, b)
sub("""  if (Array.isArray(all)) next = all.map(function(p){ if (p && String(p.id) === String(pid)) { hit = true; saved = put(recent[pid] && s(recent[pid].updatedAt) > s(p.updatedAt) ? recent[pid] : p); return saved; } return p; });""",
    """  /* patch SYNCSAFE: the newest copy of this job this computer has (screen, disk, its own last save) — never an older one */
  function newest(p){ var c = [p, recent[pid]]; try { var sc = (window._crm && window._crm.projects || []).filter(function(x){ return x && String(x.id) === String(pid); })[0]; if (sc) c.push(sc); } catch (e) {}
    c = c.filter(Boolean); c.sort(function(a, b){ var ta = Date.parse(a.updatedAt || a.savedAt || 0) || 0, tb = Date.parse(b.updatedAt || b.savedAt || 0) || 0; return tb - ta; }); return c[0] || p; }
  if (Array.isArray(all)) next = all.map(function(p){ if (p && String(p.id) === String(pid)) { hit = true; saved = put(newest(p)); return saved; } return p; });""")
sub("""  var list = await rawJobs(), hit = false, at = nowISO(), by = me();
  var next = list.map(function(p){
    if(!p || p.id !== pid) return p;
    hit = true;""",
    """  var list = await rawJobs(), hit = false, at = nowISO(), by = me();
  var scr = null; try{ scr = (window._crm && window._crm.projects || []).filter(function(x){ return x && x.id === pid; })[0] || null; }catch(e){}
  var next = list.map(function(p){
    if(!p || p.id !== pid) return p;
    hit = true;
    /* patch SYNCSAFE: the screen's copy when it is newer than the disk's — never send an older job "changed now" */
    try{ if(scr && (Date.parse(scr.updatedAt || scr.savedAt || 0) || 0) > (Date.parse(p.updatedAt || p.savedAt || 0) || 0)) p = scr; }catch(e){}""")
open(p, 'w', encoding='utf-8').write(s); print('SYNCSAFE applied')
