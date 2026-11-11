// test_ONCALLRING.js — owner 11/11: "all on-call foremen / techs get emergency calls directly to their phones when on call".
const CO = require('../../netlify/functions/_lib/callorder.js');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
const users = [{ id: 'u1', name: 'Tim Tech', email: 'tim@grayco-cs.com', role: 'Field Tech', cell: '9015550201', active: true },
  { id: 'u2', name: 'Mia Manager', email: 'mia@grayco-cs.com', role: 'Mitigation Manager', phone: '9015550202', active: true },
  { id: 'u3', name: 'Nick Thomas', email: 'nick@grayco-cs.com', role: 'Admin', phone: '9015550203', active: true },
  { id: 'u4', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', phone: '9015550204', active: true }];
const cfg = CO.clean({}); const night = { on: true, slots: cfg.night.slots };
ok('the default after-hours order starts with "On call (this week)"', cfg.night.slots[0] && cfg.night.slots[0].kind === 'oncall', cfg.night.slots.map(x => x.kind));
let l = CO.resolve(night, { users, oncallNow: { name: 'Tim Tech', email: 'tim@grayco-cs.com' } }, {}).list;
ok('on call = a tech → his cell rings first, then the Mitigation manager, Nick, Wesley', l.map(x => x.number).join() === '9015550201,9015550202,9015550203,9015550204', l.map(x => x.label + ':' + x.number));
l = CO.resolve(night, { users, oncallNow: null }, {}).list;
ok('nobody on call → the Mitigation manager first', l[0] && l[0].number === '9015550202', l.map(x => x.number));
l = CO.resolve(night, { users, oncallNow: { name: 'Mia Manager', email: 'mia@grayco-cs.com' } }, {}).list;
ok('the manager on call is rung once (not twice)', l.filter(x => x.number === '9015550202').length === 1, l.map(x => x.number));
const n = R.filter(Boolean).length; console.log('ONCALLRING ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
