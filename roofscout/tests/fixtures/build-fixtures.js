// Builds the scan test fixtures (constructed from the documented formats, because this
// sandbox cannot reach the live services). Run: node build-fixtures.js <outdir>
'use strict';
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

const FT = 0.3048, M_PER_DEG = 111194.9;
const O = [35.2050, -89.8450];                      // a commercial block in Bartlett, TN
function pt(xFt, yFt) {
  return [Math.round((O[0] + yFt * FT / M_PER_DEG) * 1e7) / 1e7, Math.round((O[1] + xFt * FT / (M_PER_DEG * Math.cos(O[0] * Math.PI / 180))) * 1e7) / 1e7];
}
function rect(x, y, w, h) { return [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)]; }
const og = (ring) => ring.concat([ring[0]]).map((p) => ({ lat: p[0], lon: p[1] }));   // Overpass: closed way
const esri = (ring) => [ring.concat([ring[0]]).map((p) => [p[1], p[0]])];             // ArcGIS: [x, y], closed

// Buildings (feet from the origin). True areas noted.
const B = {
  A: rect(0, 0, 300, 140),                                         // warehouse 42,000
  B: [pt(400, 0), pt(600, 0), pt(600, 100), pt(500, 100), pt(500, 160), pt(400, 160)],   // retail L 26,000
  C: rect(0, 300, 120, 100),                                       // church 12,000
  D: rect(200, 300, 50, 40),                                       // house 2,000
  F: rect(400, 300, 150, 80),                                      // big barn on a home lot 12,000
  G: rect(700, 300, 110, 90),                                      // office 9,900
  H: rect(0, 500, 180, 70),                                        // apartments 12,600
  E: rect(400, 500, 260, 200),                                     // school outer 52,000
  Ein: rect(500, 570, 60, 50)                                      // courtyard 3,000 → 49,000
};

const elements = [
  { type: 'way', id: 1001, bounds: {}, geometry: og(B.A), tags: { building: 'warehouse', name: 'Example Distribution Center' } },
  { type: 'way', id: 1002, geometry: og(B.B), tags: { building: 'retail', name: 'Example Plaza', 'addr:housenumber': '6000', 'addr:street': 'Stage Road', 'addr:city': 'Bartlett', 'addr:state': 'TN', 'addr:postcode': '38134' } },
  { type: 'way', id: 1003, geometry: og(B.C), tags: { building: 'church', amenity: 'place_of_worship', religion: 'christian', name: 'Example Community Church' } },
  { type: 'way', id: 1004, geometry: og(B.D), tags: { building: 'yes' } },
  { type: 'way', id: 1005, geometry: og(B.F), tags: { building: 'yes' } },
  { type: 'way', id: 1006, geometry: og(B.G), tags: { building: 'office' } },
  { type: 'way', id: 1007, geometry: og(B.H), tags: { building: 'apartments', 'building:levels': '3' } },
  { type: 'relation', id: 2001, tags: { type: 'multipolygon', building: 'school', amenity: 'school', name: 'Example Middle School' }, members: [
    // the outer ring is split into two ways, as mappers often do
    { type: 'way', ref: 3001, role: 'outer', geometry: [B.E[0], B.E[1], B.E[2]].map((p) => ({ lat: p[0], lon: p[1] })) },
    { type: 'way', ref: 3002, role: 'outer', geometry: [B.E[2], B.E[3], B.E[0]].map((p) => ({ lat: p[0], lon: p[1] })) },
    { type: 'way', ref: 3003, role: 'inner', geometry: og(B.Ein) }
  ] }
];
elements.forEach((e) => { delete e.bounds; });
fs.writeFileSync(path.join(out, 'overpass-bartlett.json'), JSON.stringify({
  version: 0.6, generator: 'Overpass API 0.7.62.1 084b4234', osm3s: { timestamp_osm_base: '2026-10-19T15:00:00Z', copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.' },
  elements: elements
}, null, 1));

// Parcels: ArcGIS REST query response (Shelby-style field names), each lot 40 ft around its building.
function lot(ring) {
  const lats = ring.map((p) => p[0]), lngs = ring.map((p) => p[1]);
  const dLat = 40 * FT / M_PER_DEG, dLng = 40 * FT / (M_PER_DEG * Math.cos(O[0] * Math.PI / 180));
  const s = Math.min(...lats) - dLat, n = Math.max(...lats) + dLat, w = Math.min(...lngs) - dLng, e = Math.max(...lngs) + dLng;
  return [[s, w], [s, e], [n, e], [n, w]].map((p) => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]);
}
const P = (ring, a) => ({ attributes: Object.assign({ OBJECTID: Math.floor(Math.random() * 1e6) }, a), geometry: { rings: esri(lot(ring)) } });
const fields = ['OBJECTID', 'PARCELID', 'OWNER', 'OWNADDR', 'OWNCITY', 'OWNSTATE', 'OWNZIP', 'PAR_ADR', 'LUC', 'LUC_DESC', 'YRBLT', 'SFLA'];
fs.writeFileSync(path.join(out, 'arcgis-parcels-shelby.json'), JSON.stringify({
  displayFieldName: 'PARCELID', fieldAliases: Object.fromEntries(fields.map((f) => [f, f])),
  geometryType: 'esriGeometryPolygon', spatialReference: { wkid: 4326, latestWkid: 4326 },
  fields: fields.map((f) => ({ name: f, type: f === 'OBJECTID' ? 'esriFieldTypeOID' : /YRBLT|SFLA/.test(f) ? 'esriFieldTypeInteger' : 'esriFieldTypeString', alias: f })),
  features: [
    P(B.A, { PARCELID: 'B0158 00A001', OWNER: 'EXAMPLE LOGISTICS LLC', OWNADDR: '100 SAMPLE ST STE 200', OWNCITY: 'MEMPHIS', OWNSTATE: 'TN', OWNZIP: '38103', PAR_ADR: '6100 EXAMPLE RD', LUC: '063', LUC_DESC: 'WAREHOUSE', YRBLT: 1988, SFLA: 41800 }),
    P(B.B, { PARCELID: 'B0158 00A002', OWNER: 'EXAMPLE PLAZA PARTNERS LP', OWNADDR: 'PO BOX 1234', OWNCITY: 'NASHVILLE', OWNSTATE: 'TN', OWNZIP: '37201', PAR_ADR: '6000 STAGE RD', LUC: '052', LUC_DESC: 'SHOPPING CENTER', YRBLT: 2015, SFLA: 25500 }),
    P(B.C, { PARCELID: 'B0158 00A003', OWNER: 'EXAMPLE COMMUNITY CHURCH INC', OWNADDR: '6050 EXAMPLE RD', OWNCITY: 'BARTLETT', OWNSTATE: 'TN', OWNZIP: '38134', PAR_ADR: '6050 EXAMPLE RD', LUC: '081', LUC_DESC: 'CHURCH', YRBLT: 1975, SFLA: 11900 }),
    P(B.F, { PARCELID: 'B0158 00A005', OWNER: 'DOE JANE', OWNADDR: '6070 EXAMPLE RD', OWNCITY: 'BARTLETT', OWNSTATE: 'TN', OWNZIP: '38134', PAR_ADR: '6070 EXAMPLE RD', LUC: '062', LUC_DESC: 'SINGLE FAMILY', YRBLT: 1996, SFLA: 2400 }),
    P(B.H, { PARCELID: 'B0158 00A007', OWNER: 'EXAMPLE APARTMENTS LLC', OWNADDR: '9 SAMPLE AVE', OWNCITY: 'MEMPHIS', OWNSTATE: 'TN', OWNZIP: '38117', PAR_ADR: '5950 EXAMPLE AVE', LUC: '012', LUC_DESC: 'APARTMENTS', YRBLT: 2008, SFLA: 37000 }),
    P(B.E, { PARCELID: 'B0158 00A008', OWNER: 'EXAMPLE SCHOOL DISTRICT', OWNADDR: '160 SAMPLE PLZ', OWNCITY: 'MEMPHIS', OWNSTATE: 'TN', OWNZIP: '38103', PAR_ADR: '5900 EXAMPLE AVE', LUC: '090', LUC_DESC: 'SCHOOL', YRBLT: 1999, SFLA: 48000 })
  ]
}, null, 1));

// Arkansas GIS Office style (lower-case fields), one parcel, for the field-name detection test.
fs.writeFileSync(path.join(out, 'arcgis-parcels-arkansas.json'), JSON.stringify({
  displayFieldName: 'ownername', geometryType: 'esriGeometryPolygon', spatialReference: { wkid: 4326 },
  fields: ['objectid', 'countyid', 'parcelid', 'ownername', 'adrlabel', 'parceltype'].map((n) => ({ name: n, type: 'esriFieldTypeString' })),
  features: [{ attributes: { objectid: 1, countyid: '18', parcelid: '001-01234-000', ownername: 'EXAMPLE FREIGHT INC', adrlabel: '100 EXAMPLE DR', parceltype: 'COMMERCIAL' },
    geometry: { rings: [[[-90.2000, 35.1500], [-90.1980, 35.1500], [-90.1980, 35.1515], [-90.2000, 35.1515], [-90.2000, 35.1500]]] } }]
}, null, 1));

// Memphis permits layer: metadata (?f=json) and a query answer (roof permits in the envelope).
fs.writeFileSync(path.join(out, 'permits-memphis-layer.json'), JSON.stringify({
  currentVersion: 11.3, id: 0, name: 'DPD_Building_Permits', type: 'Feature Layer', geometryType: 'esriGeometryPoint',
  fields: [
    { name: 'OBJECTID', type: 'esriFieldTypeOID' }, { name: 'Permit_Number', type: 'esriFieldTypeString' },
    { name: 'Issued_Date', type: 'esriFieldTypeDate' }, { name: 'Permit_Type', type: 'esriFieldTypeString' },
    { name: 'Work_Description', type: 'esriFieldTypeString' }, { name: 'Address', type: 'esriFieldTypeString' },
    { name: 'Valuation', type: 'esriFieldTypeDouble' }, { name: 'Zip', type: 'esriFieldTypeString' }
  ],
  maxRecordCount: 2000
}, null, 1));
const bc = pt(450, 50);   // inside the retail building
fs.writeFileSync(path.join(out, 'permits-memphis-query.json'), JSON.stringify({
  objectIdFieldName: 'OBJECTID', geometryType: 'esriGeometryPoint', spatialReference: { wkid: 4326 },
  features: [
    { attributes: { Permit_Number: 'BLDC-2023-01234', Issued_Date: Date.UTC(2023, 3, 11), Permit_Type: 'COM-ALT', Work_Description: 'REROOF - TEAR OFF AND INSTALL 60 MIL TPO', Address: '6000 STAGE RD' }, geometry: { x: bc[1], y: bc[0] } },
    { attributes: { Permit_Number: 'BLDC-2022-04567', Issued_Date: Date.UTC(2022, 8, 1), Permit_Type: 'COM-ALT', Work_Description: 'ROOF REPAIR AT GYM', Address: '5900 Example Avenue' }, geometry: null },
    { attributes: { Permit_Number: 'BLDC-2024-09999', Issued_Date: Date.UTC(2024, 1, 2), Permit_Type: 'COM-ALT', Work_Description: 'REROOF', Address: '1 ELSEWHERE ST' }, geometry: { x: -89.8300, y: 35.2190 } }
  ]
}, null, 1));

// NOAA SPC daily hail CSV for 2026-10-10 (Time UTC, Size in 1/100 inch).
fs.writeFileSync(path.join(out, 'spc-261010_rpts_filtered_hail.csv'), [
  'Time,Size,Location,County,State,Lat,Lon,Comments',
  '2015,125,1 NE BARTLETT,SHELBY,TN,35.2150,-89.8400,HALF DOLLAR SIZE HAIL, REPORTED BY PUBLIC. (MEG)',
  '2140,075,2 W COLLIERVILLE,SHELBY,TN,35.0420,-89.7000,(MEG)',
  '0930,100,3 S SOUTHAVEN,DESOTO,MS,34.9450,-90.0100,QUARTER SIZE HAIL. TIME ESTIMATED FROM RADAR. (MEG)',
  '2300,175,5 N WICHITA,SEDGWICK,KS,37.7600,-97.3300,(ICT)',
  ''
].join('\n'));

fs.writeFileSync(path.join(out, 'README.md'), [
  '# RoofScout area scan test fixtures',
  '',
  'CONSTRUCTED, not downloaded: the build sandbox could not reach overpass-api.de, the county',
  'ArcGIS servers, maps.memphistn.gov or www.spc.noaa.gov (proxy 403 / DNS). Each file follows the',
  'documented response format of its service, and is regenerated by `build-fixtures.js`.',
  'Geometry is exact (buildings laid out in feet from 35.2050, -89.8450 in Bartlett TN), so the',
  'tests can check the area math. Owner names and addresses are fictional ("EXAMPLE …", "SAMPLE …").',
  '',
  '| File | Format |',
  '|---|---|',
  '| `overpass-bartlett.json` | Overpass API `[out:json]` with `out tags geom` (ways + a multipolygon relation split into 2 outer ways + 1 inner) |',
  '| `arcgis-parcels-shelby.json` | ArcGIS REST `query` (`f=json`, `outSR=4326`, polygon rings as [x, y]), Shelby-style field names |',
  '| `arcgis-parcels-arkansas.json` | Same, Arkansas GIS Office lower-case fields (`parcelid`, `ownername`, `adrlabel`, `parceltype`) |',
  '| `permits-memphis-layer.json` | ArcGIS layer metadata (`…/FeatureServer/0?f=json`): fields incl. `Issued_Date` (date), `Work_Description` |',
  '| `permits-memphis-query.json` | ArcGIS `query` answer: point permits (dates as epoch ms), one with no geometry (address match) |',
  '| `spc-261010_rpts_filtered_hail.csv` | SPC daily hail CSV: `Time,Size,Location,County,State,Lat,Lon,Comments` (comma inside a comment; a next-morning report; an out-of-region report) |',
  '',
  'Expected footprint areas (ft²): warehouse w1001 42,000 · retail L w1002 26,000 · church w1003 12,000 ·',
  'house w1004 2,000 · barn on single-family lot w1005 12,000 · office w1006 9,900 · apartments w1007 12,600 ·',
  'school r2001 52,000 − 3,000 courtyard = 49,000.',
  ''
].join('\n'));
console.log('fixtures written to', out);
