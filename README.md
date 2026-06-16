
A local web app to send personalized WhatsApp messages from an Excel sheet — with a visual message builder.

## Setup

### 1. Install Node.js
Download from https://nodejs.org (v18 or higher)

### 2. Install dependencies
```bash
cd whatsapp-campaign
npm install
```

### 3. Start the server
```bash
npm start
```

### 4. Open in browser
Go to: http://localhost:3000

---

## How to Use

### Step 1 — Connect WhatsApp
- Click **Connect WhatsApp**
- A QR code will appear in the browser
- Open WhatsApp on your phone → Linked Devices → Link a Device
- Scan the QR code

### Step 2 — Upload Excel File
- Drag & drop your `.xlsx` file (or click to browse)
- Select the sheet you want to use

### Step 3 — Build Your Message
- All columns from Row 1 are shown as clickable tags
- Click any column tag to insert `{{Column Name}}` into the message
- Live preview updates as you type, showing real data from your rows
- Set which column holds the WhatsApp number

### Step 4 — Send Campaign
- For each contact, the filled-in message is shown
- Click **Send** to send, or **Skip** to skip
- Progress bar tracks the campaign
- Activity log shows all sent/skipped/failed messages

---

## Notes
- Numbers without country code will automatically get `91` (India) prefixed
- WhatsApp session is saved locally — you won't need to scan again on restart
- The app runs entirely on your machine; no data is sent to any server
