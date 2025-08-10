const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'vaishnavratheesh27@gmail.com',
      pass: process.env.EMAIL_PASSWORD || 'temp_password'
    }
  });
  return transporter;
}

async function sendOTPEmail(email, otp, name) {
  const transporter = getTransporter();
  if (!process.env.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD === 'temp_password') {
    console.log('Simulating OTP email...');
    console.log(`To: ${email}`);
    console.log(`OTP: ${otp}`);
    return true;
  }
  const mailOptions = {
    from: 'vaishnavratheesh27@gmail.com',
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
              <p style="color: #6b7280; font-size: 14px;">Best regards,<br>Civic+ Team<br><a href="mailto:vaishnavratheesh27@gmail.com">vaishnavratheesh27@gmail.com</a></p>
    </div>`
  };
  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
}

async function sendPasswordResetEmail(email, resetLink) {
  const transporter = getTransporter();
  if (!process.env.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD === 'temp_password') {
    console.log('Simulating password reset email...');
    console.log(`To: ${email}`);
    console.log(`Reset Link: ${resetLink}`);
    return true;
  }
  const mailOptions = {
    from: 'vaishnavratheesh27@gmail.com',
    to: email,
            subject: 'Civic+ - Password Reset Request',
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Password Reset Request</h2>
      <p>Click the link below to reset your password. This link is valid for 1 hour:</p>
      <a href="${resetLink}" style="color: #2563eb;">Reset Password</a>
      <p>If you did not request this, please ignore this email.</p>
      <hr style="margin: 30px 0;">
              <p style="color: #6b7280; font-size: 14px;">Civic+ Team</p>
    </div>`
  };
  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
}

module.exports = { sendOTPEmail, sendPasswordResetEmail };