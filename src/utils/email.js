const nodemailer = require('nodemailer');

let transporter;

async function getTransporter() {
  if (transporter) return transporter;
  
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
  console.log('Creating email transporter with:');
  console.log('EMAIL_USER:', emailUser);
  console.log('EMAIL_PASS:', emailPass ? 'Set (length: ' + emailPass.length + ')' : 'Not set');
  
  if (!emailUser || !emailPass) {
    throw new Error('Email credentials not configured properly');
  }
  
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
  
  // Verify the transporter
  try {
    await transporter.verify();
    console.log('Email transporter verified successfully');
  } catch (error) {
    console.error('Email transporter verification failed:', error);
    throw error;
  }
  
  return transporter;
}

async function sendOTPEmail(email, otp, name) {
  try {
    const emailTransporter = await getTransporter();
    
    console.log('sendOTPEmail called for:', email);
    
    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: emailFrom,
      to: email,
      subject: 'Civic+ - Email Verification OTP',
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to Civic+!</h2>
        <p>Dear ${name},</p>
        <p>Thank you for registering with Civic+. To complete your registration, please verify your email address using the OTP below:</p>
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #2563eb; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>This OTP is valid for 10 minutes only.</p>
        <p>If you didn't request this registration, please ignore this email.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #6b7280; font-size: 14px;">Best regards,<br>Civic+ Team<br><a href="mailto:${emailFrom}">${emailFrom}</a></p>
      </div>`
    };
    
    const result = await emailTransporter.sendMail(mailOptions);
    console.log('OTP email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
}

async function sendPasswordResetEmail(email, resetLink) {
  try {
    const emailTransporter = await getTransporter();
    
    console.log('sendPasswordResetEmail called for:', email);
    
    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: emailFrom,
      to: email,
      subject: 'Civic+ - Password Reset Request',
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>You have requested to reset your password for your Civic+ account.</p>
        <p>Click the link below to reset your password. This link is valid for 1 hour:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #6b7280; font-size: 14px;">Best regards,<br>Civic+ Team<br><a href="mailto:${emailFrom}">${emailFrom}</a></p>
      </div>`
    };
    
    const result = await emailTransporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
}

// Generic email sending function
async function sendEmail(to, subject, html, text = null) {
  try {
    const emailTransporter = await getTransporter();
    
    console.log('sendEmail called for:', to);
    
    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: emailFrom,
      to,
      subject,
      html,
      text: text || undefined
    };

    const result = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

module.exports = { sendOTPEmail, sendPasswordResetEmail, sendEmail };