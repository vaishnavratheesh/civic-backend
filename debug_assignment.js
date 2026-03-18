const mongoose = require('mongoose');
const Grievance = require('./src/models/Grievance');
const Worker = require('./src/models/Worker');
const User = require('./src/models/User');

require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        // Find a pending grievance
        const complaint = await Grievance.findOne({ status: { $in: ['pending', 'Pending'] } });
        if (!complaint) {
            console.log("No pending grievance found");
            return;
        }
        console.log("Found grievance:", complaint._id);

        // Find an available worker
        const worker = await Worker.findOne({ isActive: true });
        if (!worker) {
            console.log("No worker found");
            return;
        }
        console.log("Found worker:", worker._id);

        // Find a councillor user
        const user = await User.findOne({ role: { $in: ['councillor', 'COUNCILLOR'] } });
        if (!user) {
            console.log("No user found");
            return;
        }

        // Simulate logic
        complaint.assignedTo = {
            workerId: worker._id,
            workerName: worker.name,
            workerType: worker.type,
            workerContact: worker.contact,
            assignedBy: user._id, // use _id
            assignedByName: user.name,
            assignedAt: new Date(),
            assignmentNotes: 'Test assignment'
        };

        if (complaint.status === 'Pending' || complaint.status === 'pending') {
            complaint.status = 'Assigned';
        }

        await complaint.save();
        console.log("Successfully saved complaint!");

        worker.assignedTasks = (worker.assignedTasks || 0) + 1;
        if (worker.availability === 'available' && worker.assignedTasks >= 5) {
            worker.availability = 'busy';
        }
        await worker.save();
        console.log("Successfully saved worker!");

    } catch (e) {
        console.error("Error occurred:", e);
    } finally {
        mongoose.disconnect();
    }
}

run();
