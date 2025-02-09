const express = require("express");
// Import the Express module, a popular web framework for Node.js,
// which provides a simpler API for handling routing, middleware, etc.
const server = require("http").createServer();
// Import Node.js' built-in HTTP module and create an HTTP server.
// This server will be used by Express to handle HTTP requests,
// and it will also be used later to attach a WebSocket server.
const app = express();
// Create an instance of the Express application. This 'app' object
// will be used to define routes, middleware, and other server logic.
const PORT = 3000;
// Define the port number on which the server will listen for incoming HTTP requests.

app.use(express.json());
// Use Express's built-in middleware to parse JSON bodies from incoming requests. This
// is especially useful for handling PUT / POST requests where the client sends data in JSON format.

app.get("/", function (req, res) {
  res.sendFile("index.html", { root: __dirname });
});
//This line is saying - "when a client sends us a get request with the path "/",
// send them the index.html file in the root directory."
// __dirname is a Node.js global variable that represents the absolute path
// of the directory containing the currently executing file.

server.on("request", app);
server.listen(PORT, function () {
  console.log("Listening on " + PORT);
});
// Turning on an HTTP server and attaching the Express application to it, so
// that Express can handle incoming HTTP requests to port 3000.

server.on("error", (err) => {
  console.error("HTTP server error:", err);
});
// This line is saying - "if there is an error with the HTTP server, print the error to the console."

/** Begin Database **/

const sqlite = require("sqlite3");
// require the sqlite3 module.
const db = new sqlite.Database(":memory:");
// Creates an in‑memory database using the sqlite3 module.
// If we want to store the data on disk, we can replace ":memory:" with the path to the database file.

db.serialize(() => {
  // serialize ensures the following code is executed in the order it is written.
  db.run(`
    CREATE TABLE visitors (
      count INTEGER,
      username TEXT,
      ip TEXT,
      time TEXT
    )
  `);
  // Create visitors table with username, ip, and time - FIRST.
  // The "run" method executes SQL statements that are not queries (i.e., they do not return
  // any rows. Each field must also have an explicit type, such as integer or text.

  db.run(`
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      ip TEXT,
      message TEXT,
      time TEXT
    )
  `);
  // Create chat_messages table with username, ip, message, and time - SECOND.
  // the id field has an automatically increasing integer value, which is the primary key.
});

function getCounts() {
  db.each("SELECT * FROM visitors", (err, row) => {
    console.log(row);
  });
}
// This function will iterate over the visitors table and print out the entire row, for every row.
// Using this, we can find out who is in the chat from the console.

function shutdownDB() {
  getCounts();
  console.log("Shutting down db connection.");
  db.close();
}
// This function will use getCounts to print out every row of the visitors table to the console,
// then log a message to the console, and then close the database connection.

/** End Database **/

// Express endpoint for PUT /change-name
app.put("/change-name", (req, res) => {
  const { oldName, newName } = req.body;
  // Extract the old and new names from the request body.
  if (!oldName || !newName) {
    return res.status(400).json({ error: "Missing oldName or newName." });
  }
  // If either oldName or newName is missing, return a 400 error with a message.
  // Old name should always exist, and new name should be in the put request.
  let duplicate = false;
  // Set a flag to track whether the new name is a duplicate.
  wss.clients.forEach((client) => {
    if (client.authenticated && client.username === newName) {
      duplicate = true;
    }
    // Run an iteration over all clients connected to the websocket server and check
    // if the new name is already in use.
  });

  if (duplicate) {
    return res.status(400).json({
      error: "Username already in use, please choose a different name.",
    });
  }
  // If duplicate is true - or username is taken, return a 400 error with a message
  // and a prompt to enter a new username.

  let foundClient = null;
  wss.clients.forEach((client) => {
    if (client.authenticated && client.username === oldName) {
      foundClient = client;
    }
  });
  // Run an iteration over all clients to find the client with the old name.
  // Once found, set foundClient to the client requesting a name change.
  if (!foundClient) {
    return res
      .status(404)
      .json({ error: "Active client with the old username not found." });
  }
  // If the client with the old name is not found, return a 404 error.

  foundClient.username = newName;
  // Once found, since foundClient is = client, we can access and change the username
  // and then update the database record below.

  db.run(
    "UPDATE visitors SET username = ? WHERE username = ? AND ip = ?",
    [newName, oldName, foundClient.ip],
    // Updates the row on the visitors table with the new name in place of the old name,
    // only if the old name is in the table and the ip is the same as the client's.
    function (err) {
      if (err) {
        console.error("Error updating username in DB:", err);
        return res
          .status(500)
          .json({ error: "Error updating username in database." });
      }
      // If there is an error, return a 500 error with a message.
      wss.broadcast(`System: ${oldName} has changed their name to ${newName}.`);
      return res
        .status(200)
        .json({ message: "Username updated successfully." });
      // As a final part to the name change process, a Broadcast system message
      // is sent to all users informing them of the name change.
    }
  );
});

/** WebSocket **/
const WebSocketServer = require("ws").Server;
// Imports the WebSocketServer class from the ws module.
const wss = new WebSocketServer({ server: server });
// Instantiating a new WebSocketServer with the HTTP server object that we created
// earlier.

const pingInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.ping();
    }
  });
}, 30000);
// Keep-alive: send a ping every 30 seconds to each client.

wss.on("connection", function connection(ws) {
  // We wil define what happens when a client connects to the WebSocket server here.
  // We are saying that each websocket connection is identified as "ws" in this context.
  ws.ip = ws._socket.remoteAddress;
  // We get the client's IP address from the socket object.
  ws.send("Please enter your name:");
  // When a client connects, we send them a message asking them to enter their name.
  ws.authenticated = false;
  // We set a flag to indicate that the client has not yet authenticated.

  const numClients = wss.clients.size;
  // We get the number of clients currently connected to the WebSocket server
  // on every new connection to the server.
  console.log("Clients connected: " + numClients);
  wss.broadcast(`Current visitors: ${numClients}`);
  // We log and broadcast the amount of clients when new connections occur.

  ws.on("message", function incoming(message) {
    if (typeof message !== "string") {
      message = message.toString();
    }
    // On the event of a message being sent by a ws-client, we check if the message
    // is a string. If not, we convert it to a string.

    if (!ws.authenticated) {
      let proposedUsername = message.trim();
      // If the client is not authenticated, we take the trimmed message as an input and
      // send that through a duplication check against all other client names in the
      // ws connection. If the name is taken, we send an error message to the client.
      let duplicate = false;
      wss.clients.forEach(function (client) {
        if (
          client !== ws &&
          // if the client is not the same client - this way we avoid checking against
          // the client that is currently trying to authenticate.
          client.authenticated &&
          // if the client is authenticated
          client.username === proposedUsername
          // AND if another user's name is equal to the proposed username
        ) {
          duplicate = true;
          // Flag as a duplicate name and prompt user to choose a different name.
        }
      });

      if (duplicate) {
        ws.send("Username already in use, please enter a different name:");
        return;
      }
      // The prompt to select a different name.

      ws.username = proposedUsername;
      // If all checks are passed, the proposedName is not a duplicate and we can
      // assign it to the new client.
      ws.authenticated = true;
      // Set a custom property on the client to indicate they have authenticated.
      ws.joinTime = new Date().toISOString().slice(0, 19).replace("T", " ");
      // Record join time in "YYYY-MM-DD HH:MM:SS" format to compare against message sent times
      ws.send(`Welcome, ${ws.username}!`);
      // Send a welcome message to the new client, or client with name change on re-entry.

      wss.broadcast(`${ws.username} has joined the chat.`);
      // Broadcast join notification to all clients.
      // **wss is the websocket server itself, ws is the client object.**

      db.run(
        `INSERT INTO visitors (count, username, ip, time) VALUES (?, ?, ?, dateTime('now'))`,
        [wss.clients.size, ws.username, ws.ip],
        function (err) {
          if (err) console.error("Error inserting visitor:", err);
        }
      );
      // Insert the current client count, username, IP, and dateTime(now) into the visitors table.

      let connectedUsers = [];
      wss.clients.forEach(function (client) {
        if (client.authenticated) {
          connectedUsers.push(client.username);
        }
      });
      // Get a list of all connected users.
      ws.send("System: Currently connected: " + connectedUsers.join(", "));
      // Send a system message to the new user listing all currently connected authenticated users.

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
      // Load and send only chat messages with a timestamp >= ws.joinTime.
      return;
    }

    console.log(`Received chat message from ${ws.username}:`, message);
    // Process chat message from an authenticated user for server logging.

    db.run(
      `INSERT INTO chat_messages (username, ip, message, time) VALUES (?, ?, ?, dateTime('now'))`,
      [ws.username, ws.ip, message],
      // Stores the chat message in the chat_messages table with the username, IP, and time.
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
                // Broadcast the chat message to all connected users after it has been logged into
                // the chat_messages table.
              }
            }
          );
        }
      }
    );
  });
  // Finish handling the message functionality from clients.

  ws.on("close", function () {
    console.log(`User ${ws.username} disconnected`);
    if (ws.username) {
      wss.broadcast(`${ws.username} has disconnected.`);
      // Broadcast the disconnection message
      db.run(
        "DELETE FROM visitors WHERE username = ? AND ip = ?",
        [ws.username, ws.ip],
        (err) => {
          if (err) {
            console.error("Error deleting visitor:", err);
          }
        }
      );
      // Delete the user from the visitors table and force client back to authentication page.
    }
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });
  // Handle any errors that occur with the websocket connection.
});
// Finish defining the WebSocket connection handling function.

wss.on("error", (err) => {
  console.error("WebSocket error:", err);
});
// Handle any errors that occur with the websocket server.

/** Broadcasts a message to all connected clients. **/
wss.broadcast = function broadcast(data) {
  // Defining the broadcast function to send messages to all connected clients.
  const message = typeof data === "string" ? data : data.toString();
  // The data entailed with each broadcast call is always a message - so we need
  // to convert it to a string if it's not already.
  console.log("Broadcasting:", message);
  wss.clients.forEach(function (client) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
  // Iterate over all connected clients and send the message to each one.
};

/** End WebSocket **/

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
// Handle any uncaught exceptions that occur in the process.

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});
// Handle any unhandled rejections that occur in the process.

process.on("SIGINT", () => {
  clearInterval(pingInterval);
  wss.clients.forEach(function (client) {
    client.close();
  });
  server.close(() => {
    shutdownDB();
  });
});
// Close server and close database connection when SIGINT is received.
