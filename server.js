const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '50mb' }));


// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => cb(null, 'campaign.xlsx')
});
const upload = multer({ storage, fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx'));
}});

// WhatsApp client
let waClient = null;
let waReady = false;
let sendingActive = false;
let sendQueue = [];
let currentQueueIndex = 0;

function initWhatsApp(socket) {
    if (waClient) {
        waClient.destroy().catch(() => {});
        waClient = null;
        waReady = false;
    }

    waClient = new Client({
        authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
        puppeteer: {
            headless: true,
            executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    waClient.on('qr', async (qr) => {
        try {
            const qrDataUrl = await qrcode.toDataURL(qr);
            io.emit('qr', qrDataUrl);
            io.emit('status', { type: 'info', message: 'Scan the QR code with WhatsApp' });
        } catch (e) {
            console.error('QR error', e);
        }
    });

    waClient.on('ready', () => {
        waReady = true;
        io.emit('wa_ready', true);
        io.emit('status', { type: 'success', message: 'WhatsApp connected!' });
    });

    waClient.on('auth_failure', () => {
        io.emit('status', { type: 'error', message: 'WhatsApp auth failed. Try reconnecting.' });
    });

    waClient.on('disconnected', () => {
        waReady = false;
        io.emit('wa_ready', false);
        io.emit('status', { type: 'warning', message: 'WhatsApp disconnected.' });
    });

    waClient.initialize().catch(err => {
        io.emit('status', { type: 'error', message: 'Failed to initialize WhatsApp: ' + err.message });
    });
}

// Parse Excel
app.get('/api/parse', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', 'campaign.xlsx');
    if (!fs.existsSync(filePath)) return res.json({ error: 'No file uploaded' });

    try {
        const wb = XLSX.readFile(filePath);
        const sheets = wb.SheetNames;
        const result = {};

        for (const name of sheets) {
            const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
            result[name] = {
                columns: data.length > 0 ? Object.keys(data[0]) : [],
                rows: data,
                count: data.length
            };
        }

        res.json({ sheets, data: result });
    } catch (e) {
        res.json({ error: e.message });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.json({ error: 'No file received' });
    const filePath = path.join(__dirname, 'uploads', 'campaign.xlsx');
    try {
        const wb = XLSX.readFile(filePath);
        const sheets = wb.SheetNames;
        const result = {};
        for (const name of sheets) {
            const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
            result[name] = {
                columns: data.length > 0 ? Object.keys(data[0]) : [],
                rows: data,
                count: data.length
            };
        }
        res.json({ success: true, sheets, data: result });
    } catch (e) {
        res.json({ error: e.message });
    }
});

app.post('/api/start-send', (req, res) => {
    if (!waReady) return res.json({ error: 'WhatsApp not connected' });
    const { rows, template, phoneColumn } = req.body;
    if (!rows || !template || !phoneColumn) return res.json({ error: 'Missing data' });

    sendQueue = rows;
    currentQueueIndex = 0;
    sendingActive = false;
    res.json({ success: true, total: rows.length });
    io.emit('queue_ready', { total: rows.length });
});

app.post('/api/send-next', async (req, res) => {
    const { action } = req.body; // 'send' or 'skip'
    if (currentQueueIndex >= sendQueue.length) {
        return res.json({ done: true });
    }

    const row = sendQueue[currentQueueIndex];
    currentQueueIndex++;

    if (action === 'send') {
        const { message, phoneColumn } = req.body;
        const phone = String(row[phoneColumn] || '').replace(/\D/g, '');
        if (!phone) {
            io.emit('status', { type: 'warning', message: `Row ${currentQueueIndex}: No phone number, skipped.` });
            return res.json({ skipped: true, index: currentQueueIndex, total: sendQueue.length });
        }

        const formatted = phone.startsWith('91') ? phone : '91' + phone;
        try {
            await waClient.sendMessage(`${formatted}@c.us`, message);
            io.emit('status', { type: 'success', message: `✓ Sent to ${formatted}` });
            return res.json({ sent: true, index: currentQueueIndex, total: sendQueue.length });
        } catch (e) {
            io.emit('status', { type: 'error', message: `✗ Failed to send to ${formatted}: ${e.message}` });
            return res.json({ error: e.message, index: currentQueueIndex, total: sendQueue.length });
        }
    } else {
        io.emit('status', { type: 'info', message: `Row ${currentQueueIndex}: Skipped.` });
        return res.json({ skipped: true, index: currentQueueIndex, total: sendQueue.length });
    }
});

app.get('/api/current-row', (req, res) => {
    if (currentQueueIndex >= sendQueue.length) return res.json({ done: true });
    res.json({ row: sendQueue[currentQueueIndex], index: currentQueueIndex, total: sendQueue.length });
});

app.get('/api/wa-status', (req, res) => {
    res.json({ ready: waReady });
});

// Socket events
io.on('connection', (socket) => {
    socket.emit('wa_ready', waReady);

    socket.on('connect_wa', () => {
        initWhatsApp(socket);
    });

    socket.on('disconnect_wa', () => {
        if (waClient) {
            waClient.destroy().then(() => {
                waClient = null;
                waReady = false;
                io.emit('wa_ready', false);
            }).catch(() => {});
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 WhatsApp Campaign Manager running at http://localhost:${PORT}\n`);
});
