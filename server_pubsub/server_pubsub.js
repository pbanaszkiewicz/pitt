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

var students = new Array()
var instructors = new Array()
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
var state = STATE.NOTHING;

connection.onopen = function(session) {
    console.log("Autobahn connection opened.")

    // now instead of writing `com.peerinstruction.method` simply use
    // `api:method`
    session.prefix("api", "com.peerinstruction")

    // when a new student arrives, add them to the array and redraw DOM list
    session.subscribe("api:new_student", function(args, kwargs, details) {
        console.log("Event: new_student")
        idx = students.indexOf(kwargs["user_id"])
        if (idx == -1)
            students.push(kwargs["user_id"])
    })

    // when student leaves, remove them from the array and redraw DOM list
    session.subscribe("api:student_gone", function(args, kwargs, details) {
        console.log("Event: student_gone")

        // remove 1 element starting at index of the leaving user
        idx = students.indexOf(kwargs["user_id"])
        if (idx != -1) students.splice(idx, 1)
    })

    // when a new instructor arrives, add them to the array and redraw DOM list
    session.subscribe("api:new_instructor", function(args, kwargs, details) {
        console.log("Event: new_instructor")
        idx = instructors.indexOf(kwargs["user_id"])
        if (idx == -1)
            instructors.push(kwargs["user_id"])
    })

    // when instructor leaves, remove them from the array and redraw DOM list
    session.subscribe("api:instructor_gone", function(args, kwargs, details) {
        console.log("Event: instructor_gone")

        // remove 1 element starting at index of the leaving user
        idx = instructors.indexOf(kwargs["user_id"])
        if (idx != -1) instructors.splice(idx, 1)
    })

    // two simple RPCs for newcomers
    session.register("api:get_students_list", function(args, kwargs, details) {
        console.log("Event: receive students list via RPC")
        return students
    })
    session.register("api:get_instructors_list", function(args, kwargs, details) {
        console.log("Event: receive instructors list via RPC")
        return instructors
    })
    // and one RPC to get the current mode of the service
    session.register("api:get_working_mode", function(args, kwargs, details) {
        console.log("Event: receive currently operating mode")
        return state
    })

    session.register("api:get_current_state", function(args, kwargs, details) {
        console.log("Event: receive application's current state")
        return {
            students: students,
            instructors: instructors,
            state: state
        }
    })

    // first step to split students into smaller groups is to initialize
    // split-mode - via this RPC command
    session.register("api:init_split_mode", function(args, kwargs, details) {
        console.log("Event: some instructor initialized split mode with the size of",
                    kwargs["size"])
        if (state == STATE.SMALL_GROUPS)
            throw new autobahn.Error("api:mode_change_error")

        state = STATE.SMALL_GROUPS

        // in worst case (odd number of students) there's one student without
        // peers
        var students_per_room = kwargs["size"] || 2

        // put students into rooms
        rooms = {}
        students_rooms = {}
        students_count = students.length
        var j = 0
        for (var i = 0; i < students_count; i += students_per_room) {
            rooms["room" + j] = students.slice(i, i + students_per_room)

            // save student and corresponding room in students_rooms
            for (var k = i; k < i + students_per_room; k++) {
                student = students[k]
                students_rooms[student] = "room" + j
            }

            j++
        }

        // if in the last room there's only one student, move them to the
        // precedent room
        if (rooms["room" + (j - 1)].length == 1) {
            lone_student = rooms["room" + (j - 1)].pop()
            rooms["room" + (j - 2)].push(lone_student)
            students_rooms[lone_student] = "room" + (j - 2)
        }

        // announce split mode to every peer (including instructors)
        session.publish("api:split_mode_enabled")
        session.publish("api:mode_changed", [state], {state: state})

        return state  // state is 1, 2 or 3, if we get 0 then it means errors
    })

    // any instructor is allowed to deactivate split-mode by simply invoking
    // this RPC command
    session.register("api:end_split_mode", function(args, kwargs, details) {
        console.log("Event: some instructor ended split mode")
        // TODO: check if the mode hasn't been disabled before

        state = STATE.BROADCASTING
        rooms = {}
        students_rooms = {}

        // announce end of split mode to every peer (including instructors)
        session.publish("api:split_mode_disabled")
        session.publish("api:mode_changed", [state], {state: state})

        return state  // state is 2 or 3, if we get 0 then it means errors
    })

    session.register("api:get_room_information", function(args, kwargs, details) {
        console.log("Event: some student wants to know their room")

        user_id = kwargs["user_id"]
        result = rooms[ students_rooms[user_id] ]
        if (result) return result
        else return false;

        // room_names = Object.keys(rooms)
        // for (var i = 0; i < room_names.length; i++) {
        //     room = room_names[i]
        //     if (rooms[room].indexOf(user_id) != -1) {
        //         return rooms[room]
        //     }
        // }
        // return false
    })
}

console.log("Server listening on http://localhost:9001/")
connection.open()
