const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const Grievance = require('../models/Grievance');
const { computeCredibility } = require('../utils/credibility');

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const queueName = 'grievance-processing';
const queue = new Queue(queueName, { connection });

async function enqueue(grievanceId) {
  await queue.add('process', { grievanceId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
}

// Worker: placeholder OCR/AI stub
const worker = new Worker(queueName, async job => {
  const { grievanceId } = job.data;
  const g = await Grievance.findById(grievanceId);
  if (!g) return;

  // OCR/AI stub: basic keyword matching for relevance
  const text = `${g.title || ''} ${g.issueType || ''} ${g.description || ''}`.toLowerCase();
  const relevant = /(pothole|road|garbage|waste|sewage|drain|water|streetlight|electric|leak)/.test(text);
  const aiClassification = relevant ? 'CivicIssue' : 'General';

  // Recompute credibility with AI signal
  const updatedCred = computeCredibility({
    geoInside: !!g.geoValid,
    userVerified: true, // assume known; could fetch from user if needed
    uniqueImage: !g.duplicateFlag,
    aiRelevant: relevant,
    goodHistory: true,
  });

  g.aiClassification = aiClassification;
  g.credibilityScore = updatedCred;
  await g.save();
  return true;
}, { connection });

module.exports = { enqueue };

