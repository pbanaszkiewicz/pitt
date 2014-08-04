var PITT = PITT || {}

PITT.Pitt = function(is_instructor) {
    var INTERFACE = {}
    var user_id
    var instructor = is_instructor
    var student = !is_instructor
    var user_media
    var state = STATE.NOTHING  // from `globals.js`
    var state_data = {}  // additional data associated with current state, like
                         // broadcaster ID…

    var students = []  // list of students
    var instructors = []  // list of instructors
    var active_calls = {}  // list of peers that we have active call with
    var students_in_room = []  // list of peers that are within the same room
    var room_id  // the name of the room we're in

    // can't create peer object here, because it automatically tries to connect
    // to the PeerServer.  Thus, `Pitt.init()`.
    var peer

    // create WAMP connection object.  It's not connected *yet*.  We're waiting
    // for `peer` object to connect (in `Pitt.connect()`)
    var wamp = new autobahn.Connection({
        url: "ws://" + window.location.hostname + ":9002/ws",
        realm: "peerinstruction",
        // these settings speed up reconnection
        max_retries: 20,
        initial_retry_delay: 1.0,
        retry_delay_growth: 1.0
    })

    /**********
    "ON" EVENTS
    **********/

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

        session.call("api:get_current_state", [], {user_id: user_id}).then(
            function(result) {
                students = result.students
                instructors = result.instructors
                state = result.state
                state_data = result.state_data

                // update chat
                var chat_history = result.chat_history
                for (var i = 0; i < chat_history.length; i++) {
                    var chat = chat_history[i]
                    newChatMessage(chat.user_id, chat.message, chat.timestamp)
                };

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
                    console.log("Asking the broadcaster to call me")
                    session.publish("api:call_me", [user_id])
                } else if (state == STATE.SMALL_GROUPS && student) {
                    // the server has given a room to join, so let's ask the
                    // peers in that room to call us
                    var join_room = state_data["join_room"]
                    console.log("Asking peers in the room to call me")

                    session.publish("api:call_me_" + join_room, [user_id,
                                    join_room])

                    room_id = join_room
                } else if (state == STATE.COUNTDOWN) {
                    // show the countdown? Call in before that?
                }
            },
            function(error) {
                // handle this error
                console.error("Couldn't retrieve application's current state!",
                              error)
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

        if (student) {
            // when group mode is started
            session.subscribe("api:split_mode_enabled", on_split_mode_enabled)
            // or stopped
            session.subscribe("api:split_mode_disabled",
                              on_split_mode_disabled)

            // whenever any room's occupation changes or whenever students
            // are moved between rooms while in STATE.SMALL_GROUPS, update
            // the list of students in the same room and the list of rooms
            session.subscribe("api:rooms_update", on_rooms_update)
        }

        session.subscribe("api:counting_down", on_counting_down)

        session.subscribe("api:ping", on_ping)

        session.subscribe("api:chat_message", on_chat_message)
    }
    wamp.onclose = function(reason, details) {
        console.error("WAMP connection ERROR!", reason, details)
    }

    on_new_student = function(args, kwargs, details) {
        console.log("Event: new_student")

        var index = students.indexOf(kwargs["user_id"])
        if (index == -1)
            students.push(kwargs["user_id"])
        else
            console.log("Student already on the list!")
        updateStudents(students)
    }

    on_student_gone = function(args, kwargs, details) {
        console.log("Event: student_gone")

        var student_id = kwargs["user_id"]
        var index = students.indexOf(student_id)
        if (index != -1) students.splice(index, 1)

        updateStudents(students)

        // if we're in SMALL_GROUPS mode, let's find out if the student had
        // a call with us
        if (state == STATE.SMALL_GROUPS && student_id in active_calls) {
            active_calls[student_id].close()
            active_calls[student_id] = undefined
            droppedCall(student_id)
        }
        if (state == STATE.SMALL_GROUPS &&
            students_in_room.indexOf(student_id) !== -1) {
            students_in_room.splice(index, 1)
            updateStudentsInRoom(students_in_room)
        }
    }

    on_new_instructor = function(args, kwargs, details) {
        console.log("Event: new_instructor")
        var index = instructors.indexOf(kwargs["user_id"])
        if (index == -1)
            instructors.push(kwargs["user_id"])
        else
            console.log("Instructor already on the list!")
        updateInstructors(instructors)
    }

    on_instructor_gone = function(args, kwargs, details) {
        console.log("Event: instructor_gone")
        var index = instructors.indexOf(kwargs["user_id"])
        if (index != -1) instructors.splice(index, 1)
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
        var peer_id = args[0]
        var peer_room_id = args[1]

        // in case we're in SMALL_GROUPS mode, both vars will be names (for
        // example "room0" and "room1") and will only match if the callee wants
        // to be in the same room as caller
        // in case we're in BROADCAST mode,
        if (peer_room_id == room_id) {
            console.log("Event: call_me. Someone wants me to call them:",
                        peer_id)
            if (active_calls[peer_id] === undefined) {
                call = peer.call(peer_id, user_media,
                                 {metadata: {mode: state}})
                active_calls[peer_id] = call

                call.on("stream", function(stream) {
                    console.log("Callee just answered my call!")
                    incomingCall(stream, call)
                })
                call.on("close", function() {
                    console.log("PeerJS MediaConnection closed, call with:",
                                call.peer)
                    droppedCall(call.peer)
                })
                call.on("error", function(error) {
                    console.error("PeerJS MediaConnection ERROR!", error)
                    droppedCall(call.peer, error)
                })
            }
        }
    }

    on_split_mode_enabled = function(args, kwargs, details) {
        // only students subscribe to this event, right?
        var students_in_rooms = kwargs["students_in_rooms"]
        var rooms = kwargs["rooms"]
        var my_room = students_in_rooms[user_id]
        room_id = my_room

        students_in_room = rooms[my_room]
        console.log("Event: split_mode_enabled. I'm in the room", my_room,
                    "with", students_in_room)
        updateStudentsInRoom(students_in_room)

        // What about lost peers? What about late peers calling in?
        // Someone joins / recalls, they simply publish api:call_me with their
        // peer ID and room # and this peer calls them back.
        // `call_me_subscription` is required to unsubscribe in the
        // `on_split_mode_disabled` method

        wamp.session.subscribe("api:call_me_" + my_room, on_call_me).then(
            function(subscription) {
                console.log("Subscribed to api:call_me_" + my_room)
                call_me_subscription = subscription
            },
            function(error) {
                console.error("Couldn't subscribe to api:call_me_" + my_room,
                              error)
            }
        )

        // switch to "call on demand" model from "calling everyone and
        // throwing race conditions everywhere"
        wamp.session.publish("api:call_me_" + my_room, [user_id, my_room])
    }

    on_split_mode_disabled = function(args, kwargs, details) {
        // only students subscribe to this event, right?
        students_in_room = []
        console.log("Event: split_mode_disabled.")
        updateStudentsInRoom(students_in_room)

        // close all the calls
        var calls_to_close = Object.keys(active_calls)
        for (var i = 0; i < calls_to_close.length; i++) {
            var call = calls_to_close[i]
            console.log("Closing call with", call)
            active_calls[call].close()
            active_calls[call] = undefined
        }
        active_calls = {}
        room_id = undefined

        wamp.session.unsubscribe(call_me_subscription)
        call_me_subscription = undefined
        console.log("Unsubscribed from api:call_me (maybe with `_roomN`)")
    }

    on_counting_down = function(args, kwargs, details) {
        // the server counts down from, e.g., 30
        // so we receive this publication every second and want to update our
        // counter
        var time = args[0]
        updateCountdown(time)
    }

    on_rooms_update = function(args, kwargs, details) {
        var students_in_rooms = kwargs["students_in_rooms"]
        var rooms = kwargs["rooms"]
        var my_room = students_in_rooms[user_id]
        room_id = my_room

        students_in_room = rooms[my_room]
        console.log("Event: rooms update. I'm in the room", my_room,
                    "with", students_in_room)
        updateStudentsInRoom(students_in_room)
    }

    on_ping = function(args, kwargs, details) {
        // we need to answer this ping ASAP
        console.log("Pinged by the server")
        wamp.session.call("api:pong", [user_id])
        console.log("Ponged back")
    }

    on_chat_message = function(args, kwargs, details) {
        author = kwargs["user_id"]
        message = kwargs["message"]
        timestamp = new Date()
        console.log("New message from:", author)

        newChatMessage(author, message, timestamp)
    }

    /***************
    PUBLIC INTERFACE
    ***************/

    // use this function to init the state of this Pitt object
    var init = function(success_callback, error_callback) {
        var video_constrains = {
            mandatory: {
                maxWidth: 640
                // maxHeight: 480 - forcing one parameter is enough, otherwise
                //                  there are some issues with browsers
            },
            optional: []
        }

        navigator.getUserMedia(
            {audio: true, video: video_constrains},
            function(stream) {
                user_media = stream
                success_callback(stream)

                peer = new Peer({
                    host: "/",  // the same as window.location.hostname
                    port: 9000,
                    debug: DEBUG || 2,
                    config: {"iceServers": [
                        // our very own rfc5766 STUN&TURN server
                        {
                            url: "turn:patchculture.org:3478",
                            username: "peer",
                            credential: "peerinstruction"
                        },
                        {
                            url: "stun:stun.l.google.com:19302"
                        }
                    ]}
                })

                connect_peer()
                connect_wamp()
                // if (_wait_for_wamp) {
                //     _wait_for_wamp = false
                //     connect_wamp()
                // }
            },
            function(error) {
                // ooops… can't continue then.
                wamp = undefined
                peer = undefined
                error_callback(error)
            }
        )
    }

    // establish connections to PeerServer
    var connect_peer = function() {
        // wait for proper connection from PeerServer
        if (peer === undefined || peer.disconnected === true) {
            setTimeout(connect_peer, 100)
        } else {
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
                        console.log("call stream event (BROADCASTING)")
                        incomingCall(stream, call)
                    })
                } else if (call.metadata.mode == STATE.SMALL_GROUPS) {
                    // answer only if we don't have the connection with that
                    // peer yet
                    if (active_calls[call.peer] === undefined) {
                        call.answer(user_media)
                        active_calls[call.peer] = call
                        call.on("stream", function(stream) {
                            if (active_calls[call.peer] !== undefined) {
                                console.log("call stream event (SMALL_GROUPS)")
                                incomingCall(stream, call)
                            }
                        })
                    }
                }
            })
        }
    };

    // establish connections to WAMP router
    var connect_wamp = function() {
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
        // 1. get user media (this should happen right at the beginning), so
        // lets ignore for now

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
        var calls_to_close = Object.keys(active_calls)
        for (var i = 0; i < calls_to_close.length; i++) {
            var call = calls_to_close[i]
            console.log("Closing call with", active_calls[call].peer)
            active_calls[call].close()
        }
        // 2. publish state change
        wamp.session.publish("api:state_changed", [STATE.NOTHING], {},
                             {exclude_me: false})  // we'll receive it too
        // 3. unsubscribe from "on_call_me" event
        wamp.session.unsubscribe(call_me_subscription)
        call_me_subscription = undefined
    }

    var start_split_mode = function(group_size) {
        // other instructors should not be able to stop broadcaster, but let's
        // check just in case
        if (state == STATE.BROADCASTING && state_data.broadcaster == user_id) {
            stop_broadcast()
        }

        // I think there might be a race condition, so lets just pause for
        // a second (almost)
        if (state != STATE.NOTHING) {
            setTimeout(start_split_mode, 100)
            return;
        }

        wamp.session.publish("api:state_changed", [STATE.SMALL_GROUPS],
                             {initializer: user_id},
                             {exclude_me: false})

        wamp.session.call("api:init_split_mode", [], {size: group_size}).then(
            function(success) {
                console.log("Split mode has been enabled")
            },
            function(error) {
                console.error("Split mode ERROR!", error, error.args,
                              error.kwargs, error.error)
            }
        )
    }

    var stop_split_mode = function() {
        // any instructor can end the split mode
        wamp.session.call("api:end_split_mode").then(
            function(success) {
                console.log("Split mode has been disabled")
                wamp.session.publish("api:state_changed", [STATE.NOTHING],
                                     {}, {exclude_me: false})
            },
            function(error) {
                console.error("Split mode end ERROR!", error, error.error)
            }
        )
    }

    var countdown = function(countdown_time) {
        wamp.session.publish("api:state_changed", [STATE.COUNTDOWN],
                             {initializer: user_id},
                             {exclude_me: false})

        wamp.session.call("api:start_counting_down", [countdown_time]).then(
            function(success) {
                console.log("Initiated countdown")
            },
            function(error) {
                console.error("Countdown initialization ERROR!", error,
                              error.error)
            }
        )
    }

    var send_message = function(message) {
        var data = {user_id: user_id, message: message}
        wamp.session.publish("api:chat_message", [], data, {exclude_me: false})
    }

    var updateUserId = function(id) {}
    var updateStudents = function(students) {}
    var updateInstructors = function(instructors) {}
    var updateState = function(state, state_data) {}
    var incomingCall = function(stream, call) {}
    var droppedCall = function(peer_id, reason) {}
    var updateStudentsInRoom = function(students) {}
    var updateCountdown = function(t) {}
    var newChatMessage = function(u, m, t) {}

    INTERFACE.init = init
    // INTERFACE.connect_peer = connect_peer
    // INTERFACE.connect_wamp = connect_wamp

    INTERFACE.getUserId = function() {return user_id}

    INTERFACE.onUpdateState = function(_c) {updateState = _c}
    INTERFACE.onUpdateUserId = function(_c) {updateUserId = _c}
    INTERFACE.onUpdateStudents = function(_c) {updateStudents = _c}
    INTERFACE.onUpdateInstructors = function(_c) {updateInstructors = _c}
    INTERFACE.onIncomingCall = function(_c) {incomingCall = _c}
    INTERFACE.onDroppedCall = function(_c) {droppedCall = _c}
    INTERFACE.onUpdateStudentsInRoom = function(_c) {updateStudentsInRoom = _c}
    INTERFACE.onUpdateCountdown = function(_c) {updateCountdown = _c}
    INTERFACE.onNewChatMessage = function(_c) {newChatMessage = _c}

    INTERFACE.start_broadcast = start_broadcast
    INTERFACE.stop_broadcast = stop_broadcast

    INTERFACE.start_split_mode = start_split_mode
    INTERFACE.stop_split_mode = stop_split_mode
    INTERFACE.countdown = countdown
    INTERFACE.send_message = send_message

    return INTERFACE
}