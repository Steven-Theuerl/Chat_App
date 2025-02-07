const express = require("express");
const server = require("http").createServer();
const app = express();
const PORT = 3000;

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
// Create an in‑memory database (non‑persistent)
const db = new sqlite.Database(":memory:");

db.serialize(() => {
  // Update the visitors table to store username and IP.
  db.run(`
    CREATE TABLE visitors (
      count INTEGER,
      username TEXT,
      ip TEXT,
      time TEXT
    )
  `);
  // Update chat_messages table to include an IP column.
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

/** WebSocket **/
const WebSocketServer = require("ws").Server;
const wss = new WebSocketServer({ server: server });

wss.on("connection", function connection(ws) {
  // Capture the client's IP address from the underlying socket.
  ws.ip = ws._socket.remoteAddress;

  // Prompt the user for their username.
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
      // First message is treated as the username.
      ws.username = message.trim();
      ws.authenticated = true;
      // Send a welcome message that includes the IP (so the client can store it).
      ws.send(`Welcome, ${ws.username}! [IP: ${ws.ip}]`);

      // Insert the visitor record with username and IP.
      db.run(
        `INSERT INTO visitors (count, username, ip, time) VALUES (?, ?, ?, dateTime('now'))`,
        [wss.clients.size, ws.username, ws.ip],
        function (err) {
          if (err) console.error("Error inserting visitor:", err);
        }
      );

      // Load and send chat history.
      db.all(
        "SELECT username, ip, message, time FROM chat_messages ORDER BY time ASC",
        (err, rows) => {
          if (err) {
            console.error("Error loading chat history:", err);
            return;
          }
          rows.forEach((row) => {
            // Format each message as: username@ip [timestamp]: message
            ws.send(`${row.username}@${row.ip} [${row.time}]: ${row.message}`);
          });
        }
      );
      return;
    }

    // For authenticated users, store the chat message with username and IP.
    console.log(`Received chat message from ${ws.username}@${ws.ip}:`, message);
    db.run(
      `INSERT INTO chat_messages (username, ip, message, time) VALUES (?, ?, ?, dateTime('now'))`,
      [ws.username, ws.ip, message],
      function (err) {
        if (err) {
          console.error("Error inserting chat message:", err);
        } else {
          // Retrieve the timestamp of the new message.
          db.get(
            "SELECT time FROM chat_messages WHERE rowid = last_insert_rowid()",
            function (err, row) {
              if (err) {
                console.error("Error retrieving timestamp:", err);
              } else {
                // Broadcast the message including username and IP.
                wss.broadcast(
                  `${ws.username}@${ws.ip} [${row.time}]: ${message}`
                );
              }
            }
          );
        }
      }
    );
  });

  // On disconnect, only remove the visitor record for this session.
  ws.on("close", function close() {
    if (ws.username) {
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
  wss.clients.forEach(function each(client) {
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
  wss.clients.forEach(function each(client) {
    client.close();
  });
  server.close(() => {
    shutdownDB();
  });
});
