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
      console.error('SendGrid API key not found in environment variables');
      throw new Error('SendGrid not configured - SENDGRID_API_KEY missing');
    }
    
    if (!sendGridConfigured) {
      console.error('SendGrid configuration failed');
      throw new Error('SendGrid configuration failed');
    }
    
    const emailFrom = process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
    console.log(`SendGrid: Sending email from ${emailFrom} to ${to}`);
    
    const msg = {
      to,
      from: {
        email: emailFrom,
        name: 'Civic+ Platform'
      },
      subject,
      html,
      text: text || undefined,
      // Add tracking settings
      tracking_settings: {
        click_tracking: {
          enable: false
        },
        open_tracking: {
          enable: false
        }
      },
      // Add reply-to
      reply_to: {
        email: emailFrom,
        name: 'Civic+ Support'
      }
    };
    
    const result = await sgMail.send(msg);
    console.log('Email sent successfully via SendGrid:', result[0].statusCode);
    console.log('SendGrid Message ID:', result[0].headers['x-message-id']);
    return true;
  } catch (error) {
    console.error('Error sending email via SendGrid:');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    
    if (error.response) {
      console.error('SendGrid Response Status:', error.response.status);
      console.error('SendGrid Response Body:', JSON.stringify(error.response.body, null, 2));
    }
    
    return false;
  }
}

// NodeMailer email sending function
async function sendEmailWithNodeMailer(to, subject, html, text = null) {
  try {
    const emailTransporter = await getTransporter();
    
    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const mailOptions = {
      from: {
        name: 'Civic+ Platform',
        address: emailFrom
      },
      to,
      subject,
      html,
      text: text || undefined,
      headers: {
        'X-Mailer': 'Civic+ Platform',
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal'
      }
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
  console.log(`Attempting to send email to: ${to}, subject: ${subject}`);
  
  // In production, try NodeMailer first since SendGrid sender isn't verified
  if (process.env.NODE_ENV === 'production') {
    console.log('Production mode: Trying NodeMailer first...');
    const nodeMailerSuccess = await sendEmailWithNodeMailer(to, subject, html, text);
    
    if (nodeMailerSuccess) {
      console.log('Email sent successfully via NodeMailer');
      return true;
    }
    
    console.log('NodeMailer failed, trying SendGrid fallback...');
    const sendGridSuccess = await sendEmailWithSendGrid(to, subject, html, text);
    
    if (sendGridSuccess) {
      console.log('Email sent successfully via SendGrid fallback');
      return true;
    }
  } else {
    // In development, try SendGrid first
    console.log('Development mode: Trying SendGrid first...');
    const sendGridSuccess = await sendEmailWithSendGrid(to, subject, html, text);
    
    if (sendGridSuccess) {
      console.log('Email sent successfully via SendGrid');
      return true;
    }
    
    console.log('SendGrid failed, trying NodeMailer fallback...');
    const nodeMailerSuccess = await sendEmailWithNodeMailer(to, subject, html, text);
    
    if (nodeMailerSuccess) {
      console.log('Email sent successfully via NodeMailer fallback');
      return true;
    }
  }
  
  console.error('Both email services failed to send email');
  return false;
}

async function sendOTPEmail(email, otp, name) {
  try {
    const subject = 'Your Civic+ Email Verification Code';
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4;">
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: white; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #2563eb;">
      <h1 style="color: #2563eb; margin: 0;">Civic+</h1>
      <p style="color: #6b7280; margin: 5px 0;">Erumeli Panchayath Digital Platform</p>
    </div>
    
    <div style="padding: 30px 0;">
      <h2 style="color: #1f2937;">Email Verification Required</h2>
      <p>Hello ${name},</p>
      <p>Thank you for registering with Civic+. Please use the verification code below to complete your account setup:</p>
      
      <div style="background-color: #f8fafc; border: 2px solid #e5e7eb; padding: 25px; text-align: center; margin: 25px 0; border-radius: 8px;">
        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your verification code:</p>
        <h1 style="color: #2563eb; font-size: 36px; margin: 0; letter-spacing: 8px; font-weight: bold;">${otp}</h1>
      </div>
      
      <p><strong>Important:</strong> This code expires in 10 minutes for security reasons.</p>
      <p>If you did not create an account with Civic+, please ignore this email.</p>
    </div>
    
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">
        Best regards,<br>
        <strong>Civic+ Team</strong><br>
        Erumeli Panchayath
      </p>
    </div>
  </div>
</body>
</html>`;

    const textVersion = `
Hello ${name},

Thank you for registering with Civic+. Please use this verification code to complete your account setup:

Verification Code: ${otp}

This code expires in 10 minutes for security reasons.

If you did not create an account with Civic+, please ignore this email.

Best regards,
Civic+ Team
Erumeli Panchayath
    `;
    
    return await sendEmailWithFallback(email, subject, html, textVersion);
  } catch (error) {
    console.error('Error in sendOTPEmail:', error);
    return false;
  }
}

async function sendPasswordResetEmail(email, resetLink) {
  try {
    const subject = 'Reset Your Civic+ Password';
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4;">
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: white; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #2563eb;">
      <h1 style="color: #2563eb; margin: 0;">Civic+</h1>
      <p style="color: #6b7280; margin: 5px 0;">Erumeli Panchayath Digital Platform</p>
    </div>
    
    <div style="padding: 30px 0;">
      <h2 style="color: #1f2937;">Password Reset Request</h2>
      <p>We received a request to reset your Civic+ account password.</p>
      <p>Click the button below to create a new password. This link will expire in 1 hour for security:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Reset My Password</a>
      </div>
      
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #2563eb;">${resetLink}</p>
      
      <p><strong>Security Notice:</strong> If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
    </div>
    
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">
        Best regards,<br>
        <strong>Civic+ Team</strong><br>
        Erumeli Panchayath
      </p>
    </div>
  </div>
</body>
</html>`;

    const textVersion = `
Password Reset Request

We received a request to reset your Civic+ account password.

Reset your password by visiting this link: ${resetLink}

This link will expire in 1 hour for security.

If you did not request this password reset, please ignore this email. Your password will remain unchanged.

Best regards,
Civic+ Team
Erumeli Panchayath
    `;
    
    return await sendEmailWithFallback(email, subject, html, textVersion);
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