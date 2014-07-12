var PITT = PITT || {}

PITT.Pitt = function(is_instructor) {
    var INTERFACE = {}
    var user_id
    var instructor = is_instructor
    var user_media
    var state = STATE.NOTHING  // from `globals.js`
    var state_data = {}  // additional data associated with current state, like
                         // broadcaster ID…

    var students = []  // list of students
    var instructors = []  // list of instructors
    var active_calls = {}  // list of peers that we have active call with

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
                state_data = result.state_data

                updateStudents(students)
                updateInstructors(instructors)
                updateState(state, state_data)
                // depending on what current application state is, we're gonna
                // need to do something
                // for example, if there's a broadcast going on, we'll ask the
                // broadcaster to call us
                // if there are group discussions going on, we'll ask the
                // server to appoint a group for us and then we'll call group
                // members
                if (state == STATE.BROADCASTING) {
                    session.publish("api:call_me", [user_id])
                } else if (state == STATE.SMALL_GROUPS) {
                    // do something?
                } else if (state == STATE.COUNTDOWN) {
                    // show the countdown? Call in before that?
                }
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

        // when someone changes global application state (starts broadcasting
        // or splits students into groups)
        session.subscribe("api:state_changed", on_state_change)
    }
    wamp.onclose = function(reason, details) {
        console.error("WAMP connection ERROR!", reason, details)
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

    on_state_change = function(args, kwargs, details) {
        console.log("Event: on_state_change")
        state = args[0]
        state_data = kwargs
        updateState(state, state_data)
    }

    // we need a global variable to hold information about a WAMP subscription
    // so that it's possible to unsubscribe from it later :/
    var call_me_subscription

    on_call_me = function(args, kwargs, details) {
        peer_id = args[0]
        console.log("Event: call_me. Someone wants me to call them:",
                    peer_id)
        if (active_calls[peer_id] === undefined) {
            call = peer.call(peer_id, user_media,
                             {metadata: {mode: STATE.BROADCASTING}})
            active_calls[peer_id] = call
        }
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

        peer.on("call", function(call) {
            console.log("Incoming call from:", call.peer)
            if (call.metadata.mode == STATE.BROADCASTING) {
                call.answer()
                call.on("stream", function(stream) {
                    console.log("call stream event")
                    incomingCall(stream, call)
                })
            }
        })
    };

    // establish connections to WAMP router
    var connect_wamp = function() {
        if (peer == undefined || peer.disconnected === true) {
            connect_peer()
        }

        // open WAMP connection if there's PeerServer connection
        // there's lag before peer.disconnected becomes false and
        // peer.on('open') happens - and we're interested in the latter, thus
        // waiting for `user_id`
        if (user_id === undefined) {
            setTimeout(connect_wamp, 100)
        } else {
            wamp.open()
        }
    }

    var start_broadcast = function(success_callback, error_callback) {
        // 1. get user media
        navigator.getUserMedia(
            {audio: true, video: true},
            function(stream) {
                user_media = stream

                // 2. set state: broadcasting (with additional data: user_id)
                wamp.session.publish("api:state_changed", [STATE.BROADCASTING],
                                     {broadcaster: user_id},
                                     {exclude_me: false})  // we'll receive too
                success_callback(user_media)

                // 3. call students & instructors!
                var call
                for (var i = 0; i < students.length; i++) {
                    console.log("Calling student:", students[i])
                    call = peer.call(students[i], user_media,
                                     {metadata: {mode: STATE.BROADCASTING}})
                    active_calls[ students[i] ] = call
                }
                for (var i = 0; i < instructors.length; i++) {
                    if (instructors[i] != user_id) {
                        console.log("Calling instructor:", instructors[i])
                        call = peer.call(instructors[i], user_media,
                                        {metadata: {mode: STATE.BROADCASTING}})
                        active_calls[ instructors[i] ] = call
                    }
                }
            },
            error_callback
        )

        // 4. what about lost peers? What about late peers calling in?
        // someone joins / recalls, they simply publish api:call_me with their
        // peer ID and this broadcaster calls them back
        // `call_me_subscription` is required to unsubscribe in the
        // `stop_broadcast` method
        wamp.session.subscribe("api:call_me", on_call_me).then(
            function(subscription) {
                call_me_subscription = subscription
            }
        )
    }
    var stop_broadcast = function() {
        // 1. disconnect all connected peers
        calls_to_close = Object.keys(active_calls)
        for (var i = 0; i < calls_to_close.length; i++) {
            call = calls_to_close[i]
            console.log("Closing call with", active_calls[call].peer)
            active_calls[call].close()
        }
        // 2. close media stream
        if (user_media !== undefined) {
            user_media.stop()
            user_media == undefined
        }
        // 3. publish state change
        wamp.session.publish("api:state_changed", [STATE.NOTHING], {},
                             {exclude_me: false})  // we'll receive it too
        // 4. unsubscribe from "on_call_me" event
        wamp.session.unsubscribe(call_me_subscription)
        call_me_subscription = undefined
    }

    var updateUserId = function(id) {}
    var updateStudents = function(students) {}
    var updateInstructors = function(instructors) {}
    var updateState = function(state, state_data) {}
    var incomingCall = function(stream) {}

    INTERFACE.init = init
    INTERFACE.connect_peer = connect_peer
    INTERFACE.connect_wamp = connect_wamp
    INTERFACE.getUserId = function() {return user_id}
    INTERFACE.onUpdateState = function(_c) {updateState = _c}
    INTERFACE.onUpdateUserId = function(_c) {updateUserId = _c}
    INTERFACE.onUpdateStudents = function(_c) {updateStudents = _c}
    INTERFACE.onUpdateInstructors = function(_c) {updateInstructors = _c}
    INTERFACE.onIncomingCall = function(_c) {incomingCall = _c}
    INTERFACE.start_broadcast = start_broadcast
    INTERFACE.stop_broadcast = stop_broadcast
    return INTERFACE
};