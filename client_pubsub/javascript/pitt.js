var PITT = PITT || {}

PITT.Pitt = function(is_instructor) {
    var INTERFACE = {}
    var user_id
    var instructor = is_instructor
    var state = STATE.NOTHING  // from `globals.js`

    // can't create peer object here, because it automatically tries to connect
    // to the PeerServer.  Thus, `Pitt.init()`.
    var peer

    // create WAMP connection object.  It's not connected *yet*.  We're waiting
    // for `peer` object to connect (in `Pitt.connect()`)
    var wamp = new autobahn.Connection({
        url: "ws://" + window.location.hostname + ":8080/ws",
        realm: "peerinstruction",
        // these settings speed up reconnection
        max_retries: 20,
        initial_retry_delay: 1.0,
        retry_delay_growth: 1.0
    })

    wamp.onopen = function(session) {
        // this happens *always* after successful connection to the
        // PeerServer
        console.log("WAMP connection opened.")

        // now instead of writing `com.peerinstruction.method` simply use
        // `api:method`
        session.prefix("api", "com.peerinstruction")

        if (instructor) {
            // upon arrival, every new instructor should announce themself
            session.publish("api:new_instructor", [], {user_id: user_id})
            // upon closing the page: send "leaving" event
            window.addEventListener("beforeunload", function(event) {
                session.publish("api:instructor_gone", [], {user_id: user_id})
            })
        } else {
            // upon arrival, every new student should announce themself
            session.publish("api:new_student", [], {user_id: user_id})
            // upon closing the page: send "leaving" event
            window.addEventListener("beforeunload", function(event) {
                session.publish("api:student_gone", [], {user_id: user_id})
            })
        }

        session.call("api:get_current_state").then(
            function(result) {
                students = result.students
                instructors = result.instructors
                state = result.state
                console.log(state)
            },
            function(error) {
                // handle this error
                console.error("Couldn't retrieve application's current state!")
            }
        )
    }

    // use this function to init the state of this Pitt object
    var init = function() {
        peer = new Peer({
            host: "/",  // the same hostname as window.location.hostname
            port: 9000,
            debug: DEBUG || 2
        })
    }

    // establish connections to PeerServer and to WAMP router
    var connect = function() {
        if (peer == undefined) {
            init()
        }

        peer.on("open", function(id) {
            user_id = id
            console.log("Connected to PeerServer. New id:", id)

            // open WAMP connection as soon as there's PeerServer connection
            wamp.open()
        })

        peer.on("disconnect", function() {
            console.log("Disconnected from PeerServer. Reconnecting…")
            peer.reconnect()
        })

        peer.on("error", function(error) {
            console.error("PeerJS ERROR!", error)
        })
    };

    INTERFACE.init = init
    INTERFACE.connect = connect
    return INTERFACE
};