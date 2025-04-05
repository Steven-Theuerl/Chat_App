# Fullstack WebSocket Chat App

A fully self-hosted, anonymous WebSocket-based chat application built from scratch on a DigitalOcean VPS. This project started as a server configuration exercise and evolved into a robust fullstack app with real-time chat, persistent storage, rate limiting, and system message handling.

---

## 🧰 Tech Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js, WebSockets
- **Database**: SQLite (in-memory, upgradeable to disk-based)
- **Server**: Dockerized WebSocket server on a DigitalOcean VPS
- **Proxy**: Nginx for SSL termination and reverse proxying

---

## 🔧 Setup & Installation

> **Note:** The full server configuration (including VPS/Nginx setup) is intentionally not shared to protect security. The core chat server and app code are included in this repository.

1. Clone the repo:
   ```bash
   git clone https://github.com/your-username/chat-app.git
   cd chat-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the app:
   ```bash
   node index-ws.js
   ```

4. Navigate to `http://localhost:3000` in your browser.

---

## ✨ Features

- 🔒 Unique anonymous usernames per session  
- 💬 Real-time messaging with WebSocket broadcast  
- 🗃️ Message storage with timestamp using SQLite  
- 👋 System messages for user joins/disconnects  
- 👥 List of currently active users  
- ⏱️ Join-time based message filtering (only see messages after joining)  
- 🔁 Reconnect handling and logout detection  
- 🔧 Built-in UI for changing usernames mid-session  
- ⚠️ Prevent duplicate usernames and spamming  
- 📶 Keep-alive pings to avoid connection drops  
- 🧪 Server logs, error handling, and DB shutdown logic  

---

## 🧠 What I Learned

- How to configure and deploy a VPS securely using Docker and Nginx  
- How to write and host WebSocket server logic in Node.js  
- How to use SQLite for ephemeral chat storage and manage real-time data  
- How to persist sessions without accounts or permanent user data  
- How to handle real-world edge cases like message filtering, connection drops, and IP-based duplication  

---

## 🏗️ Future Plans

- Break app into containerized microservices (chat server, API, DB)  
- Add CAPTCHA and rate-limiting to prevent bots  
- Add ephemeral discussion boards and DM support  
- Implement moderation tools and abuse reporting  
- Optional persistent accounts for users who want to build reputation  
- Add support for media (images, attachments)  
- Upgrade DB layer and migrate to PostgreSQL if needed  

---

## 🚀 Live Demo

https://tsundokustudio.blog/

<img width="1158" alt="image" src="https://github.com/user-attachments/assets/76ffe803-aef0-430d-beb4-45de6a81d398" />

---

## ⚠️ Disclaimer

This project repo is intended for educational and demonstration purposes.  
Out of respect for the creator, please avoid reusing the code or ideas directly without permission.

© 2025 Steven Theuerl. All rights reserved.
