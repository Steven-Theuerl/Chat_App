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
  // Table for visitor counts
  db.run(`
    CREATE TABLE visitors (
      count INTEGER,
      time TEXT
    )
  `);
  // New table for chat messages
  db.run(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

/** Websocket **/
const WebSocketServer = require("ws").Server;
const wss = new WebSocketServer({ server: server });

wss.on("connection", function connection(ws) {
  // Get the number of connected clients
  const numClients = wss.clients.size;
  console.log("Clients connected: " + numClients);

  // Broadcast visitor count update
  wss.broadcast(`Current visitors: ${numClients}`);

  // Send a welcome message to the newly connected client
  if (ws.readyState === ws.OPEN) {
    ws.send("Welcome!");
  }

  // Insert the visitor count into the database
  db.run(
    `INSERT INTO visitors (count, time)
     VALUES (${numClients}, dateTime('now'))`
  );

  // Load chat history for the new client, including timestamps
  db.all(
    "SELECT message, time FROM chat_messages ORDER BY time ASC",
    (err, rows) => {
      if (err) {
        console.error("Error loading chat history:", err);
        return;
      }
      rows.forEach((row) => {
        // Each historical message is sent with its timestamp.
        ws.send(`[${row.time}] ${row.message}`);
      });
    }
  );

  // Listen for incoming chat messages and broadcast them with a timestamp.
  ws.on("message", function incoming(message) {
    console.log("Received chat message:", message);

    // Insert the incoming chat message into the chat_messages table.
    db.run(
      `INSERT INTO chat_messages (message, time) VALUES (?, dateTime('now'))`,
      [message],
      function (err) {
        if (err) {
          console.error("Error inserting chat message:", err);
        } else {
          // Retrieve the timestamp from the newly inserted row.
          db.get(
            "SELECT time FROM chat_messages WHERE rowid = last_insert_rowid()",
            function (err, row) {
              if (err) {
                console.error("Error retrieving timestamp:", err);
              } else {
                // Broadcast the message with its timestamp.
                wss.broadcast(`[${row.time}] ${message}`);
              }
            }
          );
        }
      }
    );
  });

  // Handle client disconnects
  ws.on("close", function close() {
    const remainingClients = wss.clients.size;
    wss.broadcast(`Current visitors: ${remainingClients}`);
    console.log("A client has disconnected.");
  });

  // Correctly handle WebSocket errors (added error parameter)
  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });
});

// Add error handler for the WebSocket server
wss.on("error", (err) => {
  console.error("WebSocket error:", err);
});

/**
 * Broadcast data to all connected clients.
 * This function iterates over every client and sends the data if the client is open.
 * @param {Object} data
 */
wss.broadcast = function broadcast(data) {
  // Ensure data is a string.
  const message = typeof data === "string" ? data : data.toString();
  console.log("Broadcasting:", message);
  wss.clients.forEach(function each(client) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
};

/** End WebSocket **/

// Process error handlers for uncaught exceptions and unhandled rejections
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

// Handle SIGINT to gracefully shut down the server and the database
process.on("SIGINT", () => {
  wss.clients.forEach(function each(client) {
    client.close();
  });
  server.close(() => {
    shutdownDB();
  });
});
