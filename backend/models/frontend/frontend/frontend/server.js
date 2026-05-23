// ═══════════════════════════════════════════════════════════════
//  FUTURE_FS_02 — LeadFlow Mini CRM Backend
//  Node.js + Express + MongoDB
//  Future Interns | Full Stack Web Development Track
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ── MongoDB Connection ──
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/leadflow_crm';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ═══════════════════════════════════════════════
//  SCHEMAS & MODELS
// ═══════════════════════════════════════════════

// Lead Schema
const noteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  date: { type: String, default: () => new Date().toLocaleString('en-IN') }
});

const leadSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, trim: true, lowercase: true },
  phone:      { type: String, trim: true, default: '' },
  company:    { type: String, trim: true, default: '' },
  source:     { type: String, enum: ['website','referral','social','direct'], default: 'website' },
  status:     { type: String, enum: ['new','contacted','converted','lost'], default: 'new' },
  notes:      [noteSchema],
  createdAt:  { type: Date, default: Date.now },
});

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const Lead  = mongoose.model('Lead',  leadSchema);
const Admin = mongoose.model('Admin', adminSchema);

// ═══════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ═══════════════════════════════════════════════
const JWT_SECRET = process.env.JWT_SECRET || 'leadflow_secret_key_2026';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ═══════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: admin.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/setup — run once to create admin account
app.post('/api/auth/setup', async (req, res) => {
  try {
    const existing = await Admin.findOne({ username: 'admin' });
    if (existing) return res.json({ message: 'Admin already exists' });
    const hashed = await bcrypt.hash('admin123', 10);
    await Admin.create({ username: 'admin', password: hashed });
    res.json({ message: '✅ Admin created: admin / admin123' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
//  LEADS ROUTES (Protected)
// ═══════════════════════════════════════════════

// GET /api/leads — get all leads (with optional filters)
app.get('/api/leads', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.search) {
      const q = req.query.search;
      filter.$or = [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName:  { $regex: q, $options: 'i' } },
        { email:     { $regex: q, $options: 'i' } },
        { company:   { $regex: q, $options: 'i' } },
      ];
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:id — get single lead
app.get('/api/leads/:id', authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads — create new lead
app.post('/api/leads', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, company, source, status, note } = req.body;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }
    const leadData = { firstName, lastName, email, phone, company, source, status, notes: [] };
    if (note) leadData.notes.push({ text: note });
    const lead = await Lead.create(leadData);
    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leads/:id — update lead
app.put('/api/leads/:id', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, company, source, status } = req.body;
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, email, phone, company, source, status },
      { new: true, runValidators: true }
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leads/:id/status — update status only
app.patch('/api/leads/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'contacted', 'converted', 'lost'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const lead = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leads/:id — delete lead
app.delete('/api/leads/:id', authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notes Sub-routes ──

// POST /api/leads/:id/notes — add note to lead
app.post('/api/leads/:id/notes', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Note text is required' });
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    lead.notes.push({ text });
    await lead.save();
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leads/:id/notes/:noteId — delete a note
app.delete('/api/leads/:id/notes/:noteId', authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    lead.notes = lead.notes.filter(n => n._id.toString() !== req.params.noteId);
    await lead.save();
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Route ──
app.get('/api/analytics', authMiddleware, async (req, res) => {
  try {
    const total     = await Lead.countDocuments();
    const newLeads  = await Lead.countDocuments({ status: 'new' });
    const contacted = await Lead.countDocuments({ status: 'contacted' });
    const converted = await Lead.countDocuments({ status: 'converted' });
    const lost      = await Lead.countDocuments({ status: 'lost' });

    const bySource = await Lead.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        total, newLeads, contacted, converted, lost,
        conversionRate: total ? Math.round(converted / total * 100) : 0,
        bySource
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Catch-all: serve frontend ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start Server ──
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 LeadFlow CRM Server running on http://localhost:${PORT}`);
  console.log(`📋 FUTURE_FS_02 | Future Interns — Full Stack Track`);
  console.log(`\n📌 First time? Run: POST http://localhost:${PORT}/api/auth/setup`);
  console.log(`   to create admin credentials (admin / admin123)\n`);
});