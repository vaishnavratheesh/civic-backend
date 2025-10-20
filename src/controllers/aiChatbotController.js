const { GoogleGenerativeAI } = require('@google/generative-ai');
const User = require('../models/User');
const Grievance = require('../models/Grievance');
const WelfareScheme = require('../models/WelfareScheme');
const WelfareApplication = require('../models/WelfareApplication');

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Comprehensive ward and system information
const getWardContext = async (wardNumber, userId) => {
    try {
        // Get ward statistics
        const wardUsers = await User.countDocuments({ ward: wardNumber, isVerified: true });
        const wardGrievances = await Grievance.countDocuments({ ward: wardNumber });
        const activeGrievances = await Grievance.countDocuments({ 
            ward: wardNumber, 
            status: { $in: ['pending', 'in_progress'] } 
        });
        const resolvedGrievances = await Grievance.countDocuments({ 
            ward: wardNumber, 
            status: 'resolved' 
        });

        // Get welfare schemes for the ward
        const welfareSchemes = await WelfareScheme.find({ 
            $or: [
                { ward: wardNumber },
                { scope: 'all_wards' }
            ],
            status: 'active'
        }).select('title description category totalSlots availableSlots applicationDeadline');

        // Get user's applications if userId provided
        let userApplications = [];
        if (userId) {
            userApplications = await WelfareApplication.find({ userId })
                .populate('schemeId', 'title')
                .select('schemeTitle status createdAt score');
        }

        // Get recent grievances (anonymized)
        const recentGrievances = await Grievance.find({ ward: wardNumber })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('issueType status createdAt priorityScore');

        // Get councillor info
        const councillor = await User.findOne({ 
            role: 'councillor', 
            ward: wardNumber 
        }).select('name email contactNumber');

        return {
            wardStats: {
                population: wardUsers,
                totalGrievances: wardGrievances,
                activeGrievances,
                resolvedGrievances,
                resolutionRate: wardGrievances > 0 ? ((resolvedGrievances / wardGrievances) * 100).toFixed(1) : 0
            },
            welfareSchemes: welfareSchemes.map(scheme => ({
                title: scheme.title,
                description: scheme.description,
                category: scheme.category,
                availableSlots: scheme.availableSlots,
                totalSlots: scheme.totalSlots,
                deadline: scheme.applicationDeadline
            })),
            userApplications: userApplications.map(app => ({
                scheme: app.schemeTitle,
                status: app.status,
                appliedDate: app.createdAt,
                score: app.score
            })),
            recentIssues: recentGrievances.map(grievance => ({
                type: grievance.issueType,
                status: grievance.status,
                priority: grievance.priorityScore,
                date: grievance.createdAt
            })),
            councillor: councillor ? {
                name: councillor.name,
                email: councillor.email,
                contact: councillor.contactNumber
            } : null
        };
    } catch (error) {
        console.error('Error getting ward context:', error);
        return null;
    }
};

// Generate comprehensive system prompt
const generateSystemPrompt = (wardContext, wardNumber) => {
    const { wardStats, welfareSchemes, userApplications, recentIssues, councillor } = wardContext;
    
    return `You are an AI assistant for Erumeli Panchayath's digital governance system, specifically helping citizens of Ward ${wardNumber}. 

CURRENT WARD ${wardNumber} INFORMATION:
- Population: ${wardStats.population} registered citizens
- Total Grievances: ${wardStats.totalGrievances}
- Active Issues: ${wardStats.activeGrievances}
- Resolution Rate: ${wardStats.resolutionRate}%
- Ward Councillor: ${councillor ? councillor.name : 'Not assigned'}

AVAILABLE WELFARE SCHEMES:
${welfareSchemes.map(scheme => 
    `- ${scheme.title}: ${scheme.description} (${scheme.availableSlots}/${scheme.totalSlots} slots available)`
).join('\n')}

RECENT WARD ISSUES:
${recentIssues.map(issue => 
    `- ${issue.type} (${issue.status}, Priority: ${issue.priority}/5)`
).join('\n')}

SYSTEM FEATURES YOU CAN HELP WITH:
1. Grievance Management: Submit complaints, track status, upload evidence
2. Welfare Schemes: Apply for schemes, check eligibility, track applications
3. Ward Information: Population, statistics, councillor details
4. E-Sabha: Virtual meetings and democratic participation
5. Announcements & Events: Stay updated with panchayath activities
6. Profile Management: Update details, upload ID proof for verification

GUIDELINES:
- Be helpful, accurate, and official in tone
- Provide specific information when available
- Guide users to appropriate sections of the system
- Mention relevant deadlines and requirements
- Always encourage civic participation
- If you don't have specific information, guide them to contact the councillor or panchayath office

Answer questions about ward services, government schemes, civic processes, and help navigate the digital platform.`;
};

// Chat with AI
const chatWithAI = async (req, res) => {
    try {
        const { message, ward } = req.body;
        const userId = req.user?.id;

        if (!message || !ward) {
            return res.status(400).json({
                success: false,
                message: 'Message and ward are required'
            });
        }

        // Get comprehensive ward context
        const wardContext = await getWardContext(ward, userId);
        
        if (!wardContext) {
            return res.status(500).json({
                success: false,
                message: 'Unable to fetch ward information'
            });
        }

        // If Gemini AI is available, use it
        if (genAI) {
            try {
                const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
                
                const systemPrompt = generateSystemPrompt(wardContext, ward);
                const fullPrompt = `${systemPrompt}\n\nUser Question: ${message}\n\nProvide a helpful, accurate response:`;
                
                const result = await model.generateContent(fullPrompt);
                const response = result.response;
                const aiResponse = response.text();

                return res.json({
                    success: true,
                    response: aiResponse,
                    wardInfo: {
                        population: wardContext.wardStats.population,
                        activeIssues: wardContext.wardStats.activeGrievances,
                        availableSchemes: wardContext.welfareSchemes.length
                    }
                });
            } catch (aiError) {
                console.error('Gemini AI Error:', aiError);
                // Fall through to rule-based response
            }
        }

        // Rule-based fallback responses
        const lowerMessage = message.toLowerCase();
        let response = '';

        if (lowerMessage.includes('population') || lowerMessage.includes('how many people')) {
            response = `Ward ${ward} currently has ${wardContext.wardStats.population} registered citizens in our digital governance system.`;
        }
        else if (lowerMessage.includes('grievance') || lowerMessage.includes('complaint') || lowerMessage.includes('issue')) {
            response = `Ward ${ward} has ${wardContext.wardStats.totalGrievances} total grievances submitted, with ${wardContext.wardStats.activeGrievances} currently being addressed. Our resolution rate is ${wardContext.wardStats.resolutionRate}%. You can submit new grievances through the "My Grievances" section.`;
        }
        else if (lowerMessage.includes('welfare') || lowerMessage.includes('scheme') || lowerMessage.includes('benefit')) {
            if (wardContext.welfareSchemes.length > 0) {
                response = `Currently, there are ${wardContext.welfareSchemes.length} active welfare schemes available for Ward ${ward}:\n\n${wardContext.welfareSchemes.map(scheme => `• ${scheme.title}: ${scheme.description}`).join('\n')}\n\nYou can apply through the "Welfare Schemes" section.`;
            } else {
                response = `There are currently no active welfare schemes for Ward ${ward}. Please check back later or contact your councillor for more information.`;
            }
        }
        else if (lowerMessage.includes('councillor') || lowerMessage.includes('representative')) {
            if (wardContext.councillor) {
                response = `Your Ward ${ward} Councillor is ${wardContext.councillor.name}. You can contact them at ${wardContext.councillor.email}${wardContext.councillor.contact ? ` or ${wardContext.councillor.contact}` : ''}.`;
            } else {
                response = `Councillor information for Ward ${ward} is not currently available. Please contact the panchayath office for assistance.`;
            }
        }
        else if (lowerMessage.includes('garbage') || lowerMessage.includes('waste') || lowerMessage.includes('collection')) {
            response = `Garbage collection in Ward ${ward} typically follows the panchayath schedule. For specific collection days and times, please contact your ward councillor or check the announcements section. Make sure to place bins on the curb by the designated time.`;
        }
        else if (lowerMessage.includes('water') || lowerMessage.includes('supply')) {
            response = `For water supply issues in Ward ${ward}, you can submit a grievance through the "My Grievances" section. Our system will prioritize water-related issues. For emergencies, contact your councillor directly.`;
        }
        else if (lowerMessage.includes('road') || lowerMessage.includes('street')) {
            response = `Road maintenance and street issues in Ward ${ward} can be reported through our grievance system. Include photos and exact location details for faster resolution. Current active road-related issues: ${wardContext.recentIssues.filter(issue => issue.type.toLowerCase().includes('road')).length}.`;
        }
        else if (lowerMessage.includes('application') || lowerMessage.includes('apply')) {
            if (wardContext.userApplications.length > 0) {
                response = `You have ${wardContext.userApplications.length} welfare applications:\n${wardContext.userApplications.map(app => `• ${app.scheme}: ${app.status} (Score: ${app.score}/100)`).join('\n')}\n\nYou can view details in the "Welfare Schemes" section.`;
            } else {
                response = `You haven't submitted any welfare applications yet. Check the "Welfare Schemes" section to see available programs you can apply for.`;
            }
        }
        else if (lowerMessage.includes('meeting') || lowerMessage.includes('sabha') || lowerMessage.includes('e-sabha')) {
            response = `E-Sabha meetings allow you to participate in democratic processes. When the President starts a meeting, you'll see a "Join Sabha Meeting" button. Check the "E-Sabha" section for active meetings.`;
        }
        else if (lowerMessage.includes('help') || lowerMessage.includes('how to') || lowerMessage.includes('guide')) {
            response = `I can help you with:
• Ward information and statistics
• Welfare schemes and applications
• Grievance submission and tracking
• Councillor contact details
• System navigation and features
• E-Sabha participation
• Announcements and events

What specific area would you like help with?`;
        }
        else {
            response = `I'm here to help with Ward ${ward} information and panchayath services. You can ask me about:

📊 Ward statistics and population
🏛️ Welfare schemes and applications  
📝 Grievance submission and tracking
👥 Councillor contact information
🗳️ E-Sabha meetings and participation
📢 Announcements and events
❓ System navigation help

What would you like to know more about?`;
        }

        res.json({
            success: true,
            response,
            wardInfo: {
                population: wardContext.wardStats.population,
                activeIssues: wardContext.wardStats.activeGrievances,
                availableSchemes: wardContext.welfareSchemes.length
            }
        });

    } catch (error) {
        console.error('Chatbot error:', error);
        res.status(500).json({
            success: false,
            message: 'Sorry, I encountered an error. Please try again.',
            error: error.message
        });
    }
};

// Get chat history (for future implementation)
const getChatHistory = async (req, res) => {
    try {
        // This could be implemented to store and retrieve chat history
        res.json({
            success: true,
            history: []
        });
    } catch (error) {
        console.error('Get chat history error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to fetch chat history'
        });
    }
};

module.exports = {
    chatWithAI,
    getChatHistory
};