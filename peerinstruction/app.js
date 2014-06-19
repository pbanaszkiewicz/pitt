var path = require("path")
var express = require("express")
var AutobahnConnection = require("./backend_logic")
var PeerServer = require("peer").PeerServer
var routes = require("./routes/index")

function Application() {
    this.app = express()
    this.app.set("views", path.join(__dirname, "views"))
    this.app.set("view engine", "html")
    this.app.engine("html", require("hbs").__express)
    this.app.use(express.static(path.join(__dirname, "public")))
    // this.app.use('/', express.static(__dirname + '/../client_pubsub'))
    this.app.use("/", routes)

    this.peer_server = new PeerServer({port: 9000})

    // TODO: this should be an object
    this.autobahn_connection = AutobahnConnection
}

// app.app.listen(9001);
// app.autobahn_connection.open()

module.exports = Application