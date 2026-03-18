const mongoose = require('mongoose');
const Grievance = require('./src/models/Grievance');
const Worker = require('./src/models/Worker');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Find the specific grievance
        // Based on ID ending in 'b4619156'
        const complaints = await Grievance.find({});
        const task = complaints.find(c => c._id.toString().endsWith('b4619156'));

        if (!task) {
            console.log("Task not found! Picking the first pending task.");
            const t = await Grievance.findOne({ status: 'In Progress' });
            if (!t) return console.log("No In Progress task found to test.");
            return runLogic(t);
        }
        
        console.log("Found task:", task._id.toString());
        await runLogic(task);

    } catch(e) {
        console.error("Runtime exception:", e);
    } finally {
        mongoose.disconnect();
    }
}

async function runLogic(task) {
    try {
        const workerId = task.assignedTo.workerId || new mongoose.Types.ObjectId();
        console.log("Worker:", workerId);

        // Update task
        task.status = 'Resolved';
        task.resolvedAt = new Date();
        task.resolutionNotes = 'Test completed by worker';
        
        if (!task.assignedTo.completionPhotos) {
            task.assignedTo.completionPhotos = [];
        }
        task.assignedTo.completionPhotos.push({
            url: `/uploads/test.jpg`,
            type: 'completion_photo',
            uploadedAt: new Date()
        });
        task.assignedTo.completedAt = new Date();

        // Add to action history
        task.actionHistory = task.actionHistory || [];
        task.actionHistory.push({
            action: 'Task completed',
            by: workerId,
            at: new Date(),
            remarks: 'Task completed with photos'
        });

        console.log("About to save...");
        await task.save();
        console.log("Save complete!");

    } catch (error) {
        console.error("COMPLETE ERROR:", error);
    }
}

run();
