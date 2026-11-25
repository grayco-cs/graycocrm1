# SUBEDIT (owner 11/25, the bid site's Approved Subs cards: "need to be able to edit companies and what they do for them" + "they should have a
# little profile — phone numbers, e-mails etc — button next to the docs button"): 👤 Profile now sits in the card's button row next to
# 📄 View Documents (subs and suppliers), and the profile has ✎ Edit — company, DBA, contact, title, phone, address, website, license and
# the trades (the sign-up's trade buttons + "other"). Saved like every other admin change to the account.
p = 'subportal-app/src/App.jsx'; s = open(p, encoding='utf-8').read()
assert 'SUBEDIT' not in s
def sub(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:70], s.count(a)); s = s.replace(a, b)
# 1) the profile box: a fragment (button in the row, the panel full width under it) + ✎ Edit
sub("""function ProfileBox({ u, users, setUsers, showToast, to }) {
  const [open, setOpen] = useState(false), [ask, setAsk] = useState(false);""",
"""function ProfileBox({ u, users, setUsers, showToast, to }) {
  const [open, setOpen] = useState(false), [ask, setAsk] = useState(false);
  /* patch SUBEDIT: ✎ Edit the company and what they do */
  const [ed, setEd] = useState(null);
  function startEdit() {
    const all = Array.isArray(u.trades) ? u.trades.filter(Boolean) : [];
    setEd({ company: u.company || '', dbaName: u.dbaName || '', name: u.name || '', contactTitle: u.contactTitle || '', phone: u.phone || '',
      businessAddress: u.businessAddress || '', businessCity: u.businessCity || '', businessState: u.businessState || '', businessZip: u.businessZip || '',
      website: u.website || '', licenseNumbers: u.licenseNumbers || u.license || '', picked: Object.fromEntries(all.map(x => [x, true])), other: '' });
  }
  function saveEdit() {
    const trades = Object.keys(ed.picked).filter(k => ed.picked[k]).concat(ed.other.split(/[,;\\n]+/).map(x => x.trim()).filter(Boolean)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 30);
    if (!ed.company.trim()) { showToast('The company name is needed.', 'error'); return; }
    const patch = { company: ed.company.trim(), dbaName: ed.dbaName.trim(), name: ed.name.trim(), contactTitle: ed.contactTitle.trim(), phone: ed.phone.trim(),
      businessAddress: ed.businessAddress.trim(), businessCity: ed.businessCity.trim(), businessState: ed.businessState.trim().toUpperCase().slice(0, 2), businessZip: ed.businessZip.trim(),
      website: ed.website.trim(), licenseNumbers: ed.licenseNumbers.trim(), trades };
    setUsers(users.map(x => x.id === u.id ? { ...x, ...patch } : x));
    setEd(null); showToast('Saved — ' + patch.company + '.');
  }
  const inp = (k, ph, w) => <input data-subedit-f={k} placeholder={ph} value={ed[k]} onChange={e => setEd({ ...ed, [k]: e.target.value })} style={{ ...inputStyle, width: w || '100%', boxSizing: 'border-box', marginBottom: 6 }} />;""")
sub("""  return (
    <div data-profile={u.id} style={{ marginBottom: 8 }}>
      <Btn size="sm" variant="secondary" data-profile-open={u.id} onClick={() => setOpen(!open)}>👤 {open ? 'Hide profile' : 'Profile'}</Btn>
      {open && <div data-profile-box={u.id} style={{ marginTop: 8, padding: 10, border: `1px solid ${styles.border}`, borderRadius: 8, background: styles.cream }}>""",
"""  return (
    <>
      <Btn size="sm" variant="secondary" data-profile-open={u.id} onClick={() => setOpen(!open)}>👤 {open ? 'Hide profile' : 'Profile'}</Btn>
      {open && <div data-profile={u.id} data-profile-box={u.id} style={{ flexBasis: '100%', marginTop: 4, padding: 10, border: `1px solid ${styles.border}`, borderRadius: 8, background: styles.cream }}>
        {ed ? <div data-subedit={u.id}>
          {inp('company', 'Company name')}{inp('dbaName', 'DBA (optional)')}
          <div style={{ display: 'flex', gap: 6 }}>{inp('name', 'Contact name')}{inp('contactTitle', 'Title')}</div>
          {inp('phone', 'Phone')}
          {inp('businessAddress', 'Street address')}
          <div style={{ display: 'flex', gap: 6 }}>{inp('businessCity', 'City')}{inp('businessState', 'ST', 70)}{inp('businessZip', 'ZIP', 100)}</div>
          {inp('website', 'Website')}{inp('licenseNumbers', 'License number(s)')}
          <div style={{ fontSize: 12, fontWeight: 700, margin: '4px 0' }}>What they do</div>
          <TradeChips picked={ed.picked} onChange={pk => setEd({ ...ed, picked: pk })} />
          {inp('other', 'Other trade(s) — type them, comma between')}
          <div style={{ display: 'flex', gap: 6 }}><Btn size="sm" data-subedit-save={u.id} onClick={saveEdit}>Save</Btn><Btn size="sm" variant="ghost" onClick={() => setEd(null)}>Cancel</Btn></div>
        </div> : <>""")
sub("""        {row('Joined', u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '')}
        <div style={{ marginTop: 8 }}>""",
"""        {row('Joined', u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '')}
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Btn size="sm" variant="secondary" data-subedit-open={u.id} onClick={startEdit}>✎ Edit</Btn>""")
sub("""              </div>}
        </div>
      </div>}
    </div>
  );
}
function ApprovedSuppliers(""",
"""              </div>}
        </div>
        </>}
      </div>}
    </>
  );
}
function ApprovedSuppliers(""")
# 2) supplier card: the profile goes into the button row
sub("""              <ProfileBox u={u} users={users} setUsers={setUsers} showToast={showToast} to="sub" />
""", "")
sub("""                <Btn size="sm" variant="ghost" icon={DollarSign} onClick={() => setWork(u)}>{t.supPos} &amp; {t.supBills}</Btn>""",
"""                <ProfileBox u={u} users={users} setUsers={setUsers} showToast={showToast} to="sub" />   {/* SUBEDIT: next to the buttons */}
                <Btn size="sm" variant="ghost" icon={DollarSign} onClick={() => setWork(u)}>{t.supPos} &amp; {t.supBills}</Btn>""")
# 3) sub card: next to 📄 View Documents
sub("""              <ProfileBox u={u} users={users} setUsers={setUsers} showToast={showToast} to="supplier" />
""", "")
sub("""                <Btn size="sm" variant="ghost" icon={FileText} onClick={() => setViewingDocs(u)}>
                  {t.viewSubDocs} ({docCount})
                </Btn>""",
"""                <Btn size="sm" variant="ghost" icon={FileText} onClick={() => setViewingDocs(u)}>
                  {t.viewSubDocs} ({docCount})
                </Btn>
                <ProfileBox u={u} users={users} setUsers={setUsers} showToast={showToast} to="supplier" />   {/* SUBEDIT: next to the docs button */}""")
open(p, 'w', encoding='utf-8').write(s); print('SUBEDIT applied')
