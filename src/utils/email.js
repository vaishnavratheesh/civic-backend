const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

let transporter;
let sendGridConfigured = false;

// Configure SendGrid
function configureSendGrid() {
  if (process.env.SENDGRID_API_KEY && !sendGridConfigured) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    sendGridConfigured = true;
    console.log('SendGrid configured successfully');
  }
}

async function getTransporter() {
  if (transporter) return transporter;
  
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
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

// SendGrid email sending function
async function sendEmailWithSendGrid(to, subject, html, text = null) {
  try {
    configureSendGrid();
    
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SendGrid not configured - SENDGRID_API_KEY missing');
    }
    
    if (!sendGridConfigured) {
      throw new Error('SendGrid configuration failed');
    }
    
    const emailFrom = process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
    
    const msg = {
      to,
      from: emailFrom,
      subject,
      html,
      text: text || undefined
    };
    
    const result = await sgMail.send(msg);
    console.log('Email sent successfully via SendGrid:', result[0].statusCode);
    return true;
  } catch (error) {
    console.error('Error sending email via SendGrid:', error);
    return false;
  }
}

// NodeMailer email sending function
async function sendEmailWithNodeMailer(to, subject, html, text = null) {
  try {
    const emailTransporter = await getTransporter();
    
    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: emailFrom,
      to,
      subject,
      html,
      text: text || undefined
    };

    const result = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully via NodeMailer:', result.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email via NodeMailer:', error);
    return false;
  }
}

// Main email sending function with fallback
async function sendEmailWithFallback(to, subject, html, text = null) {
  // Try NodeMailer first
  const nodeMailerSuccess = await sendEmailWithNodeMailer(to, subject, html, text);
  
  if (nodeMailerSuccess) {
    return true;
  }
  
  // If NodeMailer fails, try SendGrid
  console.log('NodeMailer failed, trying SendGrid fallback...');
  const sendGridSuccess = await sendEmailWithSendGrid(to, subject, html, text);
  
  if (sendGridSuccess) {
    console.log('Email sent successfully via SendGrid fallback');
    return true;
  }
  
  console.error('Both NodeMailer and SendGrid failed to send email');
  return false;
}

async function sendOTPEmail(email, otp, name) {
  try {
    const subject = 'Civic+ - Email Verification OTP';
    const html = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to Civic+!</h2>
      <p>Dear ${name},</p>
      <p>Thank you for registering with Civic+. To complete your registration, please verify your email address using the OTP below:</p>
      <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
        <h1 style="color: #2563eb; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
      </div>
      <p>This OTP is valid for 10 minutes only.</p>
      <p>If you didn't request this registration, please ignore this email.</p>
      <hr style="margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">Best regards,<br>Civic+ Team</p>
    </div>`;
    
    return await sendEmailWithFallback(email, subject, html);
  } catch (error) {
    console.error('Error in sendOTPEmail:', error);
    return false;
  }
}

async function sendPasswordResetEmail(email, resetLink) {
  try {
    const subject = 'Civic+ - Password Reset Request';
    const html = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Password Reset Request</h2>
      <p>You have requested to reset your password for your Civic+ account.</p>
      <p>Click the link below to reset your password. This link is valid for 1 hour:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
      </div>
      <p>If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
      <hr style="margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">Best regards,<br>Civic+ Team</p>
    </div>`;
    
    return await sendEmailWithFallback(email, subject, html);
  } catch (error) {
    console.error('Error in sendPasswordResetEmail:', error);
    return false;
  }
}

// Generic email sending function with fallback
async function sendEmail(to, subject, html, text = null) {
  try {
    return await sendEmailWithFallback(to, subject, html, text);
  } catch (error) {
    console.error('Error in sendEmail:', error);
    return false;
  }
}

module.exports = { 
  sendOTPEmail, 
  sendPasswordResetEmail, 
  sendEmail
};