const express = require('express');
const axios = require('axios'); // Changed from node-fetch to axios
const nodemailer = require('nodemailer');
const cors = require('cors'); // Essential for client-side testing
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_API_URL = process.env.DB_API_URL;

// Hardcoded admin password as requested. 
// RECOMMENDATION: Move this to process.env.ADMIN_PASS for better security.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- Configuration for Email Sending (Gmail) ---
// The sender email for admin messages and fallback for the public API.
const ADMIN_EMAIL = process.env.SMTP_USER; 

const transporter = nodemailer.createTransport({
    // Gmail SMTP details
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL/TLS for port 465
    auth: {
        user: ADMIN_EMAIL, // Your Gmail address (set in SMTP_USER env var)
        pass: process.env.SMTP_PASS, // Your Gmail App Password (set in SMTP_PASS env var)
    },
});
// --- END GMAIL CONFIG ---


// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // To parse JSON bodies


// Helper function to fetch user data and check status
async function getApiUser(apiPass) {
    try {
        // MODIFIED: Using axios.get instead of fetch
        const response = await axios.get(DB_API_URL); 
        
        // Axios throws an error for bad status codes, but we check manually for robustness if needed, 
        // and access data via response.data
        if (response.status !== 200) {
            console.error(`DB API Error: HTTP status ${response.status}`);
            return { error: 'External database is unavailable.' };
        }
        
        const users = response.data; // MODIFIED: Access data via .data with axios
        
        // Find the user with the matching apiPass
        const user = users.find(u => u.apiPass === apiPass);

        if (!user) {
            return { error: 'API Key not available in DB.' };
        }

        // Apply the specific business rule: "dont send mail. send error. if registered email status is 'Banned'"
        if (user.status === 'Banned') {
            return { error: `API Key registered email (${user.email}) is Banned. Email sending is blocked.` };
        }

        // Success: return the user object (contains the sender email)
        return { user };

    } catch (error) {
        // Axios error handling is often more comprehensive
        console.error('Error connecting to external DB:', error.message);
        return { error: 'Could not connect to database for API Key check.' };
    }
}


// --- API Endpoint: /send (Developer Email) ---
app.post('/send', async (req, res) => {
    // 'to' data is now fetched from the database based on apiPass
    const { apiPass, subject, body } = req.body;

    // 1. Basic Request Validation
    if (!apiPass || !subject || !body) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields: apiPass, subject, and body are required.' 
        });
    }
    
    // 2. Check API Key validity and status, and get the email address
    const validationResult = await getApiUser(apiPass);
    
    if (validationResult.error) {
        console.log(`[API_PASS_FAILURE] ${validationResult.error}. Key provided: ${apiPass}`);
        return res.status(401).json({
            success: false,
            message: validationResult.error // Returns the specific error about Banned status or not found
        });
    }

    const registeredEmail = validationResult.user.email; 
    const senderEmail = registeredEmail; 
    const recipientEmail = registeredEmail; // The recipient is the registered email associated with the apiPass

    // 3. Prepare Email Options
    const mailOptions = {
        from: `EZMail <${ADMIN_EMAIL}>`, // Use the registered email as the sender
        to: recipientEmail, // Use the registered email as the recipient
        subject: subject,
        html: body // Assuming the 'body' is HTML content
    };

    // 4. Send the Email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Nodemailer Error:', error);
            // Send a general error to the client, but log the detail internally
            return res.status(500).json({ 
                success: false, 
                message: `Failed to send email. Check Nodemailer config: ${error.message}` 
            });
        }
        
        // 5. Send Success Response
        console.log(`[EMAIL_SUCCESS] Message sent to ${recipientEmail} (Sender: ${senderEmail})`);
        return res.status(200).json({
            success: true,
            message: `Email sent successfully to the registered email address: ${recipientEmail}!`,
            messageId: info.messageId
        });
    });
});


// --- API Endpoint: /admin/send (Admin Email - NOW SENDS HTML) ---
app.post('/admin/send', async (req, res) => {
    const { adminPass, to, subject, message } = req.body;

    // 1. Admin Authentication Check
    if (adminPass !== ADMIN_PASSWORD) {
        console.log(`[ADMIN_FAILURE] Unauthorized attempt with password: ${adminPass}`);
        return res.status(401).json({
            success: false,
            message: 'Invalid administrative password.'
        });
    }

    // 2. Basic Request Validation
    if (!to || !subject || !message) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields: "to" (recipient email), "subject", and "message" (body) are required.' 
        });
    }

    // 3. Prepare Email Options (Admin sends from ADMIN_EMAIL)
    const mailOptions = {
        from: `EZMail <${ADMIN_EMAIL}>`, // Use the configured admin email as sender
        to: to, // The recipient email address
        subject: subject, 
        // *** FIX APPLIED HERE: Changed 'text' to 'html' to allow HTML formatting ***
        html: message 
    };

    // 4. Send the Email
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Nodemailer Admin Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: `Failed to send admin email. Check Nodemailer config: ${error.message}`
            });
        }
        
        // 5. Send Success Response
        console.log(`[ADMIN_EMAIL_SUCCESS] Message sent to ${to} (Sender: ${ADMIN_EMAIL})`);
        return res.status(200).json({
            success: true,
            message: 'Admin email sent successfully!',
            messageId: info.messageId
        });
    });
});
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EZMail — Fast, simple email delivery</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0B0D10;
    --panel: #14171C;
    --panel-soft: #181B21;
    --border: #232730;
    --text: #F4F5F7;
    --text-dim: #9AA1AC;
    --text-faint: #5E6470;
    --blue: #3B82F6;
    --blue-dim: rgba(59,130,246,0.12);
    --green: #22C55E;
    --green-dim: rgba(34,197,94,0.12);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    background-image: radial-gradient(circle at 50% 0%, rgba(59,130,246,0.08), transparent 55%);
  }

  .card {
    width: 100%;
    max-width: 560px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 44px 40px 36px;
    box-shadow: 0 40px 80px -30px rgba(0,0,0,0.6);
  }

  @media (max-width: 480px) {
    .card { padding: 32px 22px 28px; }
  }

  /* ---- header ---- */
  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .brand-mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, #3B82F6, #2563EB);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .brand-mark svg { width: 16px; height: 16px; }

  .brand-name {
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .status-pill {
    margin: 18px auto 0;
    width: fit-content;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--green-dim);
    border: 1px solid rgba(34,197,94,0.25);
  }

  .status-pill .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 0 rgba(34,197,94,0.5);
    animation: ping 2s ease-out infinite;
  }

  @keyframes ping {
    0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.45); }
    70% { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-pill .dot { animation: none; }
  }

  .status-pill span.label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--green);
  }

  h1 {
    margin-top: 26px;
    text-align: center;
    font-size: 33px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.18;
  }

  .tagline {
    margin: 14px auto 0;
    text-align: center;
    max-width: 38ch;
    font-size: 14.5px;
    line-height: 1.6;
    color: var(--text-dim);
  }

  /* ---- actions ---- */
  .actions {
    margin-top: 26px;
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: 'Inter', sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    text-decoration: none;
    padding: 10px 18px;
    border-radius: 10px;
    transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  }

  .btn:active { transform: scale(0.98); }

  .btn.primary {
    background: var(--blue);
    color: #fff;
  }
  .btn.primary:hover { background: #2f74e5; }

  .btn.secondary {
    background: var(--panel-soft);
    color: var(--text);
    border: 1px solid var(--border);
  }
  .btn.secondary:hover { border-color: #343944; }

  .btn:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }

  .btn svg { width: 14px; height: 14px; flex-shrink: 0; }

  /* ---- feature cards ---- */
  .features {
    margin-top: 30px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
  }

  @media (max-width: 480px) {
    .features { grid-template-columns: 1fr; }
  }

  .feature {
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 14px;
  }

  .feature-icon {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
  }

  .feature-icon svg { width: 13px; height: 13px; }

  .feature-icon.blue { background: var(--blue-dim); }
  .feature-icon.blue svg { color: var(--blue); }
  .feature-icon.green { background: var(--green-dim); }
  .feature-icon.green svg { color: var(--green); }
  .feature-icon.purple { background: rgba(168,85,247,0.12); }
  .feature-icon.purple svg { color: #A855F7; }

  .feature-label {
    font-size: 11px;
    color: var(--text-faint);
    margin-bottom: 4px;
  }

  .feature-value {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
  }

  /* ---- endpoints ---- */
  .endpoints {
    margin-top: 30px;
  }

  .endpoints-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 10px;
  }

  .endpoint-list {
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .endpoint-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    font-family: 'JetBrains Mono', monospace;
  }
  .endpoint-row:last-child { border-bottom: none; }

  .method {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    flex-shrink: 0;
  }

  .method.post { color: var(--blue); background: var(--blue-dim); }
  .method.get { color: var(--green); background: var(--green-dim); }

  .endpoint-path {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }

  .endpoint-desc {
    margin-left: auto;
    font-size: 11.5px;
    color: var(--text-faint);
    font-family: 'Inter', sans-serif;
    text-align: right;
  }

  footer {
    margin-top: 28px;
    text-align: center;
    font-size: 11.5px;
    color: var(--text-faint);
  }

  footer a {
    color: var(--blue);
    text-decoration: none;
  }
  footer a:hover { text-decoration: underline; }
</style>
</head>
<body>

  <div class="card">

    <div class="brand">
      <div class="brand-mark">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 12L22 2L17 22L11 14L2 12Z" stroke="white" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="brand-name">EZMail</span>
    </div>

    <div class="status-pill">
      <span class="dot"></span>
      <span class="label">API online</span>
    </div>

    <h1>Fast, simple<br>email delivery</h1>

    <p class="tagline">A lightweight SMTP API for developers. Send transactional emails in seconds — no setup needed.</p>

    <div class="actions">
      <a class="btn primary" href="https://ezmail-smtp.pages.dev/docs" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 19.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13.5M4 19.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M4 19.5h16M8 8h8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Read the docs
      </a>
      <a class="btn secondary" href="https://riviyax.site" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Developer
      </a>
    </div>

    <div class="features">
      <div class="feature">
        <div class="feature-icon blue">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor"/></svg>
        </div>
        <div class="feature-label">Delivery</div>
        <div class="feature-value">Gmail SMTP</div>
      </div>
      <div class="feature">
        <div class="feature-icon green">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="11" width="16" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <div class="feature-label">Auth</div>
        <div class="feature-value">API key</div>
      </div>
      <div class="feature">
        <div class="feature-icon purple">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 18l-5-6 5-6M15 6l5 6-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="feature-label">Format</div>
        <div class="feature-value">HTML email</div>
      </div>
    </div>

    <div class="endpoints">
      <div class="endpoints-label">ENDPOINTS</div>
      <div class="endpoint-list">
        <div class="endpoint-row">
          <span class="method post">POST</span>
          <span class="endpoint-path">/send</span>
          <span class="endpoint-desc">Developer · API key</span>
        </div>
        <div class="endpoint-row">
          <span class="method get">GET</span>
          <span class="endpoint-path">/</span>
          <span class="endpoint-desc">Status page</span>
        </div>
      </div>
    </div>

    <footer>Built by <a href="https://riviyax.pages.dev" target="_blank" rel="noopener">riviyax</a> · EZMail SMTP API</footer>

  </div>

</body>
</html>`);
});


// Start the server
app.listen(PORT, () => {
    console.log(`\nEmail Sending API is running on http://localhost:${PORT}`);
    console.log(`POST to /send (Developer) or /admin/send (Admin) with your JSON data.`);
    console.log(`DB API URL: ${DB_API_URL}`);
});

module.exports = app;