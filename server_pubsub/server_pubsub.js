#!/usr/bin/env node

var express = require('express')
var autobahn = require('autobahn')
var PeerServer = require('peer').PeerServer

var app = express()
var peer_server = new PeerServer({port: 9000})

app.use('/', express.static(__dirname + '/../client_pubsub'));
app.listen(9001);

var connection = new autobahn.Connection({
    url: "ws://localhost:8080/ws",
    realm: "peerinstruction"
})

var students = []
var instructors = []
var rooms = {}  // rooms contain arrays of students
var students_rooms = {}  // student->room relation
// for example, when rooms["room1"] = Array("student1", "student2")
// then students_rooms["student1"] = "room1" and
// students_rooms["student2"] = "room1"

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

connection.onopen = function(session) {
    console.log("Autobahn connection opened.")

    // now instead of writing `com.peerinstruction.method` simply use
    // `api:method`
    session.prefix("api", "com.peerinstruction")

    // when a new student arrives, add them to the array and redraw DOM list
    session.subscribe("api:new_student", function(args, kwargs, details) {
        console.log("Event: new_student")
        index = students.indexOf(kwargs["user_id"])
        if (index == -1)
            students.push(kwargs["user_id"])

        // TODO: if STATE.SMALL_GROUPS, join the student in some room...
    })

    // when student leaves, remove them from the array and redraw DOM list
    session.subscribe("api:student_gone", function(args, kwargs, details) {
        console.log("Event: student_gone")

        // remove 1 element starting at index of the leaving user
        index = students.indexOf(kwargs["user_id"])
        if (index != -1) students.splice(index, 1)
    })

    // when a new instructor arrives, add them to the array and redraw DOM list
    session.subscribe("api:new_instructor", function(args, kwargs, details) {
        console.log("Event: new_instructor")
        index = instructors.indexOf(kwargs["user_id"])
        if (index == -1)
            instructors.push(kwargs["user_id"])
    })

    // when instructor leaves, remove them from the array and redraw DOM list
    session.subscribe("api:instructor_gone", function(args, kwargs, details) {
        console.log("Event: instructor_gone")

        id = kwargs["user_id"]

        // remove 1 element starting at index of the leaving user
        index = instructors.indexOf(id)
        if (index != -1) instructors.splice(index, 1)

        // corner case: broadcaster's leaving without changing state
        if (state == STATE.BROADCASTING && state_data.broadcaster == id) {
            session.publish("api:state_changed", [STATE.NOTHING], {},
                            {exclude_me: false})  // let the server receive it,
                                                  // too
        }
    })

    // simple RPC for newcomers
    session.register("api:get_current_state", function(args, kwargs, details) {
        console.log("Event: receive application's current state")
        return {
            students: students,
            instructors: instructors,
            state: state,
            state_data: state_data
        }
    })

    session.subscribe("api:state_changed", function(args, kwargs, details) {
        state = args[0]
        console.log("State changed: ", state)
        state_data = kwargs
    })

    // first step to split students into smaller groups is to initialize
    // split-mode - via this RPC command
    session.register("api:init_split_mode", function(args, kwargs, details) {
        // in worst case (odd number of students) there's one student without
        // peers
        var students_per_room = parseInt(kwargs["size"] || 2, 10)

        console.log("Event: some instructor initialized split mode with the" +
                    " size of", students_per_room)

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
            console.log("There's too few students to split into more than " +
                        "one group.  The split size was changed.")
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

    // students willing to get information about their room call this procedure
    session.register("api:get_room_information",
        function(args, kwargs, details) {
            console.log("Event: some student wants to know their room")

            user_id = kwargs["user_id"]
            result = rooms[ students_rooms[user_id] ]
            if (result) return result
            else return false;
        }
    )
}

console.log("Server listening on http://localhost:9001/")
connection.open()
