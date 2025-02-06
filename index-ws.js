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

/** Websocket **/
const WebSocketServer = require("ws").Server;
//Creating a server called WebSocketServer from ws library

const wss = new WebSocketServer({ server: server });
// This server is attaching to the server we created with express
// on line 10

wss.on("connection", function connection(ws) {
  // This listener function runs anytime someone connects to the server
  const numClients = wss.clients.size;

  console.log("Clients connected: " + numClients);

  wss.broadcast(`Current visitors: ${numClients}`);

  if (ws.readyState === ws.OPEN) {
    ws.send("Welcome!");
  }

  db.run(`INSERT INTO visitors (count, time)
    VALUES (${numClients}, dateTime('now'))
  `);
  // This is where we insert the number of clients into the database every time
  // someone connects to the server.

  ws.on("close", function close() {
    wss.broadcast(`Current visitors: ${wss.clients.size}`);
    console.log("A client has disconnected.");
  });

  ws.on("error", function error() {
    //
  });
});

// Add error handler for the WebSocket server
wss.on("error", (err) => {
  console.error("WebSocket error:", err);
});

/**
 * Broadcast data to all connected clients
 * @param {Object} data
 * @void
 */
wss.broadcast = function broadcast(data) {
  console.log("Broadcasting: ", data);
  wss.clients.forEach(function each(client) {
    client.send(data);
  });
};

/** End WebSocket **/
/** Begin Database **/

const sqlite = require("sqlite3");
// Importing the sqlite3 module for use
const db = new sqlite.Database(":memory:");
// Creates a new database and stores it in the server's memory
// Storing in the server'e memory is not persistent.
// If the server restarts, the data will be lost

db.serialize(() => {
  db.run(`
    CREATE TABLE visitors (
      count INTEGER,
      time TEXT
    )
  `);
  // The run method is what allows us to execute SQL commands.
  // This will create a table called "visitors" that has two fields;
  // "counts" and "time". Fields have to be given a type in SQLite.
});
// Setting the serialize command as a callback here will ensure that there is
// actually a database established to prevent errors on bad queries or writes.

function getCounts() {
  db.each("SELECT * FROM visitors", (err, row) => {
    console.log(row);
  });
  // each will specify to the table to run a query on every row.
}
// This function simply queries the visitors table for the count of visitors.

function shutdownDB() {
  getCounts();
  console.log("Shutting down db connection.");
  db.close();
  // close will close the connection to the database.
}
// We never want to just leave the database connection open because it will stay
// open and we can potentially run out of connection availability, or be exploited.
// When the server is shut down, we need to shutdown the connection.

// Add process error handlers for uncaught exceptions and unhandled rejections
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

// Register SIGINT after wss and shutdownDB are defined.
process.on("SIGINT", () => {
  wss.clients.forEach(function each(client) {
    client.close();
  });
  // Closes the websocket connection to every client before attempting to
  // shutdown the database, and then the server.
  server.close(() => {
    shutdownDB();
  });
});
// SIGINT is the signal sent to the process when the admin hits Ctrl + C
// to kill the server. Once this keystroke is detected, the server and the
// database are shut down.
