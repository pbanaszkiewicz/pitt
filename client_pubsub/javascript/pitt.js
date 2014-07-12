var PITT = PITT || {}

PITT.Pitt = function(is_instructor) {
    var INTERFACE = {}
    var user_id
    var instructor = is_instructor
    var state = STATE.NOTHING  // from `globals.js`

    var students = new Array()  // list of students
    var instructors = new Array()  // list of instructors

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
                updateStudents(students)
                updateInstructors(instructors)
            },
            function(error) {
                // handle this error
                console.error("Couldn't retrieve application's current state!")
            }
        )

        // when a new student arrives, add them to the array
        session.subscribe("api:new_student", on_new_student)

        // when student leaves, remove them from the array
        session.subscribe("api:student_gone", on_student_gone)

        // when a new instructor arrives, add them to the array
        session.subscribe("api:new_instructor", on_new_instructor)

        // when instructor leaves, remove them from the array
        session.subscribe("api:instructor_gone", on_instructor_gone)
    }

    on_new_student = function(args, kwargs, details) {
        console.log("Event: new_student")

        idx = students.indexOf(kwargs["user_id"])
        if (idx == -1)
            students.push(kwargs["user_id"])
        else
            console.log("Student already on the list!")
        updateStudents(students)
    }
    on_student_gone = function(args, kwargs, details) {
        console.log("Event: student_gone")
        idx = students.indexOf(kwargs["user_id"])
        if (idx != -1) students.splice(idx, 1)
        updateStudents(students)
    }
    on_new_instructor = function(args, kwargs, details) {
        console.log("Event: new_instructor")
        idx = instructors.indexOf(kwargs["user_id"])
        if (idx == -1)
            instructors.push(kwargs["user_id"])
        else
            console.log("Instructor already on the list!")
        updateInstructors(instructors)
    }
    on_instructor_gone = function(args, kwargs, details) {
        console.log("Event: instructor_gone")
        idx = instructors.indexOf(kwargs["user_id"])
        if (idx != -1) instructors.splice(idx, 1)
        updateInstructors(instructors)
    }

    /***************
    PUBLIC INTERFACE
    ***************/

    // use this function to init the state of this Pitt object
    var init = function() {
        peer = new Peer({
            host: "/",  // the same hostname as window.location.hostname
            port: 9000,
            debug: DEBUG || 2
        })
    }

    // establish connections to PeerServer
    var connect_peer = function() {
        if (peer == undefined) {
            init()
        }

        peer.on("open", function(id) {
            user_id = id
            console.log("Connected to PeerServer. New id:", user_id)
            updateUserId(id)
        })

        peer.on("disconnect", function() {
            console.log("Disconnected from PeerServer. Reconnecting…")
            peer.reconnect()
        })

        peer.on("error", function(error) {
            console.error("PeerJS ERROR!", error)
        })
    };

    // establish connections to WAMP router
    var connect_wamp = function() {
        if (peer == undefined || peer.disconnected === true) {
            connect_peer()
        }

        // open WAMP connection if there's PeerServer connection
        if (user_id === undefined) {
            setTimeout(connect_wamp, 100)
        } else {
            wamp.open()
        }
    }

    var updateUserId = function(id) {}
    var updateStudents = function(students) {}
    var updateInstructors = function(instructors) {}

    INTERFACE.init = init
    INTERFACE.connect_peer = connect_peer
    INTERFACE.connect_wamp = connect_wamp
    INTERFACE.getUserId = function() {return user_id}
    INTERFACE.onUpdateUserId = function(_c) {updateUserId = _c}
    INTERFACE.onUpdateStudents = function(_c) {updateStudents = _c}
    INTERFACE.onUpdateInstructors = function(_c) {updateInstructors = _c}
    return INTERFACE
};