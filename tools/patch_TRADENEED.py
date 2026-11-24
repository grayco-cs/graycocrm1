# TRADENEED (owner 11/24: "Some people like tom might not have clicked their trade … If they haven't picked a trade make them choose"):
# sign-up already asks for a trade on both sites; an older account can have none. A sub / supplier with no trade on file now gets a
# "🧰 Pick your trade(s)" card at the top of Available Jobs (the same chips as sign-up + "Other"), saved to their profile like ✏️ Edit
# profile. It stays until they pick — a card in the page, never a popup (standing rule: no blocking popups).
def sub(p, a, b, n=1):
    t = open(p, encoding='utf-8').read(); assert t.count(a) == n, (p, a[:70], t.count(a)); open(p, 'w', encoding='utf-8').write(t.replace(a, b))
A = 'subportal-app/src/App.jsx'
sub(A, """              {view === 'jobs' && <JobList t={t} jobs={jobs} user={user} users={users}""",
"""              {view === 'jobs' && user && (user.role === 'sub' || user.role === 'supplier') && !(user.trades || []).filter(Boolean).length && !impersonatedFrom &&
                <TradeNeed t={t} showToast={showToast} onSave={tr => { setUsers(users.map(u => u.id === user.id ? { ...u, trades: tr } : u)); setUser({ ...user, trades: tr }); }} />}   {/* patch TRADENEED */}
              {view === 'jobs' && <JobList t={t} jobs={jobs} user={user} users={users}""")
sub(A, "function CompanyProfileCard({ t, user, onSave, showToast }) {", """/* patch TRADENEED: an account with no trade picks one here (the sign-up's chips) — shown until they do */
function TradeNeed({ t, onSave, showToast }) {
  const es = t === T.es;
  const [picked, setPicked] = useState({});
  const [other, setOther] = useState('');
  const list = Object.keys(picked).filter(k => picked[k]).concat(other.split(/[,;\\n]+/).map(x => x.trim()).filter(Boolean)).slice(0, 30);
  return (
    <Card style={{ marginBottom: 16, border: '2px solid ' + styles.accent }} data-tradeneed="1">
      <h3 style={{ ...sectionTitleStyle, marginTop: 0 }}>🧰 {es ? 'Escoja su(s) oficio(s)' : 'Pick your trade(s)'}</h3>
      <div style={{ fontSize: 14, color: styles.text2, marginBottom: 10 }}>{es ? 'Así le mostramos los trabajos que piden su oficio. Toque todos los que hace.' : 'So we show you the jobs that need your work. Tap all that fit.'}</div>
      <TradeChips picked={picked} onChange={setPicked} />
      <input style={{ ...inputStyle, marginTop: 8 }} data-tn="other" placeholder={t.tradeOther || 'Other trade(s) — type them here'} value={other} onChange={e => setOther(e.target.value)} />
      <div style={{ marginTop: 10 }}>
        <Btn data-tn="save" onClick={() => { if (!list.length) { showToast(es ? 'Escoja al menos un oficio.' : 'Pick at least one trade.', 'error'); return; } onSave(list); showToast(es ? 'Guardado — reabra la lista para ver sus trabajos.' : 'Saved — reload to see the jobs for your trade.'); }}>{es ? 'Guardar mis oficios' : 'Save my trades'}</Btn>
      </div>
    </Card>
  );
}
function CompanyProfileCard({ t, user, onSave, showToast }) {""")
print('TRADENEED: done')
