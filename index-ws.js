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

// Add error handler for the HTTP server
server.on("error", (err) => {
  console.error("HTTP server error:", err);
});

/** Begin Database **/

const sqlite = require("sqlite3");
// Creates an in‑memory database (non‑persistent)
const db = new sqlite.Database(":memory:");

db.serialize(() => {
  // Create visitors table with a username column.
  db.run(`
    CREATE TABLE visitors (
      count INTEGER,
      username TEXT,
      time TEXT
    )
  `);
  // Create chat_messages table with a username column.
  db.run(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
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
  // Prompt the user for their username.
  ws.send("Please enter your name:");
  ws.authenticated = false;

  // Broadcast current visitor count.
  const numClients = wss.clients.size;
  console.log("Clients connected: " + numClients);
  wss.broadcast(`Current visitors: ${numClients}`);

  // Listen for incoming messages.
  ws.on("message", function incoming(message) {
    // Convert message to a string if it's not already.
    if (typeof message !== "string") {
      message = message.toString();
    }

    if (!ws.authenticated) {
      // The first message is treated as the username.
      ws.username = message.trim();
      ws.authenticated = true;
      ws.send(`Welcome, ${ws.username}!`);

      // Insert the visitor record including the username.
      db.run(
        `INSERT INTO visitors (count, username, time) VALUES (?, ?, dateTime('now'))`,
        [wss.clients.size, ws.username],
        function (err) {
          if (err) console.error("Error inserting visitor:", err);
        }
      );

      // Load and send chat history.
      db.all(
        "SELECT username, message, time FROM chat_messages ORDER BY time ASC",
        (err, rows) => {
          if (err) {
            console.error("Error loading chat history:", err);
            return;
          }
          rows.forEach((row) => {
            // Format: <username> [<timestamp>]: <message>
            ws.send(`${row.username} [${row.time}]: ${row.message}`);
          });
        }
      );
      return;
    }

    // Process chat message from an authenticated user.
    console.log(`Received chat message from ${ws.username}:`, message);
    db.run(
      `INSERT INTO chat_messages (username, message, time) VALUES (?, ?, dateTime('now'))`,
      [ws.username, message],
      function (err) {
        if (err) {
          console.error("Error inserting chat message:", err);
        } else {
          // Retrieve the timestamp of the newly inserted message.
          db.get(
            "SELECT time FROM chat_messages WHERE rowid = last_insert_rowid()",
            function (err, row) {
              if (err) {
                console.error("Error retrieving timestamp:", err);
              } else {
                // Broadcast the message in the format: <username> [<timestamp>]: <message>
                wss.broadcast(`${ws.username} [${row.time}]: ${message}`);
              }
            }
          );
        }
      }
    );
  });

  // Handle client disconnect.
  ws.on("close", function close() {
    if (ws.username) {
      // Delete this user's record from visitors.
      db.run(
        "DELETE FROM visitors WHERE username = ?",
        [ws.username],
        function (err) {
          if (err) console.error("Error deleting visitor:", err);
        }
      );
      // Delete this user's chat messages.
      db.run(
        "DELETE FROM chat_messages WHERE username = ?",
        [ws.username],
        function (err) {
          if (err) console.error("Error deleting chat messages for user:", err);
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
 * Broadcast data to all connected clients.
 * Iterates over every client and sends the data if the client is open.
 * @param {Object} data
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
