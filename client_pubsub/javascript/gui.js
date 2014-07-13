var GUI = GUI || {}

GUI.GUI = function() {
    var INTERFACE = {}
    var user_id

    btn_start_split = $("#start_split_mode")
    btn_stop_split = $("#end_split_mode")
    btn_start_broadcast = $("#start_broadcasting")
    btn_stop_broadcast = $("#stop_broadcasting")
    div_countdown = $("#countdown_container")

    var redraw_list = function(element, list, omitted_element) {
        // not every browser supports default arguments in JavaScript, so these
        // three lines are shamelessly borrowed from MDN:
        // https://developer.mozilla.org/
        //               en-US/docs/Web/JavaScript/Reference/default_parameters
        omitted_element = (typeof omitted_element !== 'undefined')
                           ? omitted_element
                           : "";

        var el = $(element)
        el.empty()

        $.each(list, function(index, value) {
            // easy omitting unwanted element (like current user's id)
            if (value !== omitted_element) {
                el.append("<li>" + value + "</li>")
            }
        })
    }

    function add_video_element(el, id, v_class, src, muted) {
        var video = $("<video>")
        video.prop("autoplay", true)
        video.prop("id", id)
        video.prop("class", v_class)
        video.prop("src", src)
        video.prop("muted", muted)
        video.prop("poster", "/img/white-noise-640x480.jpg")
        $(el).append(video)
    }

    INTERFACE.init = function() {
        $("#user_id").text("Not connected")
    }

    INTERFACE.onStateChange = function(state, state_data) {
        switch (state) {
            case STATE.NOTHING:
                btn_start_split.attr("disabled", false)
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", false)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.hide()
                // we should clear streams when there's nothing to show
                $("#local_stream").empty()
                $("#remote_streams").empty()
                break

            case STATE.BROADCASTING:
                broadcaster = state_data.broadcaster
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", true)
                // we want to prevent other instructors from ending
                // broadcaster's broadcast.  And causing lots of errors…
                btn_start_split.attr("disabled",
                                     broadcaster === user_id ? false : true)
                btn_stop_broadcast.attr("disabled",
                                        broadcaster === user_id ? false : true)
                div_countdown.hide()
                break

            case STATE.SMALL_GROUPS:
                initializer = state_data.initializer
                btn_start_split.attr("disabled", true)
                // we want to prevent other instructors from ending
                // groups discussions started by other instructor
                btn_stop_split.attr("disabled",
                                    initializer === user_id ? false : true)
                btn_start_broadcast.attr("disabled", true)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.hide()
                break

            case STATE.COUNTDOWN:
                btn_start_split.attr("disabled", true)
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", true)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.show()
                break

            default:
                btn_start_split.attr("disabled", true)
                btn_stop_split.attr("disabled", true)
                btn_start_broadcast.attr("disabled", true)
                btn_stop_broadcast.attr("disabled", true)
                div_countdown.hide()
        }
    }

    INTERFACE.onUpdateUserId = function(id) {
        user_id = id
        $("#user_id").text(user_id)
    }

    INTERFACE.onUpdateStudents = function(students) {
        redraw_list("#students_list", students, user_id)
    }

    INTERFACE.onUpdateInstructors = function(instructors) {
        redraw_list("#instructors_list", instructors, user_id)
    }

    INTERFACE.onStartBroadcasting = function(start_broadcast_callback) {
        btn_start_broadcast.click(function() {
            start_broadcast_callback(
                function(stream) {
                    console.log("User media access granted")
                    var src = URL.createObjectURL(stream)
                    add_video_element("#local_stream", "video_" + user_id,
                                      "local-stream original-size", src, true)
                },
                function(error) {
                    console.error("Can't access user media!", error)
                }
            )
        })
    }

    INTERFACE.onStopBroadcasting = function(stop_broadcast_callback) {
        btn_stop_broadcast.click(function() {
            stop_broadcast_callback()
            $("#video_" + user_id).remove()
        })
    }

    INTERFACE.onIncomingCall = function(stream, call) {
        // 1. get properties from `call` object (PeerJS MediaConnection)
        var src = URL.createObjectURL(stream)
        // 2. add the video somewhere
        add_video_element("#remote_streams", "video_" + call.peer,
                          "remote-stream medium-size", src, false)

        // AM I CRAZY?! this might need to be moved out from here, back to
        // `pitt.js`
        call.on("close", function() {
            console.log("PeerJS MediaConnection closed, call with:",
                        call.peer)
            $("#video_" + call.peer).remove()
        })
        call.on("error", function(error) {
            console.error("PeerJS MediaConnection ERROR!", error)
            $("#video_" + call.peer).remove()
        })
    }

    INTERFACE.onSplitStudents = function(split_mode_callback) {
        btn_start_split.click(function() {
            size = $("#split_size").val()
            split_mode_callback(size)
        })
    }

    INTERFACE.onBackToBroadcast = function(countdown_callb, stop_split_callb) {
        btn_stop_split.click(function() {
            stop_split_callb()
        })
    }

    INTERFACE.onUpdateStudentsInRoom = function(students) {
        redraw_list("#room_peers_list", students, user_id)
    }

    return INTERFACE
}