var cfenv = require("cfenv");

var appEnv = cfenv.getAppEnv();
var amqpURI = appEnv.getServiceCreds("rails-rabbitmq");

if(amqpURI) {
    amqpURI = amqpURI.uri.toString();
} else {
    amqpURI = "amqp://guest:guest@localhost:5672";
}
console.log("amqpURI: "+amqpURI);
var http = require("http"),
    amqp = require("amqp"),
    socketio = require("socket.io"),
    express = require("express"),
    session = require("express-session"),
    cookieParser = require("cookie-parser"),
    parseCookie = require("cookie"),
    rabbitMq = amqp.createConnection({url: amqpURI}),
    app = express(),
    server = http.createServer(app),
    io = socketio.listen(server),
    sessionStore = new session.MemoryStore();

app.use(express.static(__dirname));
app.use(cookieParser);
app.use(session({store:sessionStore, key:'jsessionid', secret:'secret', saveUninitialized: true, resave: true}));

rabbitMq.on("ready", function () {
  var queue = rabbitMq.queue("hr-app.cfapps.io.employee", function () {
    queue.bind("#"); // to all messages

    queue.subscribe(function (message) {
      console.log(message.data.toString());
      io.sockets.emit("newMsg", message.data.toString());
    });
  });
});

app.get("/", function (req, res) {
  req.session.user = "user1";
  res.sendfile(__dirname + "/index.html");
});

server.listen(appEnv.port, appEnv.bind, function() {
  console.log("server starting on " + appEnv.url)
});

var Session = session.Session;
io.set('authorization', function (data, accept) {
  // check if there's a cookie header
  if (data.headers.cookie) {
       console.log("found cookie header");
       data.cookie = parseCookie.parse(data.headers.cookie);
       data.sessionID = data.cookie['jsessionid'];
       data.sessionStore = sessionStore;
       sessionStore.get(data.sessionID, function (err, session) {
          data.session = new Session(data, session);
          return accept(null, true);
        });
  } else {
        // if there isn't, turn down the connection with a message
        // and leave the function.
        console.log("No cookie transmitted.");
        return accept('No cookie transmitted.', false);
  }
});

io.sockets.on('connection', function(socket) {
  var hs = socket.handshake;
  console.log("A socket with sessionID " + hs.sessionID + " connected!");
  socket.on('disconnect', function () {
     console.log('A socket with sessionID ' + hs.sessionID+ ' disconnected!');
  });
});