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
app.use(express.static('public'));


// Start the server
app.listen(PORT, () => {
    console.log(`\nEmail Sending API is running on http://localhost:${PORT}`);
    console.log(`POST to /send (Developer) or /admin/send (Admin) with your JSON data.`);
    console.log(`DB API URL: ${DB_API_URL}`);
});