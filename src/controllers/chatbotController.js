const User = require('../models/User');
const Grievance = require('../models/Grievance');
const WelfareScheme = require('../models/WelfareScheme');
const WelfareApplication = require('../models/WelfareApplication');
const CouncillorProfile = require('../models/CouncillorProfile');
const PresidentProfile = require('../models/PresidentProfile');

// AI Chatbot Controller
exports.chatWithBot = async (req, res) => {
  try {
    const { message, userId, ward } = req.body;
    
    if (!message || !userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Message and userId are required' 
      });
    }

    // Get user information
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Get ward-specific data
    const userWard = ward || user.ward || 1;
    
    // Fetch relevant data based on the message
    const wardData = await getWardData(userWard);
    const userData = await getUserData(userId);
    
    // Generate AI response
    const response = await generateAIResponse(message, wardData, userData, user);
    
    res.json({ 
      success: true, 
      response: response.text,
      suggestions: response.suggestions || [],
      data: response.data || null
    });
    
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process chatbot request' 
    });
  }
};

// Get comprehensive ward data
async function getWardData(ward) {
  try {
    const [
      grievances,
      welfareSchemes,
      welfareApplications,
      councillor,
      president
    ] = await Promise.all([
      Grievance.find({ ward }).lean(),
      WelfareScheme.find({ ward }).lean(),
      WelfareApplication.find({ ward }).lean(),
      CouncillorProfile.findOne({ ward }).lean(),
      PresidentProfile.findOne().lean()
    ]);

    // Calculate statistics
    const totalGrievances = grievances.length;
    const pendingGrievances = grievances.filter(g => g.status === 'pending').length;
    const resolvedGrievances = grievances.filter(g => g.status === 'resolved').length;
    
    const totalWelfareSchemes = welfareSchemes.length;
    const activeWelfareSchemes = welfareSchemes.filter(s => s.status === 'active').length;
    
    const totalApplications = welfareApplications.length;
    const approvedApplications = welfareApplications.filter(a => a.status === 'approved').length;
    const pendingApplications = welfareApplications.filter(a => a.status === 'pending').length;

    return {
      ward,
      councillor: councillor ? {
        name: councillor.name,
        email: councillor.email,
        contactNumber: councillor.contactNumber,
        address: councillor.address
      } : null,
      president: president ? {
        name: president.name,
        email: president.email,
        contactNumber: president.contactNumber
      } : null,
      grievances: {
        total: totalGrievances,
        pending: pendingGrievances,
        resolved: resolvedGrievances,
        recent: grievances.slice(0, 5).map(g => ({
          title: g.title,
          status: g.status,
          createdAt: g.createdAt
        }))
      },
      welfare: {
        schemes: {
          total: totalWelfareSchemes,
          active: activeWelfareSchemes,
          list: welfareSchemes.slice(0, 5).map(s => ({
            name: s.name,
            description: s.description,
            status: s.status
          }))
        },
        applications: {
          total: totalApplications,
          approved: approvedApplications,
          pending: pendingApplications
        }
      }
    };
  } catch (error) {
    console.error('Error fetching ward data:', error);
    return { ward, error: 'Failed to fetch ward data' };
  }
}

// Get user-specific data
async function getUserData(userId) {
  try {
    const [
      userGrievances,
      userWelfareApplications
    ] = await Promise.all([
      Grievance.find({ userId }).lean(),
      WelfareApplication.find({ userId }).lean()
    ]);

    return {
      grievances: {
        total: userGrievances.length,
        pending: userGrievances.filter(g => g.status === 'pending').length,
        resolved: userGrievances.filter(g => g.status === 'resolved').length
      },
      welfareApplications: {
        total: userWelfareApplications.length,
        approved: userWelfareApplications.filter(a => a.status === 'approved').length,
        pending: userWelfareApplications.filter(a => a.status === 'pending').length
      }
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { error: 'Failed to fetch user data' };
  }
}

// Generate AI response based on message and data
async function generateAIResponse(message, wardData, userData, user) {
  const lowerMessage = message.toLowerCase();
  
  // Greeting responses
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return {
      text: `Hello ${user.name}! I'm your AI assistant for Erumeli Panchayath. I can help you with information about your ward, grievances, welfare schemes, and more. How can I assist you today?`,
      suggestions: [
        'Tell me about my ward',
        'Check my grievances',
        'View welfare schemes',
        'Contact my councillor'
      ]
    };
  }

  // Ward information
  if (lowerMessage.includes('ward') || lowerMessage.includes('my ward')) {
    const councillorInfo = wardData.councillor ? 
      `Your ward councillor is ${wardData.councillor.name}. Contact: ${wardData.councillor.contactNumber || 'Not available'}` : 
      'Councillor information not available';
    
    return {
      text: `You are in Ward ${wardData.ward}. ${councillorInfo}. Your ward has ${wardData.grievances.total} total grievances (${wardData.grievances.pending} pending, ${wardData.grievances.resolved} resolved) and ${wardData.welfare.schemes.total} welfare schemes.`,
      data: wardData,
      suggestions: [
        'View recent grievances',
        'Check welfare schemes',
        'Contact councillor',
        'Submit new grievance'
      ]
    };
  }

  // Grievances
  if (lowerMessage.includes('grievance') || lowerMessage.includes('complaint')) {
    if (lowerMessage.includes('my') || lowerMessage.includes('personal')) {
      return {
        text: `You have ${userData.grievances.total} grievances in total. ${userData.grievances.pending} are pending and ${userData.grievances.resolved} have been resolved.`,
        data: userData.grievances,
        suggestions: [
          'Submit new grievance',
          'View all my grievances',
          'Check ward grievances'
        ]
      };
    } else {
      return {
        text: `Ward ${wardData.ward} has ${wardData.grievances.total} total grievances. ${wardData.grievances.pending} are pending and ${wardData.grievances.resolved} have been resolved.`,
        data: wardData.grievances,
        suggestions: [
          'View recent grievances',
          'Submit new grievance',
          'Check my grievances'
        ]
      };
    }
  }

  // Welfare schemes
  if (lowerMessage.includes('welfare') || lowerMessage.includes('scheme')) {
    return {
      text: `There are ${wardData.welfare.schemes.total} welfare schemes in your ward, with ${wardData.welfare.schemes.active} currently active. You have ${userData.welfareApplications.total} applications (${userData.welfareApplications.approved} approved, ${userData.welfareApplications.pending} pending).`,
      data: wardData.welfare,
      suggestions: [
        'View available schemes',
        'Check my applications',
        'Apply for welfare scheme'
      ]
    };
  }

  // Contact information
  if (lowerMessage.includes('contact') || lowerMessage.includes('councillor')) {
    if (wardData.councillor) {
      return {
        text: `Your ward councillor is ${wardData.councillor.name}. ${wardData.councillor.contactNumber ? `Contact number: ${wardData.councillor.contactNumber}` : 'Contact number not available'}. ${wardData.councillor.email ? `Email: ${wardData.councillor.email}` : ''}`,
        data: wardData.councillor,
        suggestions: [
          'Send message to councillor',
          'View councillor profile',
          'Contact president'
        ]
      };
    } else {
      return {
        text: 'Councillor information is not available for your ward. Please contact the panchayath office for assistance.',
        suggestions: [
          'Contact president',
          'Visit panchayath office',
          'Submit grievance'
        ]
      };
    }
  }

  // President information
  if (lowerMessage.includes('president')) {
    if (wardData.president) {
      return {
        text: `The President of Erumeli Panchayath is ${wardData.president.name}. ${wardData.president.contactNumber ? `Contact: ${wardData.president.contactNumber}` : 'Contact information not available'}.`,
        data: wardData.president,
        suggestions: [
          'Contact president',
          'View announcements',
          'Check events'
        ]
      };
    } else {
      return {
        text: 'President information is not available. Please contact the panchayath office for assistance.',
        suggestions: [
          'Contact panchayath office',
          'Submit grievance',
          'View announcements'
        ]
      };
    }
  }

  // Help
  if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
    return {
      text: 'I can help you with information about your ward, grievances, welfare schemes, councillor details, and more. You can ask me about:',
      suggestions: [
        'My ward information',
        'My grievances',
        'Welfare schemes',
        'Contact councillor',
        'President information',
        'Recent announcements'
      ]
    };
  }

  // Default response
  return {
    text: "I understand you're asking about something, but I'm not sure how to help with that specific question. Could you try asking about your ward, grievances, welfare schemes, or councillor information?",
    suggestions: [
      'Tell me about my ward',
      'Check my grievances',
      'View welfare schemes',
      'Contact my councillor',
      'Help me'
    ]
  };
}