#!/usr/bin/env python3
"""Idempotent patch FIELDFIX6: "No activity in 7+ days" counts the daily logs the field actually writes.

Found by the field-view audit (10/30), confirming another agent's note: the alert bell's job-inactivity check read
daily logs from localStorage "gc_daily_logs" -- a key nothing in the CRM writes and nothing syncs. The field's daily
logs live in the Site Book (gc_kv "gc_sitebook", synced; every signed-in computer keeps a copy in localStorage
"gcRP_sitebook_v1"). So a job whose crew posted a log every day still showed "No activity in 7+ days" in the office.
Not a data-loss bug: the logs do reach the cloud and the office's Site Book. Fix: the check also reads the Site Book
copy (logs not deleted, by date). Read-only; no new keys, timers or requests.
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* FIELDFIX6 */'
if MARK in src:
    print('already patched'); sys.exit(0)
OLD = "    var _logItems = []; try{ _logItems = JSON.parse(localStorage.getItem('gc_daily_logs')||'[]'); }catch(e){}\n"
NEW = OLD + "    " + MARK + " try{ var _sbm = JSON.parse(localStorage.getItem('gcRP_sitebook_v1')||'{}')||{}; Object.keys(_sbm).forEach(function(_k){ var _r = _sbm[_k]; (_r && Array.isArray(_r.logs) ? _r.logs : []).forEach(function(_l){ if(_l && !_l.deleted) _logItems.push({ pid: (_r.id || _k), date: String(_l.date || _l.at || '').slice(0,10) }); }); }); }catch(e){}   /* the field's daily logs (Site Book) */\n"
assert src.count(OLD) == 1, src.count(OLD)
src = src.replace(OLD, NEW)
open(path, 'w', encoding='utf-8').write(src)
print('patched FIELDFIX6')
