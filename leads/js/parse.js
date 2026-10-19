// Turns the GrayCo outreach workbook into an ordered lead list.
// Shared by the published page and by the seed build, so ids always match.
function parseWorkbook(XLSX, wb) {
  const pick = (row, keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  const TITLE = ["Company", "Company / Program", "Firm", "Builder", "Program / Company", "Platform / Plan Room", "Organization / Registration", "Owner / List"];
  const WHAT = ["Active / Recent Project", "What They Do / Why", "Why / Work Available", "Known Projects", "What It Is", "What's on It", "Why Join — for GrayCo", "What You Bid as GC", "Best For", "Focus"];
  const HOW = ["Email Hook — Project to Mention", "How to Get In", "How to Get On It", "Requirements", "Who Should Join", "What to Ask / Notes"];
  const WEB = ["Website / Portal", "How to Apply / Website", "Website"];
  const PERSON = ["Contact Name", "Contact", "Who to Target (Dept)", "Local Chapter / Contact"];
  const AREA = ["Market", "Area", "HQ / Local Address", "Address"];
  const DOM = /([a-z0-9][a-z0-9\-]*(?:\.[a-z0-9\-]+)*\.(?:com|org|gov|net|edu|io|co|us|info)(?:\/[^\s|,;()]*)?)/gi;
  const EM = /[\w.+-]+@[\w-]+\.[a-z][\w.]*[a-z]/gi;
  const PH = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
  const uniq = (a) => [...new Set(a)];
  const split = (t) => (/^none$/i.test(t) ? [] : uniq(t.split(/\s*\|\s*/).filter(Boolean)).slice(0, 2));
  const links = (t) => {
    const clean = (t || "").replace(EM, " ");
    const out = [];
    for (const m of clean.match(DOM) || []) {
      const v = m.replace(/[.)]+$/, "");
      if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    }
    return out.slice(0, 2);
  };
  const slug = (s) => s.replace(/[^A-Za-z0-9_.~:@+-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150);
  const regTab = (n) => /bid list|plan room|join|register|insurance|registration/i.test(n);
  const statusMap = (s) => {
    s = (s || "").toLowerCase();
    if (!s) return "";
    if (s.includes("bid submitted") || s.includes("bidding")) return "Bidding / working";
    if (s.includes("in progress") || s.includes("applied")) return "Submitted";
    if (s.startsWith("in use") || s.includes("approved")) return "Approved / on list";
    if (s.includes("need to identify")) return "";
    return "";
  };

  const items = [];
  wb.SheetNames.forEach((sheet, si) => {
    if (/summary/i.test(sheet)) return;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "" });
    if (!rows.length || !("Priority" in rows[0])) return;
    rows.forEach((r) => {
      const pri = parseInt(r["Priority"], 10);
      const title = pick(r, TITLE);
      if (!pri || !title) return;
      const category = pick(r, ["Category"]);
      const isSetup = category === "PREREQ";
      const platform = /platform/i.test(category);
      const phase = regTab(sheet) || platform ? 1 : 2;
      const allText = Object.values(r).map(String).join(" ");
      const webText = pick(r, WEB);
      const zone = pick(r, ["Distance from Bartlett"]);
      const vWeb = pick(r, ["Verified website"]), vEmail = pick(r, ["Verified email"]), vPhone = pick(r, ["Verified phone"]);
      const found = links(webText).length ? links(webText) : phase === 1 ? links(allText) : [];
      let person = pick(r, PERSON);
      const title2 = pick(r, ["Title"]);
      if (person && title2 && pick(r, ["Contact Name"])) person += ", " + title2;
      items.push({
        id: slug(sheet + "|" + title),
        phase,
        sheet,
        si,
        setup: isSetup,
        pri,
        inz: !zone || zone.startsWith("Within"),
        zone: zone ? zone.replace(/^Outside 100 mi — /, "") : "",
        title,
        what: pick(r, WHAT).slice(0, 240),
        how: pick(r, HOW).slice(0, 240),
        area: pick(r, AREA).slice(0, 90),
        // "Verified …" columns hold contact details checked by hand (Oct 2026 link check);
        // when filled they replace what is picked out of the other columns.
        links: vWeb ? split(vWeb) : found,
        dk: found[0] || "",
        emails: vEmail ? split(vEmail) : uniq(allText.match(EM) || []).slice(0, 2),
        phones: vPhone ? split(vPhone) : uniq(allText.match(PH) || []).slice(0, 2),
        person: /^see /i.test(person) ? "" : person.replace(EM, "").replace(PH, "").split("|")[0].replace(/\b(fax|W-9 fax)\b.*$/i, "").replace(/[\s:;,(-]+$/, "").trim().slice(0, 90),
        init: statusMap(pick(r, ["Status"])),
        raw: Object.fromEntries(Object.entries(r).filter(([k, v]) => String(v).trim() !== "" && !/^__EMPTY/.test(k)).map(([k, v]) => [k, String(v).trim().slice(0, 700)])),
      });
    });
  });
  const ins = (x) => (x.phase === 1 && /insurance/i.test(x.sheet) ? 1 : 0);
  items.sort((a, b) => a.phase - b.phase || (b.setup - a.setup) || (ins(b) - ins(a)) || a.pri - b.pri || (b.inz - a.inz) || a.si - b.si);
  const seen = new Set();
  const out = [];
  for (const it of items) {
    // Duplicates are found by the spreadsheet's own link (dk), not a "Verified website",
    // so fixing a link never merges or splits companies.
    const key = it.phase + "|" + (it.phase === 1 && it.dk ? it.dk.toLowerCase().replace(/\/+$/, "") : it.title.toLowerCase());
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  const ids = new Set();
  for (const it of out) {
    let id = it.id, k = 2;
    while (ids.has(id)) id = it.id + "-" + k++;
    it.id = id;
    ids.add(id);
    delete it.si;
    delete it.dk;
  }
  return out;
}
if (typeof module !== "undefined") module.exports = { parseWorkbook };
