const mongoose = require('mongoose');
const User = require('./src/models/User');
const Grievance = require('./src/models/Grievance');
const Worker = require('./src/models/Worker');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find councillor
        const councillor = await User.findOne({});
        if (!councillor) return console.log('No user');
        
        // Find worker
        const worker = await Worker.findOne({ isActive: true });
        if (!worker) return console.log('No worker');
        
        // Find pending grievance
        const complaint = await Grievance.findOne({ status: { $in: ['pending', 'Pending'] } });
        if (!complaint) return console.log('No pending complaint');

        // Generate token
        const token = jwt.sign(
            { userId: councillor._id, role: 'councillor', ward: '1' },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '1h' }
        );

        console.log(`Making API call to: http://localhost:3002/api/grievances/${complaint._id}/assign`);
        
        const fetch = (await import('node-fetch')).default;
        
        const res = await fetch(`http://localhost:3002/api/grievances/${complaint._id}/assign`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                workerId: worker._id.toString(),
                assignmentNotes: 'Test Assignment via API'
            })
        });
        
        const text = await res.text();
        console.log('HTTP Status:', res.status);
        console.log('Response Body:', text);
        
    } catch(e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}

run();
