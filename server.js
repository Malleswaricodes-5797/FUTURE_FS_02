require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/leadflow_crm';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB error:', err));

// ========== SCHEMAS ==========

// Lead Schema
const leadSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, default: '' },
    company: { type: String, default: '' },
    source: { type: String, enum: ['website', 'referral', 'social', 'direct'], default: 'website' },
    status: { type: String, enum: ['new', 'contacted', 'converted', 'lost'], default: 'new' },
    notes: [{
        text: String,
        date: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

// Admin Schema
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const Lead = mongoose.model('Lead', leadSchema);
const Admin = mongoose.model('Admin', adminSchema);

// ========== AUTH MIDDLEWARE ==========
const JWT_SECRET = process.env.JWT_SECRET || 'leadflow_secret_key_2026';

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ========== API ROUTES ==========

// SETUP ROUTE - Visit this first!
app.get('/api/auth/setup', async (req, res) => {
    try {
        const existingAdmin = await Admin.findOne({ username: 'admin' });
        if (existingAdmin) {
            res.send('✅ Admin already exists! Login at / with username: admin, password: admin123');
        } else {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = new Admin({ username: 'admin', password: hashedPassword });
            await admin.save();
            res.send('✅ Admin created successfully! <br><br>Login at: <a href="/">/</a><br>Username: admin<br>Password: admin123');
        }
    } catch (error) {
        res.send('❌ Error: ' + error.message);
    }
});

// POST setup (for curl)
app.post('/api/auth/setup', async (req, res) => {
    try {
        const existingAdmin = await Admin.findOne({ username: 'admin' });
        if (existingAdmin) {
            res.json({ message: 'Admin already exists' });
        } else {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const admin = new Admin({ username: 'admin', password: hashedPassword });
            await admin.save();
            res.json({ message: 'Admin created successfully! Login with admin/admin123' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const valid = await bcrypt.compare(password, admin.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: admin.username });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET all leads
app.get('/api/leads', authMiddleware, async (req, res) => {
    try {
        const leads = await Lead.find().sort({ createdAt: -1 });
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET lead stats
app.get('/api/leads/stats', authMiddleware, async (req, res) => {
    try {
        const total = await Lead.countDocuments();
        const newLeads = await Lead.countDocuments({ status: 'new' });
        const contacted = await Lead.countDocuments({ status: 'contacted' });
        const converted = await Lead.countDocuments({ status: 'converted' });
        const lost = await Lead.countDocuments({ status: 'lost' });
        res.json({ total, newLeads, contacted, converted, lost });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE lead
app.post('/api/leads', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName, email, phone, company, source, status } = req.body;
        const lead = new Lead({ firstName, lastName, email, phone, company, source, status });
        await lead.save();
        res.status(201).json(lead);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE lead status
app.put('/api/leads/:id', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const lead = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADD note
app.post('/api/leads/:id/notes', authMiddleware, async (req, res) => {
    try {
        const { text } = req.body;
        const lead = await Lead.findById(req.params.id);
        lead.notes.push({ text });
        await lead.save();
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE lead
app.delete('/api/leads/:id', authMiddleware, async (req, res) => {
    try {
        await Lead.findByIdAndDelete(req.params.id);
        res.json({ message: 'Lead deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 LeadFlow CRM Server running on http://localhost:${PORT}`);
    console.log(`📋 FUTURE_FS_02 | Future Interns — Full Stack Track`);
    console.log(`\n📌 First, visit: http://localhost:${PORT}/api/auth/setup`);
    console.log(`   Then login with: admin / admin123\n`);
});