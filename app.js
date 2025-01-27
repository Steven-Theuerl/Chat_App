const http = require('http');

http.createServer(function(req, res) {
	res.write("Almost a full snack Engineer! Doing great work over here so far.");
	res.end();
}
).listen(3000);

console.log("Server started on port 3000");
