const path = require("path");
require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

// Tell Express to serve the static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Configure transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Health check and root route
app.get("/", (req, res) => {
  // Since you have a static middleware, you don't need a custom root route
  // unless you want to override the default index.html behavior.
  // The express.static middleware will automatically serve public/index.html
  // for requests to the root URL ("/").
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Send email endpoint
app.post("/send", async (req, res) => {
  // ... your existing email sending code
  const { to, subject, text, html } = req.body;

  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  try {
    let info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error("❌ Email error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Email API server running on http://localhost:${PORT}`);
});
