const User = require('../models/User');
const PastMember = require('../models/PastMember');
const CouncillorProfile = require('../models/CouncillorProfile');

// List citizens in councillor's ward (and optionally filter by verification)
async function listWardCitizens(req, res) {
  try {
    const ward = req.user.ward;
    const { verified, search, page = 1, limit = 20 } = req.query;
    const filter = { ward, role: 'citizen' };
    if (verified === 'true') filter.isVerified = true;
    if (verified === 'false') filter.isVerified = false;
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [citizens, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      User.countDocuments(filter)
    ]);

    res.json({
      citizens,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (err) {
    console.error('listWardCitizens error:', err);
    res.status(500).json({ error: 'Failed to fetch citizens' });
  }
}

// Verify a citizen (mark isVerified = true) if citizen belongs to this ward
async function verifyCitizen(req, res) {
  try {
    const ward = req.user.ward;
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user || user.role !== 'citizen') {
      return res.status(404).json({ error: 'Citizen not found' });
    }
    if (user.ward !== ward) {
      return res.status(403).json({ error: 'Citizen is not in your ward' });
    }
    // Require ID proof before verification
    if (!user.idProof || !user.idProof.fileUrl) {
      return res.status(400).json({ error: 'Citizen must upload a valid ID proof before verification' });
    }
    user.isVerified = true;
    user.updatedAt = new Date();
    await user.save();
    const result = user.toObject();
    delete result.password;
    res.json({ message: 'Citizen verified successfully', user: result });
  } catch (err) {
    console.error('verifyCitizen error:', err);
    res.status(500).json({ error: 'Failed to verify citizen' });
  }
}

// Remove a citizen with death certificate or relocation reason
async function removeCitizen(req, res) {
  try {
    const ward = req.user.ward;
    const { id } = req.params;
    const { removalReason, removalComments } = req.body;
    
    // Get death certificate file if provided
    const deathCertificateFile = req.files && req.files.deathCertificate && req.files.deathCertificate[0];
    
    const user = await User.findById(id);
    if (!user || user.role !== 'citizen') {
      return res.status(404).json({ error: 'Citizen not found' });
    }
    
    // For death cases, require death certificate
    if (removalReason === 'death' && !deathCertificateFile) {
      return res.status(400).json({ error: 'Death certificate is required for death cases' });
    }
    
    // Get councillor details
    const councillorProfile = await CouncillorProfile.findById(req.user.id);
    if (!councillorProfile) {
      return res.status(404).json({ error: 'Councillor profile not found' });
    }
    
    // Build death certificate URL if provided
    const deathCertificateUrl = deathCertificateFile 
      ? `${req.protocol}://${req.get('host')}/uploads/${deathCertificateFile.filename}` 
      : undefined;
    
    // Create past member record
    const pastMember = new PastMember({
      originalUserId: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      ward: user.ward,
      panchayath: user.panchayath,
      removalReason,
      deathCertificateUrl,
      removalComments,
      removedBy: {
        councillorId: req.user.id,
        councillorName: councillorProfile.name,
        councillorEmail: councillorProfile.email
      },
      originalRegistrationDate: user.createdAt,
      status: removalReason === 'death' ? 'deceased' : 'removed'
    });
    
    await pastMember.save();
    
    // Delete the user from main collection
    await User.findByIdAndDelete(id);
    
    res.json({ 
      message: 'Citizen removed successfully',
      pastMemberId: pastMember._id
    });
  } catch (err) {
    console.error('removeCitizen error:', err);
    res.status(500).json({ error: 'Failed to remove citizen' });
  }
}

module.exports = {
  listWardCitizens,
  verifyCitizen,
  removeCitizen
};

