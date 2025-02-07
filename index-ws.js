const express = require("express");
const server = require("http").createServer();
const app = express();
const PORT = 3000;

// Middleware to parse JSON bodies for PUT requests.
app.use(express.json());

app.get("/", function (req, res) {
  res.sendFile("index.html", { root: __dirname });
});

server.on("request", app);
server.listen(PORT, function () {
  console.log("Listening on " + PORT);
});

server.on("error", (err) => {
  console.error("HTTP server error:", err);
});

/** Begin Database **/

const sqlite = require("sqlite3");
// Creates an in‑memory database (non‑persistent)
const db = new sqlite.Database(":memory:");

db.serialize(() => {
  // Create visitors table with username, ip, and time.
  db.run(`
    CREATE TABLE visitors (
      count INTEGER,
      username TEXT,
      ip TEXT,
      time TEXT
    )
  `);
  // Create chat_messages table with username, ip, message, and time.
  db.run(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      ip TEXT,
      message TEXT,
      time TEXT
    )
  `);
});

function getCounts() {
  db.each("SELECT * FROM visitors", (err, row) => {
    console.log(row);
  });
}

function shutdownDB() {
  getCounts();
  console.log("Shutting down db connection.");
  db.close();
}

/** End Database **/

// Express endpoint for PUT /change-name
app.put("/change-name", (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: "Missing oldName or newName." });
  }
  // Check for duplicate among active clients.
  let duplicate = false;
  wss.clients.forEach((client) => {
    if (client.authenticated && client.username === newName) {
      duplicate = true;
    }
  });
  if (duplicate) {
    return res.status(400).json({
      error: "Username already in use, please choose a different name.",
    });
  }
  // Find the client connection with oldName.
  let foundClient = null;
  wss.clients.forEach((client) => {
    if (client.authenticated && client.username === oldName) {
      foundClient = client;
    }
  });
  if (!foundClient) {
    return res
      .status(404)
      .json({ error: "Active client with the old username not found." });
  }
  // Update in-memory state.
  foundClient.username = newName;
  // Update the database record.
  db.run(
    "UPDATE visitors SET username = ? WHERE username = ? AND ip = ?",
    [newName, oldName, foundClient.ip],
    function (err) {
      if (err) {
        console.error("Error updating username in DB:", err);
        return res
          .status(500)
          .json({ error: "Error updating username in database." });
      }
      // Broadcast a system message about the name change.
      wss.broadcast(`System: ${oldName} has changed their name to ${newName}.`);
      return res
        .status(200)
        .json({ message: "Username updated successfully." });
    }
  );
});

/** WebSocket **/
const WebSocketServer = require("ws").Server;
const wss = new WebSocketServer({ server: server });

// Keep-alive: send a ping every 30 seconds to each client.
const pingInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.ping();
    }
  });
}, 30000);

wss.on("connection", function connection(ws) {
  // Capture the client's IP address.
  ws.ip = ws._socket.remoteAddress;

  // Prompt for username.
  ws.send("Please enter your name:");
  ws.authenticated = false;

  const numClients = wss.clients.size;
  console.log("Clients connected: " + numClients);
  wss.broadcast(`Current visitors: ${numClients}`);

  ws.on("message", function incoming(message) {
    if (typeof message !== "string") {
      message = message.toString();
    }

    if (!ws.authenticated) {
      let proposedUsername = message.trim();
      // Check for duplicate username among active clients.
      let duplicate = false;
      wss.clients.forEach(function (client) {
        if (
          client !== ws &&
          client.authenticated &&
          client.username === proposedUsername
        ) {
          duplicate = true;
        }
      });
      if (duplicate) {
        ws.send("Username already in use, please enter a different name:");
        return;
      }
      // Accept the username.
      ws.username = proposedUsername;
      ws.authenticated = true;
      // Record join time in "YYYY-MM-DD HH:MM:SS" format.
      ws.joinTime = new Date().toISOString().slice(0, 19).replace("T", " ");
      ws.send(`Welcome, ${ws.username}!`);

      // Broadcast join notification to all clients.
      wss.broadcast(`${ws.username} has joined the chat.`);

      // Insert the visitor record.
      db.run(
        `INSERT INTO visitors (count, username, ip, time) VALUES (?, ?, ?, dateTime('now'))`,
        [wss.clients.size, ws.username, ws.ip],
        function (err) {
          if (err) console.error("Error inserting visitor:", err);
        }
      );

      // Send a system message to the new user listing all currently connected authenticated users.
      let connectedUsers = [];
      wss.clients.forEach(function (client) {
        if (client.authenticated) {
          connectedUsers.push(client.username);
        }
      });
      ws.send("System: Currently connected: " + connectedUsers.join(", "));

      // Load and send only chat messages with a timestamp >= ws.joinTime.
      db.all(
        "SELECT username, message, time FROM chat_messages WHERE time >= ? ORDER BY time ASC",
        [ws.joinTime],
        (err, rows) => {
          if (err) {
            console.error("Error loading chat history:", err);
            return;
          }
          rows.forEach((row) => {
            ws.send(`${row.username} [${row.time}]: ${row.message}`);
          });
        }
      );
      return;
    }

    // Process chat message from an authenticated user.
    console.log(`Received chat message from ${ws.username}:`, message);
    db.run(
      `INSERT INTO chat_messages (username, ip, message, time) VALUES (?, ?, ?, dateTime('now'))`,
      [ws.username, ws.ip, message],
      function (err) {
        if (err) {
          console.error("Error inserting chat message:", err);
        } else {
          db.get(
            "SELECT time FROM chat_messages WHERE rowid = last_insert_rowid()",
            function (err, row) {
              if (err) {
                console.error("Error retrieving timestamp:", err);
              } else {
                wss.broadcast(`${ws.username} [${row.time}]: ${message}`);
              }
            }
          );
        }
      }
    );
  });

  ws.on("close", function close() {
    if (ws.username) {
      wss.broadcast(`${ws.username} has disconnected.`);
      db.run(
        "DELETE FROM visitors WHERE username = ? AND ip = ?",
        [ws.username, ws.ip],
        function (err) {
          if (err) console.error("Error deleting visitor:", err);
        }
      );
    }
    const remainingClients = wss.clients.size;
    wss.broadcast(`Current visitors: ${remainingClients}`);
    console.log("A client has disconnected.");
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });
});

wss.on("error", (err) => {
  console.error("WebSocket error:", err);
});

/**
 * Broadcasts a message to all connected clients.
 */
wss.broadcast = function broadcast(data) {
  const message = typeof data === "string" ? data : data.toString();
  console.log("Broadcasting:", message);
  wss.clients.forEach(function (client) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
};

/** End WebSocket **/

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  clearInterval(pingInterval);
  wss.clients.forEach(function (client) {
    client.close();
  });
  server.close(() => {
    shutdownDB();
  });
});
