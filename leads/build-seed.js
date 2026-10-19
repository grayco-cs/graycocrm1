// Rebuilds leads/data/seed.json (the built-in company list) from the spreadsheet,
// with the same parser the page uses for "Update from spreadsheet", so ids always match.
//   npm install --no-save xlsx@0.18.5 && node leads/build-seed.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parseWorkbook } = require('./js/parse.js');

const src = path.join(__dirname, 'data', 'GrayCo_Multifamily_Outreach_Tracker.xlsx');
const out = path.join(__dirname, 'data', 'seed.json');
const leads = parseWorkbook(XLSX, XLSX.readFile(src));
fs.writeFileSync(out, JSON.stringify({ built: new Date().toISOString().replace(/\.\d+Z$/, '.000Z'), leads }));
console.log(leads.length + ' companies written to ' + path.relative(process.cwd(), out));
