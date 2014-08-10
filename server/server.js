#!/usr/bin/env node

var express = require('express')
var autobahn = require('autobahn')
var PeerServer = require('peer').PeerServer

var app = express()
var peer_server = new PeerServer({port: 9000})

app.use('/', express.static(__dirname + '/../client'));
app.listen(9001);

var connection = new autobahn.Connection({
    url: "ws://localhost:9002/ws",
    realm: "peerinstruction"
})

var students = []
var instructors = []
var rooms = {}  // rooms contain arrays of students
var students_rooms = {}  // student->room relation
// for example, when rooms["room1"] = Array("student1", "student2")
// then students_rooms["student1"] = "room1" and
// students_rooms["student2"] = "room1"
var chat_history = {"global": []}  // array containing chat messages

// the STATE can go like this:
//  NOTHING → BROADCASTING, NOTHING → SMALL_GROUPS
//  BROADCASTING → SMALL_GROUPS
//  SMALL_GROUPS → COUNTDOWN
//  COUNTDOWN → NOTHING, COUNTDOWN → BROADCASTING
var STATE = {
    NOTHING: 0,  // nothing's happening
    BROADCASTING: 1,  // some instructor is broadcasting
    SMALL_GROUPS: 2,  // students talk in small groups
    COUNTDOWN: 3  // small group discussions should end as soon as countdown
                  // finishes
}
var state = STATE.NOTHING
var state_data = {}

// PINGs: this is a beta functionality.  I'm not sure if this is even
// required, but I wrote the code anyway.
var PING = true
var PING_TIMEOUT = 60  // 1 minute
var PINGED = []  // the list of users that were ping'd
var PING_BACKS = []  // the list of users that pong'd
var ping_interval

// this is a utility function, maybe in the future this should be moved to
// a separate module?
var shortest_array_in_set = function(set) {
    // find shortest array in the set, ie. object like:
    // {"a": [1, 2, 3], "b": [1, 2], "c": [1, 2, 3, 4]}
    // the shortest is "b" with length of 2
    var names = Object.keys(set)
    var min = set[ names[0] ].length
    var min_room = names[0]
    for (var i = 0; i < names.length; i++) {
        if (set[ names[i] ].length < min) {
            min = set[ names[i] ].length
            min_room = names[i]
        }
    }
    return min_room
}

connection.onopen = function(session) {
    console.log("Autobahn connection opened.")

    // now instead of writing `com.peerinstruction.method` simply use
    // `api:method`
    session.prefix("api", "com.peerinstruction")

    // when a new student arrives, add them to the array and redraw DOM list
    session.subscribe("api:new_student", function(args, kwargs, details) {
        console.log("Event: new_student")
        var index = students.indexOf(kwargs["user_id"])
        if (index == -1)
            students.push(kwargs["user_id"])
    })

    // when student leaves, remove them from the array and redraw DOM list
    session.subscribe("api:student_gone", function(args, kwargs, details) {
        console.log("Event: student_gone")

        var student_id = kwargs["user_id"]

        // remove 1 element starting at index of the leaving user
        var index = students.indexOf(student_id)
        if (index != -1) students.splice(index, 1)

        // if STATE.SMALL_GROUPS, remove the student from `rooms` and from
        // `students_rooms`...
        if (state == STATE.SMALL_GROUPS && student_id in students_rooms) {
            var room = students_rooms[student_id]

            // remove from students <-> rooms relationship table
            delete students_rooms[student_id]

            // remove from the room
            var index = rooms[room].indexOf(student_id)
            if (index != -1) rooms[room].splice(index, 1)

            console.log("Student removed from `rooms` and `students_rooms`")

            // if there's only 1 peer within the room, let's put them
            // somewhere else (a different room)
            if (rooms[room].length == 1) {
                lone_student = rooms[room].pop()
                delete rooms[room]

                // TODO: show notification for ~10s and then switch rooms?

                // we choose to switch the user to the least crowded room
                // DON'T run this on the set of rooms that include `room`,
                // because most probably that's the shortest one
                var min_room = shortest_array_in_set(rooms)

                console.log("Moving lone student from room", room,
                            "to room", min_room)

                rooms[min_room].push(lone_student)
                students_rooms[lone_student] = min_room

                // asking peers in the existing room to call the incoming
                // student on student's behalf
                session.publish("api:call_me_" + min_room,
                                [lone_student, min_room])
                console.log("Called in on student's behalf")

                // let know all the users that something has changed
                session.publish(
                    "api:rooms_update", [],
                    {
                        rooms: rooms,
                        students_in_rooms: students_rooms
                    }
                )
            }
        }
    })

    // when a new instructor arrives, add them to the array and redraw DOM
    // list
    session.subscribe("api:new_instructor", function(args, kwargs,
                                                     details) {
        console.log("Event: new_instructor")
        var index = instructors.indexOf(kwargs["user_id"])
        if (index == -1)
            instructors.push(kwargs["user_id"])
    })

    // when instructor leaves, remove them from the array and redraw DOM
    // list
    session.subscribe("api:instructor_gone", function(args, kwargs,
                                                      details) {
        console.log("Event: instructor_gone")

        id = kwargs["user_id"]

        // remove 1 element starting at index of the leaving user
        var index = instructors.indexOf(id)
        if (index != -1) instructors.splice(index, 1)

        // corner case: broadcaster's leaving without changing state
        if (state == STATE.BROADCASTING && state_data.broadcaster == id) {
            session.publish("api:state_changed", [STATE.NOTHING], {},
                            {exclude_me: false})  // let the server receive
                                                  // it, too
        }

        // corner case: there are no more instructors to conduct the switch
        // from groups mode back to nothing. We have to enforce state change
        if (instructors.length == 0 && state == STATE.SMALL_GROUPS) {
            console.log("The last instructor has gone. Switching from" +
                        " SMALL_GROUPS to NOTHING")

            session.publish("api:state_changed", [STATE.COUNTDOWN], {},
                            {exclude_me: false})

            // fixed 30-seconds countdown
            session.call("api:start_counting_down", [30])
        }

    })

    // simple RPC for newcomers
    session.register("api:get_current_state", function(args, kwargs,
                                                       details) {
        console.log("Event: receive application's current state")

        if (state == STATE.SMALL_GROUPS) {
            // select a room for that newcomer
            var user_id = kwargs["user_id"]
            if (students.indexOf(user_id) !== -1 &&
                students_rooms[user_id] == undefined) {

                if (Object.keys(rooms).length == 0) {
                    // there aren't any rooms, so create a new one
                    var new_room = "room0"

                    state_data["join_room"] = new_room

                    rooms[new_room] = [user_id]
                    students_rooms[user_id] = new_room
                } else {
                    // let's put them in the room with lowest number of
                    // students
                    var min_room = shortest_array_in_set(rooms)
                    state_data["join_room"] = min_room

                    rooms[min_room].push(user_id)
                    students_rooms[user_id] = min_room
                }

                // let everyone know that rooms attendees have changed
                session.publish(
                    "api:rooms_update", [],
                    {
                        rooms: rooms,
                        students_in_rooms: students_rooms
                    }
                )
            }
        } else {
            state_data["join_room"] = undefined
        }

        return {
            students: students,
            instructors: instructors,
            state: state,
            state_data: state_data,
            chat_history: chat_history["global"]
        }
    })

    session.subscribe("api:state_changed", function(args, kwargs, details) {
        state = args[0]
        console.log("State changed: ", state)
        state_data = kwargs
    })

    // first step to split students into smaller groups is to initialize
    // split-mode - via this RPC command
    session.register("api:init_split_mode", function(args, kwargs,
                                                     details) {
        // in worst case (odd number of students) there's one student
        // without peers
        var students_per_room = parseInt(kwargs["size"] || 2, 10)

        console.log("Event: some instructor initialized split mode with" +
                    " the size of", students_per_room)

        // first the state needs to change, then we can initialize the split
        if (state != STATE.SMALL_GROUPS) {
            throw new autobahn.Error("api:mode_change_error")
        }

        // remember: first state changes, then we init the split
        // state = STATE.SMALL_GROUPS

        students_count = students.length

        // corner case: there's less students than required split size
        // so let's fix the split size to be equal to the number of students
        if (students_count <= students_per_room) {
            students_per_room = students_count
            console.log("There's too few students to split into more" +
                        " than one group.  The split size was changed.")
        }

        // put students into rooms
        rooms = {}
        students_rooms = {}
        var j = 0
        for (var i = 0; i < students_count; i += students_per_room) {
            rooms["room" + j] = students.slice(i, i + students_per_room)

            // save student and corresponding room in students_rooms
            for (var k = i;
                 k < Math.min(i + students_per_room, students_count); k++) {
                student = students[k]
                students_rooms[student] = "room" + j
            }

            j++
        }

        // if in the last room there's only one student, move them to the
        // preceding room
        // we need to look out for cases when there are no students or only
        // one student at all
        if (("room" + (j - 1) in rooms) &&
            ("room" + (j - 2) in rooms) &&
            (rooms["room" + (j - 1)].length == 1))
        {
            lone_student = rooms["room" + (j - 1)].pop()
            rooms["room" + (j - 2)].push(lone_student)
            students_rooms[lone_student] = "room" + (j - 2)
            delete rooms["room" + (j - 1)]
        }

        console.log("Students have been split into groups of",
                    students_per_room)
        console.log("Rooms:", rooms)
        console.log("Students <-> rooms:", students_rooms)

        // announce split mode to every peer (including instructors)
        session.publish("api:split_mode_enabled", [],
                        {rooms: rooms, students_in_rooms: students_rooms})

        // erase all rooms' chat history
        chat_history = {global: chat_history["global"]}

        return state
    })

    // any instructor is allowed to deactivate split-mode by simply invoking
    // this RPC command
    session.register("api:end_split_mode", function(args, kwargs, details) {

        // can't end when in a different mode than COUNTDOWN or SMALL_GROUPS
        if (state != STATE.SMALL_GROUPS && state != STATE.COUNTDOWN) {
            throw new autobahn.Error("api:mode_change_error")
        }
        console.log("Event: some instructor ended split mode")

        // state = STATE.BROADCASTING
        rooms = {}
        students_rooms = {}

        // announce end of split mode to every peer (including instructors)
        session.publish("api:split_mode_disabled", [])

        return state
    })

    // students willing to get information about their room call this
    // procedure
    // DEPRECATED
    session.register("api:get_room_information",
        function(args, kwargs, details) {
            console.log("Event: some student wants to know their room")

            user_id = kwargs["user_id"]
            result = rooms[ students_rooms[user_id] ]
            if (result) return result
            else return false;
        }
    )

    session.register("api:start_counting_down", function(args, kwargs,
                     details) {

        var callback = function(time) {
            console.log("Counting down: ", time)
            if (time > 0) {
                session.publish("api:counting_down", [time])
                setTimeout(callback, 1000, time - 1)
            } else if (time == 0) {
                // let's mimic instructor's browser behavior
                session.call("api:end_split_mode").then(
                    function(success) {
                        console.log("Split mode has been disabled")
                        session.publish("api:state_changed",
                                             [STATE.NOTHING],
                                             {}, {exclude_me: false})
                    },
                    function(error) {
                        console.error("Split mode end ERROR!", error,
                                      error.error)
                    }
                )
            }
        }
        callback(args[0])
    })

    session.register("api:pong", function(args, kwargs, details) {
        var name = args[0]
        console.log("Got a pong back! From", name)
        PING_BACKS.push(name)
    })

    // proceed only if we agreed on using PINGs
    if (PING === true) {
        ping_interval = setInterval(ping_fnc, PING_TIMEOUT * 1000, session)
    }

    session.subscribe("api:chat_message", function(args, kwargs, details) {
        var user = kwargs["user_id"]
        var msg = kwargs["message"]
        var time = new Date()
        var room = kwargs["room"] || "global"

        if (!chat_history.hasOwnProperty(room)) {
            chat_history[room] = []
        }
        chat_history[room].push({user_id: user, message: msg, timestamp: time})
    })
}

connection.onclose = function(reason, details) {
    if (reason == "unreachable") {
        console.error("Can't open Autobahn connection, retrying in 1s...")
        setTimeout(connection.open, 1000)
    }
}

var ping_fnc = function(session) {
    // only if we have opened the session AND we have some peers connected
    if (session.isOpen) {
        if (instructors.length != 0 || students.length != 0) {
            console.log("Sending ping")

            // proceed only if there's an active connection and we actually
            // pinged someone
            if (PINGED.length != 0) {
                // get the list of users that didn't pong back
                for (var i = 0; i < PING_BACKS.length; i++) {
                    var index = PINGED.indexOf(PING_BACKS[i])
                    if (index >= 0) PINGED.splice(index, 1)
                }

                // drop them using "instructor_gone" ans "student_gone"
                // (don't exclude)
                for (var i = 0; i < PINGED.length; i++) {
                    var name = PINGED[i]
                    var index1 = instructors.indexOf(name)
                    var index2 = students.indexOf(name)
                    if (index1 >= 0) {
                        session.publish("api:instructor_gone", [],
                                        {user_id: name}, {exclude_me: false})
                    }
                    if (index2 >= 0) {
                        session.publish("api:student_gone", [],
                                        {user_id: name}, {exclude_me: false})
                    }
                }
            }

            // send a new ping to the new list of users
            PINGED = []
            PING_BACKS = []
            for (var i = 0; i < instructors.length; i++) {
                PINGED.push(instructors[i])
            }
            for (var i = 0; i < students.length; i++) {
                PINGED.push(students[i])
            }

            session.publish("api:ping")
            console.log("Ping sent")
        }
    } else {
        console.error("Wanted to send ping, but the session is closed :(")
    }
}

console.log("Server listening on http://localhost:9001/")
// wait 2 seconds before attempting to connect to Autobahn
setTimeout(function() {
    connection.open()
}, 2000)
