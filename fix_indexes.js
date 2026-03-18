const mongoose = require('mongoose');
const Worker = require('./src/models/Worker');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");
        
        // Let's drop the workerId_1 index manually
        try {
            await mongoose.connection.collection('workers').dropIndex('workerId_1');
            console.log("Dropped index: workerId_1");
        } catch (e) {
            console.log("No workerId_1 index found, or error dropping it:", e.message);
        }

        // Resync indexes
        await Worker.syncIndexes();
        console.log("Synced all Worker indexes!");

        // Print current indexes
        const indexes = await mongoose.connection.collection('workers').indexes();
        console.log("Current indexes on workers collection:", indexes);

    } catch(e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}

run();
