const API_URL = 'http://localhost:5000/api';
let token = localStorage.getItem('token');
let currentFilter = 'all';

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const userDisplay = document.getElementById('userDisplay');
const addLeadForm = document.getElementById('addLeadForm');
const leadsList = document.getElementById('leadsList');
const modal = document.getElementById('leadModal');
const modalBody = document.getElementById('modalBody');

// Check if user is logged in
if (token) {
    showDashboard();
    loadLeads();
    loadStats();
} else {
    showLogin();
}

// Login handler
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (response.ok) {
            token = data.token;
            localStorage.setItem('token', token);
            showDashboard();
            loadLeads();
            loadStats();
        } else {
            alert(data.message || 'Login failed');
        }
    } catch (error) {
        alert('Server error. Make sure backend is running on port 5000');
    }
});

// Logout handler
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    token = null;
    showLogin();
});

// Add lead handler
addLeadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lead = {
        name: document.getElementById('leadName').value,
        email: document.getElementById('leadEmail').value,
        phone: document.getElementById('leadPhone').value,
        source: document.getElementById('leadSource').value
    };
    
    try {
        const response = await fetch(`${API_URL}/leads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(lead)
        });
        
        if (response.ok) {
            addLeadForm.reset();
            loadLeads();
            loadStats();
        } else {
            alert('Failed to add lead');
        }
    } catch (error) {
        alert('Error adding lead');
    }
});

// Load leads
async function loadLeads() {
    try {
        const response = await fetch(`${API_URL}/leads`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const leads = await response.json();
        displayLeads(leads);
        updateFilterButtons();
    } catch (error) {
        console.error('Error loading leads:', error);
    }
}

// Display leads
function displayLeads(leads) {
    const filteredLeads = currentFilter === 'all' 
        ? leads 
        : leads.filter(lead => lead.status === currentFilter);
    
    if (filteredLeads.length === 0) {
        leadsList.innerHTML = '<div class="lead-card">No leads found</div>';
        return;
    }
    
    leadsList.innerHTML = filteredLeads.map(lead => `
        <div class="lead-card">
            <div class="lead-info">
                <div class="lead-name">${escapeHtml(lead.name)}</div>
                <div class="lead-email">${escapeHtml(lead.email)}</div>
                <div class="lead-phone">${lead.phone || 'No phone'}</div>
            </div>
            <div>
                <span class="lead-status status-${lead.status}">${lead.status}</span>
            </div>
            <div class="lead-actions">
                <button class="edit-btn" onclick="updateStatus('${lead._id}', 'Contacted')"><i class="fas fa-phone"></i></button>
                <button class="edit-btn" onclick="updateStatus('${lead._id}', 'Converted')"><i class="fas fa-check"></i></button>
                <button class="note-btn" onclick="addNote('${lead._id}')"><i class="fas fa-comment"></i></button>
                <button class="delete-btn" onclick="deleteLead('${lead._id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

// Update lead status
async function updateStatus(id, status) {
    try {
        await fetch(`${API_URL}/leads/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        loadLeads();
        loadStats();
    } catch (error) {
        alert('Error updating status');
    }
}

// Add note
async function addNote(id) {
    const note = prompt('Enter note:');
    if (!note) return;
    
    try {
        await fetch(`${API_URL}/leads/${id}/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ note })
        });
        loadLeads();
    } catch (error) {
        alert('Error adding note');
    }
}

// Delete lead
async function deleteLead(id) {
    if (!confirm('Delete this lead?')) return;
    
    try {
        await fetch(`${API_URL}/leads/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        loadLeads();
        loadStats();
    } catch (error) {
        alert('Error deleting lead');
    }
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/leads/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const stats = await response.json();
        
        document.getElementById('totalLeads').textContent = stats.total || 0;
        document.getElementById('newLeads').textContent = stats.New || 0;
        document.getElementById('contactedLeads').textContent = stats.Contacted || 0;
        document.getElementById('convertedLeads').textContent = stats.Converted || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Filter buttons
function updateFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            loadLeads();
        });
    });
}

// Helper functions
function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
}

function showLogin() {
    loginSection.style.display = 'flex';
    dashboardSection.style.display = 'none';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Close modal
document.querySelector('.close-modal')?.addEventListener('click', () => {
    modal.classList.remove('active');
});

window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
});
