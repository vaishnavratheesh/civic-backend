const config = require('../config/config');

const getCouncillorCredentialsTemplate = (name, wardNumber, email, password) => {
  return {
    subject: 'Civic+ Councillor Login Access - Ward ' + wardNumber,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Councillor Login Credentials</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏛️ Civic+ Platform</h1>
            <h2>Ward ${wardNumber} Councillor Access</h2>
          </div>
          <div class="content">
            <h3>Hello ${name},</h3>
            <p>You have been assigned as the <strong>Ward ${wardNumber} Councillor</strong> for Erumeli Panchayath. Your login credentials for the Civic+ platform are provided below:</p>
            
            <div class="credentials">
              <h4>🔐 Login Credentials</h4>
              <p><strong>Login URL:</strong> <a href="${config.FRONTEND_URL || 'http://localhost:5173'}/#/login">${config.FRONTEND_URL || 'http://localhost:5173'}/#/login</a></p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code></p>
            </div>

            <div class="warning">
              <h4>⚠️ Important Security Notice</h4>
              <ul>
                <li>Please change your password immediately after your first login</li>
                <li>Do not share these credentials with anyone</li>
                <li>Keep your login information secure</li>
                <li>Contact the admin if you face any login issues</li>
              </ul>
            </div>

            <a href="${config.FRONTEND_URL || 'http://localhost:5173'}/#/login" class="button">Login to Civic+ Platform</a>

            <h4>📋 Your Responsibilities</h4>
            <ul>
              <li>Manage Ward ${wardNumber} citizen complaints and grievances</li>
              <li>Review and approve welfare scheme applications</li>
              <li>Communicate with ward residents</li>
              <li>Participate in panchayath meetings and decisions</li>
            </ul>

            <p>If you have any questions or need assistance, please contact the system administrator.</p>
            
            <p>Best regards,<br>
            <strong>Erumeli Panchayath Administration</strong><br>
            Civic+ Digital Platform</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Civic+ Platform. Please do not reply to this email.</p>
            <p>© 2024 Erumeli Panchayath. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Hello ${name},

You have been assigned as Ward ${wardNumber} Councillor for Erumeli Panchayath.

Login Details:
- URL: ${config.FRONTEND_URL || 'http://localhost:5173'}/#/login
- Email: ${email}
- Temporary Password: ${password}

IMPORTANT: Please change your password after first login.

Best regards,
Erumeli Panchayath Administration
    `
  };
};

const getPresidentCredentialsTemplate = (name, email, password) => {
  return {
    subject: 'Civic+ President Login Access - Erumeli Panchayath',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>President Login Credentials</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed; }
          .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏛️ Civic+ Platform</h1>
            <h2>Panchayath President Access</h2>
          </div>
          <div class="content">
            <h3>Hello ${name},</h3>
            <p>You have been assigned as the <strong>Panchayath President</strong> for Erumeli Panchayath. Your login credentials for the Civic+ platform are provided below:</p>
            
            <div class="credentials">
              <h4>🔐 Login Credentials</h4>
              <p><strong>Login URL:</strong> <a href="${config.FRONTEND_URL || 'http://localhost:5173'}/#/login">${config.FRONTEND_URL || 'http://localhost:5173'}/#/login</a></p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code></p>
            </div>

            <div class="warning">
              <h4>⚠️ Important Security Notice</h4>
              <ul>
                <li>Please change your password immediately after your first login</li>
                <li>Do not share these credentials with anyone</li>
                <li>Keep your login information secure</li>
                <li>Contact the admin if you face any login issues</li>
              </ul>
            </div>

            <a href="${config.FRONTEND_URL || 'http://localhost:5173'}/#/login" class="button">Login to Civic+ Platform</a>

            <h4>📋 Your Responsibilities</h4>
            <ul>
              <li>Oversee all 23 wards and their councillors</li>
              <li>Review panchayath-wide policies and decisions</li>
              <li>Conduct and manage panchayath meetings</li>
              <li>Coordinate with government officials and departments</li>
              <li>Monitor overall panchayath development and welfare schemes</li>
            </ul>

            <p>If you have any questions or need assistance, please contact the system administrator.</p>
            
            <p>Best regards,<br>
            <strong>Erumeli Panchayath Administration</strong><br>
            Civic+ Digital Platform</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Civic+ Platform. Please do not reply to this email.</p>
            <p>© 2024 Erumeli Panchayath. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Hello ${name},

You have been assigned as Panchayath President for Erumeli Panchayath.

Login Details:
- URL: ${config.FRONTEND_URL || 'http://localhost:5173'}/#/login
- Email: ${email}
- Temporary Password: ${password}

IMPORTANT: Please change your password after first login.

Best regards,
Erumeli Panchayath Administration
    `
  };
};

const getCredentialsRevokedTemplate = (name, role, wardNumber = null) => {
  const roleTitle = role === 'president' ? 'Panchayath President' : `Ward ${wardNumber} Councillor`;
  
  return {
    subject: `Civic+ Access Revoked - ${roleTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Revoked</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .notice { background: #fee2e2; border: 1px solid #dc2626; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏛️ Civic+ Platform</h1>
            <h2>Access Revoked</h2>
          </div>
          <div class="content">
            <h3>Hello ${name},</h3>
            
            <div class="notice">
              <h4>🚫 Access Revoked</h4>
              <p>Your access to the Civic+ platform as <strong>${roleTitle}</strong> has been revoked by the system administrator.</p>
            </div>

            <p>This means:</p>
            <ul>
              <li>You can no longer log in to the Civic+ platform</li>
              <li>All your active sessions have been terminated</li>
              <li>Your role and responsibilities have been transferred</li>
            </ul>

            <p>If you believe this is an error or have questions about this change, please contact the system administrator.</p>
            
            <p>Thank you for your service to Erumeli Panchayath.</p>
            
            <p>Best regards,<br>
            <strong>Erumeli Panchayath Administration</strong><br>
            Civic+ Digital Platform</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Civic+ Platform. Please do not reply to this email.</p>
            <p>© 2024 Erumeli Panchayath. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Hello ${name},

Your access to the Civic+ platform as ${roleTitle} has been revoked by the system administrator.

You can no longer log in to the platform and all active sessions have been terminated.

If you have questions, please contact the system administrator.

Thank you for your service to Erumeli Panchayath.

Best regards,
Erumeli Panchayath Administration
    `
  };
};

module.exports = {
  getCouncillorCredentialsTemplate,
  getPresidentCredentialsTemplate,
  getCredentialsRevokedTemplate
};