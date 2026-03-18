const mongoose = require('mongoose');
const Grievance = require('./src/models/Grievance');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Try creating a fake grievance to test the Enums
        const testGrievance = new Grievance({
            userId: new mongoose.Types.ObjectId(),
            userName: 'Test User',
            ward: 1,
            issueType: 'Other',
            description: 'Testing enum validation',
            location: { lat: 10, lng: 76, address: 'Test' },
            status: 'In Progress',
            videoProofRequests: [{
                // Omitting requestedBy and requestedByName, which should be valid now!
                message: 'Test message',
                status: 'pending'
            }]
        });

        const validationError = testGrievance.validateSync();
        if (validationError) {
            console.error("Validation failed natively!", validationError.message);
        } else {
            console.log("Validation Succeeded!");
        }

    } catch(e) {
        console.error("Runtime exception:", e);
    } finally {
        mongoose.disconnect();
    }
}

run();
