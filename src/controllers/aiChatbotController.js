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
    
    return `You are an AI assistant for Erumeli Panchayath's Civic+ Digital Governance Platform, specifically helping citizens of Ward ${wardNumber} in Kerala, India.

PLATFORM OVERVIEW:
Civic+ is a comprehensive digital governance system serving all 15 wards of Erumeli Panchayath. The platform enables transparent, efficient government services including grievance management, welfare scheme administration, democratic participation through E-Sabha meetings, and direct citizen-government communication.

CURRENT WARD ${wardNumber} INFORMATION:
- Population: ${wardStats.population} registered citizens
- Total Grievances: ${wardStats.totalGrievances}
- Active Issues: ${wardStats.activeGrievances}
- Resolution Rate: ${wardStats.resolutionRate}%
- Ward Councillor: ${councillor ? councillor.name : 'Not assigned'}
${councillor ? `- Councillor Contact: ${councillor.email}${councillor.contact ? `, ${councillor.contact}` : ''}` : ''}

AVAILABLE WELFARE SCHEMES:
${welfareSchemes.length > 0 ? welfareSchemes.map(scheme => 
    `- ${scheme.title}: ${scheme.description} (${scheme.availableSlots}/${scheme.totalSlots} slots available)`
).join('\n') : 'No active welfare schemes currently available for this ward.'}

RECENT WARD ISSUES:
${recentIssues.length > 0 ? recentIssues.map(issue => 
    `- ${issue.type} (${issue.status}, Priority: ${issue.priority}/5)`
).join('\n') : 'No recent issues reported in this ward.'}

PLATFORM FEATURES & SERVICES:

1. GRIEVANCE MANAGEMENT SYSTEM:
   - Submit complaints with photo/video evidence and GPS location
   - Categories: Water Supply, Road Infrastructure, Waste Management, Health & Sanitation, Public Facilities
   - AI-powered priority scoring and automatic officer assignment
   - Real-time status tracking: Pending → In Progress → Resolved
   - Video proof request system for additional evidence
   - Community visibility of ward-wide issues

2. WELFARE SCHEME ADMINISTRATION:
   - Councillor-created programs with eligibility criteria
   - Comprehensive application process with income/asset verification
   - AI-powered need assessment scoring (1-100 scale)
   - Categories: Economic Support, Housing Assistance, Education, Healthcare
   - Eligibility factors: Income level (BPL/APL), family size, employment, assets, social category
   - Slot-based allocation with transparent selection process

3. DEMOCRATIC PARTICIPATION:
   - E-Sabha virtual meetings initiated by Panchayath President
   - Real-time citizen participation in governance decisions
   - Official announcements and event notifications
   - Calendar integration for important dates

4. CITIZEN SERVICES:
   - Profile management with ID proof verification (Aadhar, Voter ID, etc.)
   - Ward-specific information and statistics
   - Direct communication with elected representatives
   - Document generation and download (application PDFs, certificates)

5. ADMINISTRATIVE TRANSPARENCY:
   - Public access to ward statistics and performance metrics
   - Grievance resolution tracking and accountability
   - Welfare scheme allocation transparency
   - Government decision-making process visibility

COMMON CITIZEN QUERIES & GUIDANCE:

Welfare Schemes:
- Check "Welfare Schemes" tab for available programs
- Eligibility based on income, family size, employment status, assets
- Application requires personal details, income proof, family information
- Scoring considers need level, social category, and compliance factors
- Track application status and download PDF copies

Grievance Submission:
- Use "My Grievances" tab to report issues
- Include clear photos and exact location details
- Select appropriate category for faster resolution
- Track progress and receive updates via notifications
- Upload additional evidence if requested by officials

Ward Information:
- Population and demographic statistics
- Councillor contact details and office hours
- Recent issue resolution performance
- Upcoming events and announcements

E-Sabha Participation:
- Join virtual meetings when President starts session
- Participate in democratic decision-making
- Stay informed about governance decisions
- Access meeting recordings and minutes

System Navigation:
- Dashboard provides overview of all services
- Tab-based navigation for different functions
- Real-time notifications for important updates
- Help section for detailed guidance

RESPONSE GUIDELINES:
- Provide accurate, helpful information in a respectful, official tone
- Use specific data when available from the ward context
- Guide users to appropriate platform sections
- Mention relevant deadlines, requirements, and procedures
- Encourage active civic participation and engagement
- For technical issues, suggest contacting councillor or panchayath office
- Always maintain transparency about government processes
- Respect citizen privacy and data protection

KERALA GOVERNMENT CONTEXT:
- Understand local governance structure (Panchayath → Block → District → State)
- Familiar with Kerala's digital governance initiatives
- Aware of state welfare schemes and their local implementation
- Recognize cultural and linguistic context of Kerala citizens
- Understand rural and semi-urban challenges in digital adoption

Answer questions about ward services, government schemes, civic processes, platform navigation, and help citizens effectively engage with their local government through this digital platform.`;
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

        // Enhanced rule-based fallback responses
        const lowerMessage = message.toLowerCase();
        let response = '';

        if (lowerMessage.includes('population') || lowerMessage.includes('how many people') || lowerMessage.includes('citizens')) {
            response = `Ward ${ward} currently has ${wardContext.wardStats.population} registered citizens in the Civic+ digital governance system. This represents verified users who have completed the registration and ID proof verification process.`;
        }
        else if (lowerMessage.includes('grievance') || lowerMessage.includes('complaint') || lowerMessage.includes('issue') || lowerMessage.includes('problem')) {
            const activeIssues = wardContext.recentIssues.filter(issue => ['pending', 'in_progress'].includes(issue.status)).length;
            response = `Ward ${ward} Grievance Status:\n\n📊 **Statistics:**\n• Total Grievances: ${wardContext.wardStats.totalGrievances}\n• Currently Active: ${wardContext.wardStats.activeGrievances}\n• Resolution Rate: ${wardContext.wardStats.resolutionRate}%\n\n📝 **To Submit a New Grievance:**\n1. Go to "My Grievances" tab\n2. Click "Submit New Grievance"\n3. Select category (Water, Roads, Waste, etc.)\n4. Add photos and location details\n5. Submit for review\n\n🔍 **Track Status:** Check the same section for updates and officer assignments.`;
        }
        else if (lowerMessage.includes('welfare') || lowerMessage.includes('scheme') || lowerMessage.includes('benefit') || lowerMessage.includes('assistance')) {
            if (wardContext.welfareSchemes.length > 0) {
                response = `Ward ${ward} Welfare Schemes (${wardContext.welfareSchemes.length} active):\n\n${wardContext.welfareSchemes.map(scheme => `🏛️ **${scheme.title}**\n   ${scheme.description}\n   📊 Slots: ${scheme.availableSlots}/${scheme.totalSlots} available\n   📅 Category: ${scheme.category || 'General'}`).join('\n\n')}\n\n📋 **Application Process:**\n1. Go to "Welfare Schemes" tab\n2. Click "Apply Now" on desired scheme\n3. Fill comprehensive application form\n4. Upload required documents\n5. Submit for AI scoring and review\n\n💡 **Eligibility factors:** Income level, family size, employment status, assets, social category, and community participation.`;
            } else {
                response = `Currently, there are no active welfare schemes for Ward ${ward}. \n\n📅 **What to do:**\n• Check back regularly as new schemes are added\n• Contact your councillor for upcoming programs\n• Ensure your profile is verified for faster applications\n\n📞 **Contact:** Your ward councillor can provide information about planned schemes and eligibility requirements.`;
            }
        }
        else if (lowerMessage.includes('councillor') || lowerMessage.includes('representative') || lowerMessage.includes('contact')) {
            if (wardContext.councillor) {
                response = `Ward ${ward} Councillor Information:\n\n👤 **${wardContext.councillor.name}**\n📧 Email: ${wardContext.councillor.email}\n${wardContext.councillor.contact ? `📞 Phone: ${wardContext.councillor.contact}\n` : ''}🕒 Office Hours: Monday-Friday, 9 AM - 5 PM\n\n📋 **Services Provided:**\n• Grievance review and officer assignment\n• Welfare scheme creation and approval\n• Citizen verification and support\n• Ward development planning\n• Community issue resolution\n\n💡 **Best Contact Methods:**\n• Submit grievances through the platform\n• Email for non-urgent matters\n• Phone for emergencies`;
            } else {
                response = `Councillor information for Ward ${ward} is not currently available in the system.\n\n📞 **Alternative Contacts:**\n• Erumeli Panchayath Office\n• Panchayath President\n• Block Development Office\n\n💡 **What you can do:**\n• Submit grievances through the platform\n• Check announcements for councillor updates\n• Contact panchayath office for direct assistance`;
            }
        }
        else if (lowerMessage.includes('garbage') || lowerMessage.includes('waste') || lowerMessage.includes('collection') || lowerMessage.includes('cleaning')) {
            response = `Waste Management in Ward ${ward}:\n\n🗑️ **Garbage Collection:**\n• Schedule varies by area within the ward\n• Typically follows panchayath-wide schedule\n• Place bins on roadside by designated time\n• Separate wet and dry waste as per guidelines\n\n📝 **Report Issues:**\n• Use "My Grievances" → "Waste Management" category\n• Include photos of missed collections or improper disposal\n• Mark exact location for faster response\n\n♻️ **Best Practices:**\n• Segregate waste at source\n• Use biodegradable bags when possible\n• Participate in community cleaning drives\n\n📞 **For Schedule Details:** Contact your ward councillor or check announcements section.`;
        }
        else if (lowerMessage.includes('water') || lowerMessage.includes('supply') || lowerMessage.includes('leak') || lowerMessage.includes('pipe')) {
            response = `Water Supply Services in Ward ${ward}:\n\n💧 **Common Issues & Solutions:**\n• **Supply Interruptions:** Report through grievances with affected area details\n• **Leakage Problems:** Submit with photos and exact location\n• **Quality Concerns:** Include description of issue (taste, color, odor)\n• **New Connections:** Contact councillor for application process\n\n📝 **Report Water Issues:**\n1. Go to "My Grievances"\n2. Select "Water Supply" category\n3. Add photos and GPS location\n4. Describe the specific problem\n5. Submit for priority handling\n\n⚡ **Emergency Contact:** For major leaks or contamination, contact your councillor directly.\n\n💡 **Prevention Tips:** Report minor issues early to prevent major problems.`;
        }
        else if (lowerMessage.includes('road') || lowerMessage.includes('street') || lowerMessage.includes('pothole') || lowerMessage.includes('infrastructure')) {
            const roadIssues = wardContext.recentIssues.filter(issue => issue.type.toLowerCase().includes('road')).length;
            response = `Road & Infrastructure in Ward ${ward}:\n\n🛣️ **Current Status:**\n• Active road-related issues: ${roadIssues}\n• Report potholes, damaged roads, street lights\n• Include exact location and photos for faster resolution\n\n📝 **How to Report:**\n1. "My Grievances" → "Road Infrastructure"\n2. Take clear photos of the problem\n3. Mark precise location on map\n4. Describe safety concerns if any\n5. Submit for engineering review\n\n🚧 **Common Issues:**\n• Potholes and road damage\n• Street light maintenance\n• Drainage problems\n• Sidewalk repairs\n• Traffic safety concerns\n\n⏱️ **Response Time:** Infrastructure issues typically reviewed within 48 hours and prioritized based on safety impact.`;
        }
        else if (lowerMessage.includes('application') || lowerMessage.includes('apply') || lowerMessage.includes('status') || lowerMessage.includes('track')) {
            if (wardContext.userApplications.length > 0) {
                response = `Your Welfare Applications (${wardContext.userApplications.length} total):\n\n${wardContext.userApplications.map(app => `📋 **${app.scheme}**\n   Status: ${app.status.toUpperCase()}\n   Score: ${app.score}/100\n   Applied: ${new Date(app.appliedDate).toLocaleDateString()}`).join('\n\n')}\n\n📊 **Understanding Scores:**\n• 80-100: High priority (likely approval)\n• 60-79: Medium priority (review pending)\n• Below 60: Lower priority (may need additional documentation)\n\n📄 **Actions Available:**\n• View details in "Welfare Schemes" section\n• Download PDF copies of applications\n• Track status changes and notifications\n\n💡 **Tip:** Keep your profile updated for better scoring in future applications.`;
            } else {
                response = `You haven't submitted any welfare applications yet.\n\n📋 **Getting Started:**\n1. Go to "Welfare Schemes" tab\n2. Browse available programs for Ward ${ward}\n3. Check eligibility requirements\n4. Click "Apply Now" on suitable schemes\n5. Complete the comprehensive application form\n\n📝 **Application Requirements:**\n• Personal and family details\n• Income and employment information\n• Asset and property details\n• Supporting documents upload\n• Justification for need\n\n💡 **Tip:** Ensure your profile is verified before applying for faster processing.`;
            }
        }
        else if (lowerMessage.includes('meeting') || lowerMessage.includes('sabha') || lowerMessage.includes('e-sabha') || lowerMessage.includes('democracy')) {
            response = `E-Sabha Democratic Participation:\n\n🗳️ **Virtual Meetings:**\n• Initiated by Panchayath President\n• Citizens join as viewers to observe proceedings\n• Real-time participation in democratic processes\n• Decisions affecting ward development and policies\n\n📅 **How to Join:**\n1. Check "E-Sabha" tab for active meetings\n2. Look for "Join Sabha Meeting" button when live\n3. Click to join via video conference\n4. Participate as observer in democratic process\n\n🔔 **Stay Updated:**\n• Enable notifications for meeting announcements\n• Check "Events" section for scheduled meetings\n• Follow "Announcements" for important decisions\n\n💡 **Democratic Rights:** E-Sabha allows you to witness transparent governance and stay informed about decisions affecting your ward and panchayath.`;
        }
        else if (lowerMessage.includes('help') || lowerMessage.includes('how to') || lowerMessage.includes('guide') || lowerMessage.includes('navigate')) {
            response = `Civic+ Platform Navigation Guide:\n\n🏠 **Dashboard Sections:**\n\n📍 **My Ward:** Population stats, councillor info, AI assistant\n📝 **My Grievances:** Submit and track civic issues\n👥 **Community Grievances:** View ward-wide problems\n🏛️ **Welfare Schemes:** Apply for government assistance\n📢 **Announcements:** Official government communications\n📅 **Events:** Upcoming activities and meetings\n🗳️ **E-Sabha:** Join virtual democratic meetings\n\n🔧 **Key Features:**\n• Real-time notifications and updates\n• GPS location marking for grievances\n• Photo/video evidence upload\n• PDF document generation\n• Direct communication with officials\n\n❓ **Need Specific Help?**\nAsk me about any particular feature, process, or service. I can provide step-by-step guidance for:\n• Submitting grievances\n• Applying for welfare schemes\n• Contacting officials\n• Understanding your ward statistics\n• Participating in E-Sabha meetings`;
        }
        else if (lowerMessage.includes('verification') || lowerMessage.includes('id proof') || lowerMessage.includes('verify') || lowerMessage.includes('document')) {
            response = `Account Verification Process:\n\n🆔 **ID Proof Upload:**\n• Accepted Documents: Aadhar, Voter ID, Driving License, Ration Card, Passport\n• Upload clear, readable images or PDF files\n• Maximum file size: 5MB\n• Councillor reviews and approves verification\n\n✅ **Verification Benefits:**\n• Access to all platform features\n• Ability to submit grievances\n• Welfare scheme applications\n• Priority in government communications\n\n📋 **Upload Process:**\n1. Go to "My Ward" section\n2. Find "Upload ID Proof" area\n3. Select document type\n4. Choose file and upload\n5. Wait for councillor approval\n\n⏱️ **Processing Time:** Typically 2-3 business days for councillor review.\n\n💡 **Tip:** Ensure documents are clear and all details are visible for faster approval.`;
        }
        else {
            response = `Welcome to Civic+ Digital Governance Platform! 🏛️\n\nI'm your AI assistant for Ward ${ward}, Erumeli Panchayath. I can help you with:\n\n📊 **Ward Information:**\n• Population: ${wardContext.wardStats.population} citizens\n• Active Issues: ${wardContext.wardStats.activeGrievances}\n• Resolution Rate: ${wardContext.wardStats.resolutionRate}%\n\n🔧 **Platform Services:**\n🏛️ Welfare schemes and applications\n📝 Grievance submission and tracking\n👥 Councillor contact and communication\n🗳️ E-Sabha meeting participation\n📢 Government announcements and events\n❓ System navigation and help\n\n💬 **Ask Me About:**\n• "How do I submit a grievance?"\n• "What welfare schemes are available?"\n• "Who is my ward councillor?"\n• "How do I join E-Sabha meetings?"\n• "What's my application status?"\n\n🎯 **Quick Actions:**\nType your question in natural language, and I'll provide specific guidance for your needs!`;
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