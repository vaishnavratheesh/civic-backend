const crypto = require('crypto');
const exifr = require('exifr');
const fs = require('fs');
const turf = require('@turf/turf');
const Grievance = require('../models/Grievance');

// Load ward polygons from a JSON file or DB; for now assume a static file path
let wardPolygons = null;
function loadWardPolygonsOnce() {
  if (wardPolygons) return wardPolygons;
  try {
    const json = fs.readFileSync(process.env.WARD_GEOJSON_PATH || 'backend/src/config/wards.geo.json', 'utf8');
    wardPolygons = JSON.parse(json);
  } catch (e) {
    wardPolygons = null;
  }
  return wardPolygons;
}

function isPointInsideWard({ lat, lng, ward }) {
  const geo = loadWardPolygonsOnce();
  if (!geo || !geo.features) return { inside: true, wardName: null }; // default true if not configured
  const point = turf.point([lng, lat]);
  for (const feature of geo.features) {
    const wardNum = feature.properties && (feature.properties.ward || feature.properties.WARD || feature.properties.ward_no);
    if (parseInt(wardNum) !== parseInt(ward)) continue;
    if (turf.booleanPointInPolygon(point, feature)) {
      return { inside: true, wardName: feature.properties && feature.properties.name };
    }
  }
  return { inside: false, wardName: null };
}

function getWardByPoint({ lat, lng }) {
  const geo = loadWardPolygonsOnce();
  if (!geo || !geo.features) return { ward: null, name: null };
  const point = turf.point([lng, lat]);
  for (const feature of geo.features) {
    if (turf.booleanPointInPolygon(point, feature)) {
      const wardNum = feature.properties && (feature.properties.ward || feature.properties.WARD || feature.properties.ward_no);
      const name = feature.properties && (feature.properties.name || feature.properties.WARD_NAME || feature.properties.NAME);
      return { ward: wardNum ? parseInt(wardNum) : null, name: name || null };
    }
  }
  return { ward: null, name: null };
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readExifCaptureTime(filePath) {
  try {
    const exif = await exifr.parse(filePath);
    const dt = exif && (exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate);
    return dt ? new Date(dt) : null;
  } catch (e) {
    return null;
  }
}

async function checkDuplicate({ description, lat, lng, hashes, radiusMeters = 150, lookbackHours = 72 }) {
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const candidates = await Grievance.find({
    createdAt: { $gte: since },
    'location.lat': { $gte: lat - 0.02, $lte: lat + 0.02 },
    'location.lng': { $gte: lng - 0.02, $lte: lng + 0.02 },
  }).select('description location imageHashes').lean();

  const text = (description || '').toLowerCase();
  const pt = turf.point([lng, lat]);
  const kmRadius = radiusMeters / 1000;
  for (const c of candidates) {
    if (Array.isArray(c.imageHashes) && hashes.some(h => c.imageHashes.includes(h))) return true;
    const cText = (c.description || '').toLowerCase();
    const similarText = cText && text && (cText.includes(text) || text.includes(cText));
    const distKm = turf.distance(pt, turf.point([c.location.lng, c.location.lat]), { units: 'kilometers' });
    if (similarText && distKm <= kmRadius) return true;
  }
  return false;
}

async function checkRateLimit({ userId, maxPer24h = parseInt(process.env.GRIEVANCES_PER_24H || '3') }) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const count = await Grievance.countDocuments({ userId, createdAt: { $gte: since } });
  return count < maxPer24h;
}

function computeCredibility({ geoInside, userVerified, uniqueImage, aiRelevant, goodHistory }) {
  const weight = {
    geo: 0.30,
    verified: 0.25,
    unique: 0.20,
    ai: 0.15,
    history: 0.10,
  };
  const score = (geoInside ? weight.geo : 0)
    + (userVerified ? weight.verified : 0)
    + (uniqueImage ? weight.unique : 0)
    + (aiRelevant ? weight.ai : 0)
    + (goodHistory ? weight.history : 0);
  return Math.max(0, Math.min(1, score));
}

module.exports = {
  isPointInsideWard,
  getWardByPoint,
  sha256File,
  readExifCaptureTime,
  checkDuplicate,
  checkRateLimit,
  computeCredibility,
};

